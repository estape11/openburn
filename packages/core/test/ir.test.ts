import { describe, expect, it } from 'vitest';
import type { Design, Job } from '../src/ir/index.js';
import { DEFAULT_LAYER_SETTINGS, IDENTITY } from '../src/ir/index.js';

// The IR is types-first; what a test CAN pin down at runtime is the default
// settings contract (the safety-relevant part) and that the types compose into
// a full Design/Job without friction (compile-time, checked by tsc on this file).

describe('DEFAULT_LAYER_SETTINGS', () => {
  it('is timid: low power, output on, single pass', () => {
    // 20%/1000mm/min marks material instead of igniting it if the user forgets
    // to configure a layer. Raising this default is a safety decision, not a tweak.
    expect(DEFAULT_LAYER_SETTINGS.powerPercent).toBeLessThanOrEqual(20);
    expect(DEFAULT_LAYER_SETTINGS.speedMmPerMin).toBeGreaterThanOrEqual(1000);
    expect(DEFAULT_LAYER_SETTINGS.passes).toBe(1);
    expect(DEFAULT_LAYER_SETTINGS.output).toBe(true);
    expect(DEFAULT_LAYER_SETTINGS.mode).toBe('line');
  });
});

describe('IR composition', () => {
  it('types compose into a complete Design and Job', () => {
    const design: Design = {
      widthMm: 100,
      heightMm: 80,
      layers: [
        {
          id: 'layer-1',
          color: '#ff0000',
          name: 'Cut',
          settings: DEFAULT_LAYER_SETTINGS,
          shapes: [
            {
              id: 'shape-1',
              transform: IDENTITY,
              subPaths: [
                {
                  start: { x: 0, y: 0 },
                  closed: true,
                  segments: [
                    { kind: 'line', to: { x: 10, y: 0 } },
                    {
                      kind: 'cubic',
                      c1: { x: 12, y: 2 },
                      c2: { x: 12, y: 8 },
                      to: { x: 10, y: 10 },
                    },
                    { kind: 'quadratic', c: { x: 5, y: 12 }, to: { x: 0, y: 10 } },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };
    const job: Job = {
      toolpaths: [
        {
          layerId: 'layer-1',
          moves: [
            { kind: 'rapid', to: { x: 0, y: 0 } },
            { kind: 'cut', to: { x: 10, y: 0 }, powerPercent: 20, feedMmPerMin: 1000 },
          ],
        },
      ],
    };
    expect(design.layers[0]?.shapes[0]?.subPaths[0]?.segments).toHaveLength(3);
    expect(job.toolpaths[0]?.moves[1]?.kind).toBe('cut');
  });
});
