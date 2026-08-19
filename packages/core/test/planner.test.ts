import { describe, expect, it } from 'vitest';
import type { Design, Layer, LayerSettings, Move, Polyline } from '../src/ir/index.js';
import { DEFAULT_LAYER_SETTINGS } from '../src/ir/index.js';
import { planJob } from '../src/planner/plan.js';

const settings = (over: Partial<LayerSettings> = {}): LayerSettings => ({
  ...DEFAULT_LAYER_SETTINGS,
  ...over,
});

const layer = (id: string, over: Partial<LayerSettings> = {}): Layer => ({
  id,
  color: '#000000',
  name: id,
  settings: settings(over),
  shapes: [],
});

const design = (...layers: Layer[]): Design => ({ widthMm: 200, heightMm: 200, layers });

/** Axis-aligned closed square, corner at (x,y). */
const square = (layerId: string, x: number, y: number, size: number, id = 'shape'): Polyline => ({
  layerId,
  shapeId: id,
  closed: true,
  points: [
    { x, y },
    { x: x + size, y },
    { x: x + size, y: y + size },
    { x, y: y + size },
  ],
});

const firstRapid = (moves: readonly Move[]) => moves.find((m) => m.kind === 'rapid')?.to;
const rapids = (moves: readonly Move[]) => moves.filter((m) => m.kind === 'rapid');

describe('planJob — hard constraint: inner before outer', () => {
  it('cuts a hole before the outline that contains it', () => {
    const job = planJob(design(layer('a')), [
      square('a', 0, 0, 40, 'outer'), // listed first on purpose
      square('a', 10, 10, 20, 'inner'),
    ]);
    // First rapid must go to the INNER square despite import order.
    expect(firstRapid(job.toolpaths[0]?.moves ?? [])).toEqual({ x: 10, y: 10 });
  });

  it('handles three nesting levels innermost-first', () => {
    const job = planJob(design(layer('a')), [
      square('a', 0, 0, 60, 'outer'),
      square('a', 20, 20, 20, 'middle'),
      square('a', 25, 25, 10, 'innermost'),
    ]);
    const order = rapids(job.toolpaths[0]?.moves ?? []).map((r) => r.to.x);
    expect(order).toEqual([25, 20, 0]);
  });
});

describe('planJob — travel heuristic', () => {
  it('orders same-depth shapes by nearest-neighbor from the origin, not import order', () => {
    const job = planJob(design(layer('a')), [
      square('a', 100, 0, 10, 'far'), // import order: far first
      square('a', 50, 0, 10, 'mid'),
      square('a', 0, 0, 10, 'near'),
    ]);
    const order = rapids(job.toolpaths[0]?.moves ?? []).map((r) => r.to.x);
    expect(order).toEqual([0, 50, 100]);
  });
});

describe('planJob — layer semantics', () => {
  it('runs layers by ascending priority regardless of design order', () => {
    const job = planJob(design(layer('slow', { priority: 1 }), layer('first', { priority: 0 })), [
      square('slow', 0, 0, 10),
      square('first', 50, 0, 10),
    ]);
    expect(job.toolpaths.map((t) => t.layerId)).toEqual(['first', 'slow']);
  });

  it('skips output-off layers entirely', () => {
    const job = planJob(design(layer('on'), layer('off', { output: false })), [
      square('on', 0, 0, 10),
      square('off', 50, 0, 10),
    ]);
    expect(job.toolpaths.map((t) => t.layerId)).toEqual(['on']);
  });

  it('repeats the layer sequence once per pass', () => {
    const job = planJob(design(layer('a', { passes: 3 })), [square('a', 0, 0, 10)]);
    expect(job.toolpaths).toHaveLength(3);
    expect(job.toolpaths.every((t) => t.layerId === 'a')).toBe(true);
  });

  it('cut moves carry the layer power and feed', () => {
    const job = planJob(design(layer('a', { powerPercent: 65, speedMmPerMin: 750 })), [
      square('a', 0, 0, 10),
    ]);
    const cuts = job.toolpaths[0]?.moves.filter((m) => m.kind === 'cut') ?? [];
    expect(cuts.length).toBeGreaterThan(0);
    for (const cut of cuts) {
      expect(cut).toMatchObject({ powerPercent: 65, feedMmPerMin: 750 });
    }
  });
});

describe('planJob — path closure', () => {
  it('closed polylines cut back to their start point', () => {
    const job = planJob(design(layer('a')), [square('a', 0, 0, 10)]);
    const moves = job.toolpaths[0]?.moves ?? [];
    expect(moves.at(-1)).toMatchObject({ kind: 'cut', to: { x: 0, y: 0 } });
    // 1 rapid + 4 cuts (3 remaining corners + closing edge).
    expect(moves).toHaveLength(5);
  });

  it('open polylines do not get a phantom closing cut', () => {
    const open: Polyline = {
      layerId: 'a',
      shapeId: 's',
      closed: false,
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 10 },
      ],
    };
    const job = planJob(design(layer('a')), [open]);
    expect(job.toolpaths[0]?.moves).toHaveLength(2); // rapid + one cut
  });
});
