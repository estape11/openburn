/**
 * GRBL 1.1 simulator over a real TCP socket.
 *
 * Exists so everything network-facing is testable without a laser: the
 * protocol client (#14) is developed and CI-tested against this, and
 * `npm run sim` serves it for hardware-less UI development.
 *
 * It deliberately models the parts of GRBL that senders get wrong:
 * - the 128-byte RX buffer (a sender that overflows it corrupts commands on
 *   real hardware; here it raises an `overflow` event tests can assert on),
 * - realtime bytes intercepted mid-stream, out of band of the line queue,
 * - `ok` responses that arrive per *processed* line, not per received byte.
 *
 * Kept independent from the protocol client on purpose (issue #13): a
 * simulator written against the client under test would be self-confirming.
 */
import { EventEmitter } from 'node:events';
import net from 'node:net';

export interface GrblSimulatorOptions {
  /** TCP port; 0 (default) picks an ephemeral one — read it from `port` after listen(). */
  port?: number;
  /** Serial RX ring size the firmware would have. GRBL AVR: 128. */
  rxBufferSize?: number;
  /** Per-line processing delay, to make streaming windows observable in tests. */
  processingDelayMs?: number;
  /** Welcome banner version string. */
  version?: string;
  /** `$$` settings dump. Keys without `$`. */
  settings?: Record<number, number>;
}

type MachineState = 'Idle' | 'Run' | 'Hold' | 'Alarm';

const REALTIME = {
  STATUS: 0x3f, // ?
  HOLD: 0x21, // !
  RESUME: 0x7e, // ~
  RESET: 0x18, // Ctrl-X
  JOG_CANCEL: 0x85,
} as const;

const DEFAULT_SETTINGS: Record<number, number> = {
  30: 1000, // max spindle/laser value (S scale)
  32: 1, // laser mode
  110: 5000, // X max rate mm/min
  111: 5000, // Y max rate
  120: 500, // X accel mm/s^2
  121: 500, // Y accel
  130: 400, // X max travel mm
  131: 400, // Y max travel
};

export class GrblSimulator extends EventEmitter {
  private readonly server: net.Server;
  private readonly opts: Required<GrblSimulatorOptions>;
  private socket: net.Socket | null = null;

  /** Bytes currently "in the RX ring": queued lines + the partial line. */
  private rxUsed = 0;
  private partial = '';
  private queue: string[] = [];
  private processing = false;
  private state: MachineState = 'Idle';
  private pos = { x: 0, y: 0 };
  private forcedErrors = new Map<string, number>();

  constructor(options: GrblSimulatorOptions = {}) {
    super();
    this.opts = {
      port: options.port ?? 0,
      rxBufferSize: options.rxBufferSize ?? 128,
      processingDelayMs: options.processingDelayMs ?? 0,
      version: options.version ?? '1.1f',
      settings: options.settings ?? DEFAULT_SETTINGS,
    };
    this.server = net.createServer((socket) => this.onConnection(socket));
  }

  async listen(): Promise<number> {
    await new Promise<void>((resolve, reject) => {
      this.server.once('error', reject);
      this.server.listen(this.opts.port, '127.0.0.1', resolve);
    });
    return this.port;
  }

  get port(): number {
    const addr = this.server.address();
    if (addr === null || typeof addr === 'string') throw new Error('Simulator is not listening');
    return addr.port;
  }

  async close(): Promise<void> {
    this.socket?.destroy();
    await new Promise<void>((resolve) => this.server.close(() => resolve()));
  }

  /** Make the next occurrence of `command` answer `error:<code>` instead of `ok`. */
  failNext(command: string, errorCode: number): void {
    this.forcedErrors.set(command.trim().toUpperCase(), errorCode);
  }

  /** Push an asynchronous alarm, like a limit switch would. */
  triggerAlarm(code: number): void {
    this.state = 'Alarm';
    this.write(`ALARM:${code}\r\n`);
  }

  private onConnection(socket: net.Socket): void {
    // Real controllers serve one sender; a second connection corrupts the ok
    // count. Refuse it loudly instead of interleaving silently.
    if (this.socket && !this.socket.destroyed) {
      socket.end();
      this.emit('rejected-connection');
      return;
    }
    this.socket = socket;
    socket.setNoDelay(true);
    socket.on('data', (data) => this.onData(data));
    socket.on('error', () => socket.destroy());
    socket.on('close', () => {
      if (this.socket === socket) this.socket = null;
    });
    this.write(`\r\nGrbl ${this.opts.version} ['$' for help]\r\n`);
  }

  private onData(data: Buffer): void {
    for (const byte of data) {
      // Realtime bytes are intercepted wherever they appear — including in the
      // middle of a line — exactly like the firmware's RX interrupt.
      if (this.handleRealtime(byte)) continue;

      if (this.rxUsed >= this.opts.rxBufferSize) {
        // The real ring buffer silently drops bytes here, which corrupts the
        // current command. A correct sender must never reach this branch.
        this.emit('overflow', { rxUsed: this.rxUsed });
        continue;
      }
      this.rxUsed += 1;

      const ch = String.fromCharCode(byte);
      if (ch === '\n' || ch === '\r') {
        if (this.partial.length > 0) {
          this.queue.push(this.partial);
          this.partial = '';
          // Observability for protocol tests: how full is the ring when a line
          // lands? A streaming sender shows several lines here; a naive
          // send-response sender never exceeds one.
          this.emit('queued', { rxUsed: this.rxUsed, depth: this.queue.length });
          void this.drain();
        } else {
          this.rxUsed -= 1; // bare CR/LF costs nothing, as in the firmware parser
        }
        continue;
      }
      this.partial += ch;
    }
  }

  private handleRealtime(byte: number): boolean {
    switch (byte) {
      case REALTIME.STATUS:
        this.write(this.statusReport());
        return true;
      case REALTIME.HOLD:
        if (this.state === 'Run' || this.state === 'Idle') this.state = 'Hold';
        return true;
      case REALTIME.RESUME:
        if (this.state === 'Hold') {
          this.state = this.queue.length > 0 ? 'Run' : 'Idle';
          void this.drain();
        }
        return true;
      case REALTIME.RESET: {
        // Soft reset: everything in flight is gone, no acks for it will come.
        const dropped = this.queue.length + (this.partial ? 1 : 0);
        this.queue = [];
        this.partial = '';
        this.rxUsed = 0;
        this.state = 'Idle';
        this.emit('reset', { dropped });
        this.write(`\r\nGrbl ${this.opts.version} ['$' for help]\r\n`);
        return true;
      }
      case REALTIME.JOG_CANCEL:
        this.queue = this.queue.filter((l) => !l.startsWith('$J='));
        return true;
      default:
        return false;
    }
  }

  private async drain(): Promise<void> {
    if (this.processing) return;
    this.processing = true;
    try {
      while (this.queue.length > 0) {
        if (this.state === 'Hold' || this.state === 'Alarm') return;
        this.state = 'Run';
        const line = this.queue[0] as string;
        if (this.opts.processingDelayMs > 0) {
          await new Promise((r) => setTimeout(r, this.opts.processingDelayMs));
        }
        // The line leaves the ring only when the parser consumes it — this is
        // the accounting the character-counting protocol relies on (+1 = EOL).
        this.queue.shift();
        this.rxUsed -= line.length + 1;
        this.emit('line', line);
        this.respond(line);
      }
      if (this.state === 'Run') this.state = 'Idle';
    } finally {
      this.processing = false;
    }
  }

  private respond(rawLine: string): void {
    const line = rawLine.trim();
    const upper = line.toUpperCase();

    const forced = this.forcedErrors.get(upper);
    if (forced !== undefined) {
      this.forcedErrors.delete(upper);
      this.write(`error:${forced}\r\n`);
      return;
    }

    if (upper === '$$') {
      for (const [k, v] of Object.entries(this.opts.settings)) {
        this.write(`$${k}=${v}\r\n`);
      }
      this.write('ok\r\n');
      return;
    }

    if (upper === '$X') {
      this.state = 'Idle';
      this.write('ok\r\n');
      return;
    }

    // Track motion targets so `?` reports something meaningful.
    const x = /X(-?\d+(?:\.\d+)?)/i.exec(line);
    const y = /Y(-?\d+(?:\.\d+)?)/i.exec(line);
    if (x?.[1]) this.pos.x = parseFloat(x[1]);
    if (y?.[1]) this.pos.y = parseFloat(y[1]);

    this.write('ok\r\n');
  }

  private statusReport(): string {
    const p = (n: number) => n.toFixed(3);
    return `<${this.state}|MPos:${p(this.pos.x)},${p(this.pos.y)},0.000|FS:0,0>\r\n`;
  }

  private write(text: string): void {
    if (this.socket && !this.socket.destroyed) this.socket.write(text);
  }
}
