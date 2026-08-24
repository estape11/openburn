import { describe, expect, it } from 'vitest';
import { flattenDesign } from '../src/geometry/flatten.js';
import type { Job } from '../src/ir/index.js';
import { emitGcode } from '../src/emit/gcode.js';
import { planJob } from '../src/planner/plan.js';
import { parseSvg } from '../src/svg/parse.js';

describe('emitGcode — golden: the whole pipeline, SVG in → program out', () => {
  it('emits the exact program for a simple rectangle', () => {
    const { design } = parseSvg(
      `<svg width="100mm" height="80mm" viewBox="0 0 100 80">
         <rect x="10" y="10" width="30" height="20" stroke="red" fill="none"/>
       </svg>`,
    );
    const job = planJob(design, flattenDesign(design));
    // Defaults: 20% power → S200 at $30=1000, F1000. Y flip: SVG y=10 → 70.
    expect(emitGcode(job)).toEqual([
      'G21',
      'G90',
      'M4 S0',
      'G0 X10 Y70',
      'G1 X40 S200 F1000',
      'G1 Y50',
      'G1 X10',
      'G1 Y70',
      'M5',
      'G0 X0 Y0',
    ]);
  });
});

const cut = (x: number, y: number, powerPercent = 50, feedMmPerMin = 600) =>
  ({ kind: 'cut', to: { x, y }, powerPercent, feedMmPerMin }) as const;
const rapid = (x: number, y: number) => ({ kind: 'rapid', to: { x, y } }) as const;
const jobOf = (...moves: (ReturnType<typeof cut> | ReturnType<typeof rapid>)[]): Job => ({
  toolpaths: [{ layerId: 'a', moves }],
});

describe('emitGcode — power scaling', () => {
  it('scales percent by the machine $30, not by a hardcoded 1000', () => {
    const job = jobOf(rapid(0, 0), cut(10, 0, 65));
    expect(emitGcode(job, { sMax: 1000 })).toContain('G1 X10 S650 F600');
    expect(emitGcode(job, { sMax: 255 })).toContain('G1 X10 S166 F600');
  });

  it('M3 constant-power mode is available for the header', () => {
    expect(emitGcode(jobOf(), { laserMode: 'M3' })[2]).toBe('M3 S0');
  });
});

describe('emitGcode — modal economy (every byte fights for a 128-byte ring)', () => {
  it('emits F and S only when they change', () => {
    const lines = emitGcode(jobOf(rapid(0, 0), cut(10, 0), cut(20, 0), cut(20, 10, 80)));
    expect(lines).toEqual([
      'G21',
      'G90',
      'M4 S0',
      'G0 X0 Y0',
      'G1 X10 S500 F600',
      'G1 X20', // same S, same F, same Y — three words saved
      'G1 Y10 S800', // power change re-emits S; X unchanged stays omitted
      'M5',
      'G0 X0 Y0',
    ]);
  });

  it('omits unchanged axes and skips zero-length moves entirely', () => {
    const lines = emitGcode(jobOf(rapid(5, 5), cut(5, 5), rapid(5, 5), cut(5, 9)));
    expect(lines).toEqual(['G21', 'G90', 'M4 S0', 'G0 X5 Y5', 'G1 Y9 S500 F600', 'M5', 'G0 X0 Y0']);
  });

  it('coordinates round to 3 decimals with no trailing zeros', () => {
    const lines = emitGcode(jobOf(rapid(1.23456, 2.5), cut(7.999999, 2.5)));
    expect(lines).toContain('G0 X1.235 Y2.5');
    expect(lines).toContain('G1 X8 S500 F600');
  });
});
