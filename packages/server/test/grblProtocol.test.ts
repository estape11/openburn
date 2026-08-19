/**
 * GrblProtocol against the simulator over a REAL TCP socket. The simulator
 * enforces the 128-byte RX ring and raises `overflow` if the client breaks the
 * character-counting contract — that event failing the test IS the point of
 * having built the simulator first.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { GrblProtocol } from '../src/grbl/protocol.js';
import { GrblSimulator } from '../src/sim/grblSimulator.js';
import { TcpTransport } from '../src/transport/tcpTransport.js';

let sim: GrblSimulator;
let protocol: GrblProtocol;
let overflowed: boolean;

async function boot(simOptions = {}): Promise<void> {
  sim = new GrblSimulator(simOptions);
  overflowed = false;
  sim.on('overflow', () => (overflowed = true));
  const port = await sim.listen();
  protocol = new GrblProtocol(new TcpTransport({ host: '127.0.0.1', port, connectAttempts: 1 }));
  await protocol.open();
}

afterEach(async () => {
  await protocol?.close();
  await sim?.close();
});

const gline = (i: number) => `G1 X${i}.5 Y${i * 2} F1200`;

describe('GrblProtocol.open', () => {
  it('detects the dialect/version and reads $$ settings', async () => {
    await boot();
    expect(protocol.dialect).toBe('grbl');
    expect(protocol.version).toBe('1.1f');
    expect(protocol.settings.get(30)).toBe(1000);
    expect(protocol.settings.get(32)).toBe(1);
    expect(protocol.settings.get(130)).toBe(400);
  });
});

describe('immediate lines', () => {
  it('sendLine resolves on ok and rejects with the GRBL code on error', async () => {
    await boot();
    await expect(protocol.sendLine('G21')).resolves.toBeUndefined();
    sim.failNext('G1 X99 F100', 20);
    await expect(protocol.sendLine('G1 X99 F100')).rejects.toThrow(/error:20/);
  });
});

describe('job streaming (character-counting)', () => {
  it('streams a 60-line job to completion without ever overflowing the RX ring', async () => {
    await boot({ processingDelayMs: 2 });
    const lines = Array.from({ length: 60 }, (_, i) => gline(i));
    const progress: number[] = [];
    protocol.on('progress', (p) => progress.push(p.acked));

    const result = await protocol.startJob(lines);

    expect(result).toEqual({ ok: true });
    expect(overflowed).toBe(false);
    expect(progress.at(-1)).toBe(60);
    // Progress is strictly monotonic — no double-acks, no gaps.
    expect(progress).toEqual(Array.from({ length: 60 }, (_, i) => i + 1));
  });

  it('keeps the planner fed: multiple lines are in flight at once', async () => {
    await boot({ processingDelayMs: 20 });
    // 6 short lines fit the 128-byte budget together, so the ring should hold
    // several of them at once. A send-response sender never has depth > 1 —
    // that is exactly the stutter this streamer exists to avoid.
    let maxDepth = 0;
    sim.on('queued', ({ depth }: { depth: number }) => (maxDepth = Math.max(maxDepth, depth)));
    const result = await protocol.startJob(Array.from({ length: 6 }, (_, i) => `G1 X${i} F600`));
    expect(result.ok).toBe(true);
    expect(overflowed).toBe(false);
    expect(maxDepth).toBeGreaterThan(2);
  });

  it('aborts on error:N reporting the exact failing line, and stops feeding', async () => {
    await boot({ processingDelayMs: 2 });
    const lines = Array.from({ length: 30 }, (_, i) => gline(i));
    sim.failNext(gline(4), 33);

    const result = await protocol.startJob(lines);

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('error');
    expect(result.errorCode).toBe(33);
    expect(result.failedLineIndex).toBe(4);
    expect(result.failedLine).toBe(gline(4));
  });

  it('hold pauses progress; resume finishes the job', async () => {
    await boot({ processingDelayMs: 10 });
    const jobPromise = protocol.startJob(Array.from({ length: 10 }, (_, i) => gline(i)));
    protocol.hold();
    await new Promise((r) => setTimeout(r, 200));
    let progressDuringHold = 0;
    protocol.on('progress', () => progressDuringHold++);
    await new Promise((r) => setTimeout(r, 150));
    expect(progressDuringHold).toBe(0); // held: nothing moves
    protocol.resume();
    const result = await jobPromise;
    expect(result.ok).toBe(true);
    expect(overflowed).toBe(false);
  });

  it('reset tears down the job and the ledger; a new job runs cleanly after', async () => {
    await boot({ processingDelayMs: 30 });
    const first = protocol.startJob(Array.from({ length: 20 }, (_, i) => gline(i)));
    await new Promise((r) => setTimeout(r, 60));
    protocol.reset();
    const firstResult = await first;
    expect(firstResult.ok).toBe(false);
    expect(firstResult.reason).toBe('reset');

    // Wait for the re-greet, then the ledger must be clean enough to run again.
    await new Promise((r) => setTimeout(r, 100));
    const second = await protocol.startJob(['G21', 'G90', 'G1 X1 F600']);
    expect(second).toEqual({ ok: true });
    expect(overflowed).toBe(false);
  });

  it('a dropped connection fails the job as connection-lost, never hangs', async () => {
    await boot({ processingDelayMs: 50 });
    const jobPromise = protocol.startJob(Array.from({ length: 20 }, (_, i) => gline(i)));
    await new Promise((r) => setTimeout(r, 60));
    await sim.close(); // network gone
    const result = await jobPromise;
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('connection-lost');
  });
});

describe('status', () => {
  it('polls ? and emits parsed reports with machine position', async () => {
    await boot();
    await protocol.sendLine('G0 X12.5 Y7');
    const status = await new Promise<{ state: string; mpos: { x: number; y: number } }>(
      (resolve) => {
        protocol.once('status', resolve);
        protocol.startStatusPolling(20);
      },
    );
    protocol.stopStatusPolling();
    expect(status.state).toBe('Idle');
    expect(status.mpos.x).toBe(12.5);
    expect(status.mpos.y).toBe(7);
  });
});
