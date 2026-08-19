/**
 * Integration tests over a REAL TCP socket (no mocks): the simulator is the
 * contract the protocol client (#14) will be developed against, so these tests
 * pin the behaviors that contract depends on.
 */
import net from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { GrblSimulator } from '../src/sim/grblSimulator.js';

class TestClient {
  private buffer = '';
  readonly lines: string[] = [];
  private waiters: Array<() => void> = [];

  private constructor(private readonly socket: net.Socket) {}

  static async connect(port: number): Promise<TestClient> {
    const socket = net.connect({ port, host: '127.0.0.1', noDelay: true });
    await new Promise<void>((resolve, reject) => {
      socket.once('connect', resolve);
      socket.once('error', reject);
    });
    const client = new TestClient(socket);
    socket.on('data', (d) => client.onData(d.toString('utf8')));
    return client;
  }

  private onData(chunk: string): void {
    this.buffer += chunk;
    let i;
    while ((i = this.buffer.indexOf('\n')) !== -1) {
      const line = this.buffer.slice(0, i).replace(/\r$/, '');
      this.buffer = this.buffer.slice(i + 1);
      if (line.length > 0) this.lines.push(line);
    }
    this.waiters.forEach((w) => w());
    this.waiters = [];
  }

  send(text: string): void {
    this.socket.write(text);
  }

  /** Wait until some received line matches, or time out. */
  async waitFor(pattern: RegExp, timeoutMs = 2000): Promise<string> {
    const started = Date.now();
    for (;;) {
      const hit = this.lines.find((l) => pattern.test(l));
      if (hit) return hit;
      if (Date.now() - started > timeoutMs) {
        throw new Error(`Timed out waiting for ${pattern}. Got: ${JSON.stringify(this.lines)}`);
      }
      await new Promise<void>((resolve) => {
        const t = setTimeout(resolve, 25);
        this.waiters.push(() => {
          clearTimeout(t);
          resolve();
        });
      });
    }
  }

  countOk(): number {
    return this.lines.filter((l) => l === 'ok').length;
  }

  close(): void {
    this.socket.destroy();
  }
}

describe('GrblSimulator', () => {
  let sim: GrblSimulator;
  let client: TestClient;

  afterEach(async () => {
    client?.close();
    await sim?.close();
  });

  async function boot(options = {}): Promise<void> {
    sim = new GrblSimulator(options);
    const port = await sim.listen();
    client = await TestClient.connect(port);
    await client.waitFor(/^Grbl 1\.1f/);
  }

  it('greets with the GRBL welcome banner on connect', async () => {
    await boot();
    expect(client.lines[0]).toMatch(/^Grbl 1\.1f \['\$' for help\]$/);
  });

  it('acks each processed line with ok', async () => {
    await boot();
    client.send('G21\nG90\n');
    await client.waitFor(/^ok$/);
    const started = Date.now();
    while (client.countOk() < 2 && Date.now() - started < 2000) {
      await new Promise((r) => setTimeout(r, 10));
    }
    expect(client.countOk()).toBe(2);
  });

  it('answers ? with a status report, out of band', async () => {
    await boot();
    client.send('?');
    const status = await client.waitFor(/^<Idle\|MPos:/);
    expect(status).toMatch(/^<Idle\|MPos:0\.000,0\.000,0\.000\|FS:0,0>$/);
  });

  it('tracks motion targets in the status report', async () => {
    await boot();
    client.send('G0 X10.5 Y20\n');
    await client.waitFor(/^ok$/);
    client.send('?');
    await client.waitFor(/^<Idle\|MPos:10\.500,20\.000/);
  });

  it('dumps settings on $$ (the client reads $30/$32 from here)', async () => {
    await boot();
    client.send('$$\n');
    await client.waitFor(/^ok$/);
    expect(client.lines).toContain('$30=1000');
    expect(client.lines).toContain('$32=1');
  });

  it('feed-holds on ! and only resumes on ~', async () => {
    await boot({ processingDelayMs: 30 });
    client.send('!');
    await new Promise((r) => setTimeout(r, 20));
    client.send('G1 X5 F500\n');
    // Held: the queued line must NOT be acked.
    await new Promise((r) => setTimeout(r, 150));
    expect(client.countOk()).toBe(0);
    client.send('~');
    await client.waitFor(/^ok$/);
    expect(client.countOk()).toBe(1);
  });

  it('soft-resets on 0x18: drops the queue and re-greets', async () => {
    await boot({ processingDelayMs: 50 });
    let dropped = -1;
    sim.on('reset', (info: { dropped: number }) => (dropped = info.dropped));
    client.send('G1 X1 F500\nG1 X2 F500\nG1 X3 F500\n');
    client.send('\x18');
    // The banner already appeared once at connect — wait for the SECOND one.
    const started = Date.now();
    while (
      client.lines.filter((l) => /^Grbl 1\.1f/.test(l)).length < 2 &&
      Date.now() - started < 2000
    ) {
      await new Promise((r) => setTimeout(r, 10));
    }
    expect(client.lines.filter((l) => /^Grbl 1\.1f/.test(l))).toHaveLength(2);
    // At most the line already being processed acked; the rest were dropped.
    expect(dropped).toBeGreaterThan(0);
    // The controller still works after reset.
    client.send('G90\n');
    await client.waitFor(/^ok$/);
  });

  it('raises overflow when a sender ignores the 128-byte RX budget', async () => {
    await boot({ processingDelayMs: 100 });
    let overflowed = false;
    sim.on('overflow', () => (overflowed = true));
    // 5 lines * 40 bytes = 200 bytes shoved in with zero flow control.
    const line = 'G1 X123.456 Y789.012 F1500 ; padpadpad\n';
    client.send(line.repeat(5));
    await new Promise((r) => setTimeout(r, 100));
    expect(overflowed).toBe(true);
  });

  it('never overflows for a compliant character-counting sender', async () => {
    await boot({ processingDelayMs: 5 });
    let overflowed = false;
    sim.on('overflow', () => (overflowed = true));

    const lines = Array.from({ length: 40 }, (_, i) => `G1 X${i} Y${i} F1000\n`);
    const RX = 128;
    const inFlight: number[] = [];
    let acked = 0;
    for (const l of lines) {
      // Character-counting: block while the line wouldn't fit in the RX budget.
      for (;;) {
        while (client.countOk() > acked) {
          acked += 1;
          inFlight.shift();
        }
        const used = inFlight.reduce((a, b) => a + b, 0);
        if (used + l.length <= RX) break;
        await new Promise((r) => setTimeout(r, 5));
      }
      inFlight.push(l.length);
      client.send(l);
    }
    const started = Date.now();
    while (client.countOk() < lines.length && Date.now() - started < 5000) {
      await new Promise((r) => setTimeout(r, 10));
    }
    expect(client.countOk()).toBe(lines.length);
    expect(overflowed).toBe(false);
  });

  it('rejects a second concurrent connection instead of corrupting the ack stream', async () => {
    await boot();
    const second = net.connect({ port: sim.port, host: '127.0.0.1' });
    await new Promise<void>((resolve) => second.once('close', () => resolve()));
    expect(second.destroyed).toBe(true);
  });

  it('injects errors on demand (failNext)', async () => {
    await boot();
    sim.failNext('G1 X99 F100', 20);
    client.send('G1 X99 F100\n');
    const err = await client.waitFor(/^error:/);
    expect(err).toBe('error:20');
  });
});
