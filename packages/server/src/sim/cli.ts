/**
 * `npm run sim` — GRBL simulator for hardware-less development.
 * Port 2323 by default (23 needs root); override with SIM_PORT.
 */
import { GrblSimulator } from './grblSimulator.js';

const port = Number(process.env['SIM_PORT'] ?? 2323);
const delay = Number(process.env['SIM_DELAY_MS'] ?? 5);

const sim = new GrblSimulator({ port, processingDelayMs: delay });
sim.on('line', (line: string) => console.log(`> ${line}`));
sim.on('overflow', () => console.error('! RX buffer overflow — the sender is broken'));
sim.on('reset', ({ dropped }: { dropped: number }) =>
  console.log(`* soft reset (${dropped} queued line(s) dropped)`),
);

sim
  .listen()
  .then((p) => console.log(`GRBL simulator listening on 127.0.0.1:${p} (${delay}ms/line)`))
  .catch((err) => {
    console.error('Failed to start simulator:', err);
    process.exit(1);
  });
