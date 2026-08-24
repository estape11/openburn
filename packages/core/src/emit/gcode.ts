/**
 * G-code emitter, GRBL laser dialect: Job → program lines.
 *
 * Output economy is a correctness concern here, not vanity: every byte
 * competes for the controller's 128-byte RX ring during streaming. So modal
 * words are deduplicated — `F` and `S` only when they change, coordinates
 * only for axes that move, duplicate points dropped.
 *
 * Power model: `M4` (dynamic) by default — GRBL scales the beam with actual
 * velocity through corners, which is what vector cutting wants. `S` values
 * scale from percent by the machine's `$30` (pass the real one from
 * `GrblProtocol.settings`; defaulting blindly to 1000 on a 255-scale machine
 * means 4× overpower).
 */
import type { Job } from '../ir/index.js';
import { formatCoord } from './format.js';

export interface EmitOptions {
  /** The machine's `$30` (max S value). GRBL default is 1000. */
  sMax?: number;
  /** M4 = dynamic power (default, vector cutting); M3 = constant power. */
  laserMode?: 'M3' | 'M4';
}

export function emitGcode(job: Job, options: EmitOptions = {}): string[] {
  const sMax = options.sMax ?? 1000;
  const laserMode = options.laserMode ?? 'M4';

  const lines: string[] = ['G21', 'G90', `${laserMode} S0`];

  // Modal state, tracked as EMITTED text so float noise can't desync it.
  let x: string | null = null;
  let y: string | null = null;
  let s: number | null = 0; // header set S0
  let f: number | null = null;

  for (const toolpath of job.toolpaths) {
    for (const move of toolpath.moves) {
      const nx = formatCoord(move.to.x);
      const ny = formatCoord(move.to.y);
      const words: string[] = [];
      if (nx !== x) words.push(`X${nx}`);
      if (ny !== y) words.push(`Y${ny}`);

      if (move.kind === 'rapid') {
        if (words.length === 0) continue; // rapid to where we already are
        lines.push(`G0 ${words.join(' ')}`);
      } else {
        const power = Math.round((move.powerPercent / 100) * sMax);
        if (power !== s) words.push(`S${power}`);
        if (move.feedMmPerMin !== f) words.push(`F${formatCoord(move.feedMmPerMin)}`);
        if (nx === x && ny === y) continue; // zero-length cut burns a dot in place
        lines.push(`G1 ${words.join(' ')}`);
        s = power;
        f = move.feedMmPerMin;
      }
      x = nx;
      y = ny;
    }
  }

  lines.push('M5', 'G0 X0 Y0');
  return lines;
}
