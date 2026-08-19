import { describe, expect, it } from 'vitest';
import { flattenDesign } from '../src/geometry/flatten.js';
import { parseSvg } from '../src/svg/parse.js';

const svg = (body: string, w = 100, h = 80) =>
  `<svg width="${w}mm" height="${h}mm" viewBox="0 0 ${w} ${h}">${body}</svg>`;

describe('flattenDesign — machine orientation', () => {
  it('flips Y exactly once: SVG top-left becomes machine top-left at y=heightMm', () => {
    const { design } = parseSvg(svg(`<rect x="10" y="10" width="30" height="20"/>`));
    const [poly] = flattenDesign(design);
    // SVG y=10 (near top) → machine y=70; SVG y=30 → machine y=50.
    expect(poly?.points).toEqual([
      { x: 10, y: 70 },
      { x: 40, y: 70 },
      { x: 40, y: 50 },
      { x: 10, y: 50 },
    ]);
    expect(poly?.closed).toBe(true);
  });

  it('carries layer and shape identity through', () => {
    const { design } = parseSvg(
      svg(`<rect id="lid" x="0" y="0" width="10" height="10" stroke="red"/>`),
    );
    const [poly] = flattenDesign(design);
    expect(poly?.layerId).toBe('layer-1');
    expect(poly?.shapeId).toBe('lid');
  });
});

describe('flattenDesign — curve fidelity', () => {
  it('keeps every flattened circle point within tolerance of the true radius', () => {
    const { design } = parseSvg(svg(`<circle cx="50" cy="40" r="20"/>`));
    const [poly] = flattenDesign(design, { toleranceMm: 0.02 });
    const center = { x: 50, y: 40 }; // symmetric in Y, flip maps onto itself
    expect(poly).toBeDefined();
    for (const p of poly?.points ?? []) {
      const r = Math.hypot(p.x - center.x, p.y - center.y);
      expect(Math.abs(r - 20)).toBeLessThanOrEqual(0.05); // tolerance + simplify slack
    }
    // Sanity on adaptive density: enough points to be round, not thousands.
    expect(poly?.points.length).toBeGreaterThan(16);
    expect(poly?.points.length).toBeLessThan(400);
  });

  it('is adaptive: tighter tolerance produces more points', () => {
    const { design } = parseSvg(svg(`<circle cx="50" cy="40" r="20"/>`));
    const coarse = flattenDesign(design, { toleranceMm: 0.5 })[0]?.points.length ?? 0;
    const fine = flattenDesign(design, { toleranceMm: 0.005 })[0]?.points.length ?? 0;
    expect(coarse).toBeGreaterThan(4);
    expect(fine).toBeGreaterThan(coarse * 2);
  });

  it('straight lines stay 2 points regardless of tolerance', () => {
    const { design } = parseSvg(svg(`<line x1="0" y1="0" x2="90" y2="60"/>`));
    const [poly] = flattenDesign(design, { toleranceMm: 0.005 });
    expect(poly?.points).toHaveLength(2);
    expect(poly?.closed).toBe(false);
  });
});

describe('flattenDesign — output economy', () => {
  it('collapses collinear runs (every point is a G-code line downstream)', () => {
    // 9 collinear segments along one straight line.
    const d = Array.from({ length: 10 }, (_, i) => `${i === 0 ? 'M' : 'L'}${i * 10} ${i * 5}`).join(
      ' ',
    );
    const { design } = parseSvg(svg(`<path d="${d}"/>`));
    const [poly] = flattenDesign(design);
    expect(poly?.points).toHaveLength(2);
  });

  it('drops degenerate subpaths instead of emitting uncuttable noise', () => {
    const { design } = parseSvg(svg(`<path d="M10 10"/>`));
    expect(flattenDesign(design)).toHaveLength(0);
  });
});
