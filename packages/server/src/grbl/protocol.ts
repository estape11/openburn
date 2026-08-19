/**
 * GRBL 1.1 protocol client over a Transport.
 *
 * The load-bearing part is the character-counting streamer: GRBL acks one `ok`
 * (or `error:N`) per line it CONSUMES, and its serial RX ring holds 128 bytes.
 * We keep a FIFO of the byte lengths of every un-acked line and only write the
 * next line while `inFlight + line + EOL ≤ budget`. That keeps the planner fed
 * (no stutter on short segments) without ever overflowing the ring (which on
 * real hardware corrupts commands silently).
 *
 * Realtime bytes (`?`, `!`, `~`, 0x18, 0x85) bypass the queue AND the budget —
 * the firmware handles them in the RX interrupt without buffering them.
 * Caveat over TCP: they cannot overtake bytes already written to the socket,
 * which is one more reason the budget stays small.
 */
import { EventEmitter } from 'node:events';
import type { Transport } from '../transport/transport.js';

export type GrblDialect = 'grbl' | 'grblhal' | 'fluidnc';

export interface GrblStatus {
  state: string; // Idle | Run | Hold:0 | Alarm | ...
  mpos: { x: number; y: number; z: number };
}

export interface JobProgress {
  acked: number;
  total: number;
}

export interface JobResult {
  ok: boolean;
  /** Set when the job stopped early. */
  reason?: 'error' | 'reset' | 'connection-lost';
  /** For reason 'error': the failing line and GRBL's error code. */
  errorCode?: number;
  failedLine?: string;
  failedLineIndex?: number;
}

interface GrblProtocolEvents {
  status: [GrblStatus];
  alarm: [number];
  progress: [JobProgress];
  /** Every raw line from the controller, for the console UI. */
  'console-line': [string];
  close: [];
}

export interface GrblProtocolOptions {
  /** RX ring budget. GRBL AVR ships 128; grblHAL/FluidNC are usually larger
   * but 128 is safe everywhere — make it configurable, default conservative. */
  rxBufferSize?: number;
  /** Timeout waiting for the welcome banner on open(). */
  welcomeTimeoutMs?: number;
}

const WELCOME = /^(?:Grbl|GrblHAL)\s+(\S+)/i;

export class GrblProtocol extends EventEmitter<GrblProtocolEvents> {
  private rxBuffer = '';
  /** Byte lengths (incl. EOL) of sent-but-unacked lines — the streamer's ledger. */
  private pendingLengths: number[] = [];
  /** Resolvers matched 1:1 with pendingLengths, called on ok/error. */
  private pendingAcks: Array<(errorCode: number | null) => void> = [];

  private job: {
    lines: string[];
    next: number;
    acked: number;
    finish: (result: JobResult) => void;
    failed: boolean;
  } | null = null;
  private held = false;

  private pollTimer: NodeJS.Timeout | null = null;
  readonly settings = new Map<number, number>();
  dialect: GrblDialect = 'grbl';
  version = '';

  private readonly rxBudget: number;
  private readonly welcomeTimeoutMs: number;

  constructor(
    private readonly transport: Transport,
    options: GrblProtocolOptions = {},
  ) {
    super();
    this.rxBudget = options.rxBufferSize ?? 128;
    this.welcomeTimeoutMs = options.welcomeTimeoutMs ?? 5000;
    transport.on('data', (chunk) => this.onData(chunk));
    transport.on('close', () => this.onClose());
  }

  /** Connect-level handshake: wait for the banner, identify the dialect, read `$$`. */
  async open(): Promise<void> {
    const welcome = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('No GRBL welcome banner received (is this a GRBL device?)')),
        this.welcomeTimeoutMs,
      );
      const onLine = (line: string): void => {
        const m = WELCOME.exec(line);
        if (!m) return;
        clearTimeout(timer);
        this.off('console-line', onLine);
        this.version = m[1] as string;
        const lower = line.toLowerCase();
        this.dialect = lower.includes('fluidnc')
          ? 'fluidnc'
          : lower.includes('grblhal')
            ? 'grblhal'
            : 'grbl';
        resolve();
      };
      this.on('console-line', onLine);
    });
    await this.transport.connect();
    await welcome;
    await this.readSettings();
  }

  /** `$$` → populate `settings` ($30 S-scale, $32 laser mode, $110/111 rates,
   * $120/121 accels, $130/131 travel). The emitter and estimator consume these. */
  async readSettings(): Promise<ReadonlyMap<number, number>> {
    await this.sendLine('$$');
    return this.settings;
  }

  /** Send one immediate line (console, jog, $ commands) and await its ack.
   * Rejects with the GRBL error code on `error:N`. Not for jobs — use startJob. */
  sendLine(line: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const payload = `${line}\n`;
      this.pendingLengths.push(payload.length);
      this.pendingAcks.push((errorCode) => {
        if (errorCode === null) resolve();
        else reject(new Error(`GRBL error:${errorCode} for "${line}"`));
      });
      this.transport.write(payload);
    });
  }

  /** Stream a whole program with character-counting flow control. Resolves when
   * every line is acked, or earlier with the failure reason. One job at a time. */
  startJob(lines: string[]): Promise<JobResult> {
    if (this.job) return Promise.reject(new Error('A job is already running'));
    return new Promise<JobResult>((resolve) => {
      this.job = { lines, next: 0, acked: 0, finish: resolve, failed: false };
      this.pump();
    });
  }

  get jobActive(): boolean {
    return this.job !== null;
  }

  /** Fill the RX budget with as many whole job lines as fit right now. */
  private pump(): void {
    const job = this.job;
    if (!job || job.failed || this.held) return;
    while (job.next < job.lines.length) {
      const payload = `${job.lines[job.next]}\n`;
      const inFlight = this.pendingLengths.reduce((a, b) => a + b, 0);
      if (inFlight + payload.length > this.rxBudget) return; // budget full — wait for acks
      const index = job.next;
      job.next += 1;
      this.pendingLengths.push(payload.length);
      this.pendingAcks.push((errorCode) => this.onJobAck(index, errorCode));
      this.transport.write(payload);
    }
  }

  private onJobAck(index: number, errorCode: number | null): void {
    const job = this.job;
    if (!job) return;
    if (errorCode !== null) {
      // A rejected line means the program is not running as written. Stop
      // feeding immediately; the operator decides what to do with the machine.
      job.failed = true;
      this.finishJob({
        ok: false,
        reason: 'error',
        errorCode,
        failedLine: job.lines[index] as string,
        failedLineIndex: index,
      });
      return;
    }
    job.acked += 1;
    this.emit('progress', { acked: job.acked, total: job.lines.length });
    if (job.acked === job.lines.length) {
      this.finishJob({ ok: true });
      return;
    }
    this.pump();
  }

  private finishJob(result: JobResult): void {
    const job = this.job;
    if (!job) return;
    this.job = null;
    job.finish(result);
  }

  // ---- realtime commands (bypass queue and budget) ----

  requestStatus(): void {
    this.writeRealtime('?');
  }

  hold(): void {
    this.held = true;
    this.writeRealtime('!');
  }

  resume(): void {
    this.held = false;
    this.writeRealtime('~');
    this.pump();
  }

  jogCancel(): void {
    this.writeRealtime(Buffer.from([0x85]));
  }

  /** Soft reset. The firmware drops everything in flight WITHOUT acking it, so
   * the ledger and any running job are torn down here — forgetting this is the
   * classic post-reset deadlock in naive senders. */
  reset(): void {
    this.writeRealtime(Buffer.from([0x18]));
    this.pendingLengths = [];
    const acks = this.pendingAcks;
    this.pendingAcks = [];
    // Tear the job down BEFORE draining the acks: job acks close over the job
    // and would otherwise report the teardown as a line error instead of
    // 'reset' (found by the reset test — order matters here).
    if (this.job) {
      this.job.failed = true;
      this.finishJob({ ok: false, reason: 'reset' });
    }
    // Non-job acks (sendLine) would otherwise hang forever: reject them.
    for (const ack of acks) ack(-1);
    this.held = false;
  }

  private writeRealtime(data: string | Uint8Array): void {
    this.transport.write(data);
  }

  startStatusPolling(hz = 5): void {
    this.stopStatusPolling();
    this.pollTimer = setInterval(() => {
      if (this.transport.isOpen) this.requestStatus();
    }, 1000 / hz);
  }

  stopStatusPolling(): void {
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = null;
  }

  async close(): Promise<void> {
    this.stopStatusPolling();
    await this.transport.close();
  }

  // ---- receive path ----

  private onData(chunk: Buffer): void {
    this.rxBuffer += chunk.toString('utf8');
    let i;
    while ((i = this.rxBuffer.indexOf('\n')) !== -1) {
      const line = this.rxBuffer.slice(0, i).replace(/\r$/, '').trim();
      this.rxBuffer = this.rxBuffer.slice(i + 1);
      if (line.length > 0) this.onLine(line);
    }
  }

  private onLine(line: string): void {
    this.emit('console-line', line);

    if (line === 'ok') {
      this.ackOldest(null);
      return;
    }
    const error = /^error:(\d+)$/.exec(line);
    if (error) {
      this.ackOldest(parseInt(error[1] as string, 10));
      return;
    }
    const alarm = /^ALARM:(\d+)$/.exec(line);
    if (alarm) {
      this.emit('alarm', parseInt(alarm[1] as string, 10));
      return;
    }
    if (line.startsWith('<') && line.endsWith('>')) {
      const status = parseStatus(line);
      if (status) this.emit('status', status);
      return;
    }
    const setting = /^\$(\d+)=(-?\d+(?:\.\d+)?)$/.exec(line);
    if (setting) {
      this.settings.set(parseInt(setting[1] as string, 10), parseFloat(setting[2] as string));
      return;
    }
    // Welcome banners, [MSG:...], [GC:...] — surfaced via console-line already.
  }

  private ackOldest(errorCode: number | null): void {
    this.pendingLengths.shift();
    const ack = this.pendingAcks.shift();
    ack?.(errorCode);
  }

  private onClose(): void {
    this.stopStatusPolling();
    this.pendingLengths = [];
    const acks = this.pendingAcks;
    this.pendingAcks = [];
    // Job first, then acks — same ordering constraint as reset().
    if (this.job) {
      this.job.failed = true;
      this.finishJob({ ok: false, reason: 'connection-lost' });
    }
    for (const ack of acks) ack(-1);
    this.emit('close');
  }
}

/** `<Idle|MPos:1.000,2.000,0.000|FS:0,0>` → GrblStatus. Exported for tests. */
export function parseStatus(report: string): GrblStatus | null {
  const inner = report.slice(1, -1);
  const [state, ...fields] = inner.split('|');
  if (!state) return null;
  for (const field of fields) {
    if (field.startsWith('MPos:')) {
      const [x, y, z] = field.slice(5).split(',').map(parseFloat);
      return {
        state,
        mpos: { x: x ?? 0, y: y ?? 0, z: z ?? 0 },
      };
    }
  }
  return { state, mpos: { x: 0, y: 0, z: 0 } };
}
