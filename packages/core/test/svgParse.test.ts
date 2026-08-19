import { describe, expect, it } from 'vitest';
import type { PathSegment } from '../src/ir/index.js';
import { parseSvg } from '../src/svg/parse.js';

const lineTargets = (segments: readonly PathSegment[]) =>
  segments.map((s) => (s.kind === 'line' ? [s.to.x, s.to.y] : s.kind));

describe('parseSvg — viewport and units', () => {
  it('mm-sized document with matching viewBox keeps coordinates 1:1 in mm', () => {
    const { design, warnings } = parseSvg(
      `<svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="80mm" viewBox="0 0 100 80">
         <rect x="10" y="10" width="30" height="20" stroke="red" fill="none"/>
       </svg>`,
    );
    expect(warnings).toEqual([]);
    expect(design.widthMm).toBe(100);
    expect(design.heightMm).toBe(80);
    const sub = design.layers[0]?.shapes[0]?.subPaths[0];
    expect(sub?.closed).toBe(true);
    expect(sub?.start).toEqual({ x: 10, y: 10 });
    expect(lineTargets(sub?.segments ?? [])).toEqual([
      [40, 10],
      [40, 30],
      [10, 30],
    ]);
  });

  it('unitless documents are CSS px: 96 px = 25.4 mm', () => {
    const { design } = parseSvg(
      `<svg width="96" height="96"><rect x="0" y="0" width="96" height="96"/></svg>`,
    );
    expect(design.widthMm).toBeCloseTo(25.4, 10);
    const sub = design.layers[0]?.shapes[0]?.subPaths[0];
    expect(sub?.segments[0]).toEqual({ kind: 'line', to: { x: 25.4, y: 0 } });
  });

  it('physical size wins over viewBox user units (scaling applied)', () => {
    const { design } = parseSvg(
      `<svg width="100mm" height="80mm" viewBox="0 0 200 160">
         <rect x="20" y="20" width="40" height="40" />
       </svg>`,
    );
    const sub = design.layers[0]?.shapes[0]?.subPaths[0];
    expect(sub?.start).toEqual({ x: 10, y: 10 }); // 0.5 mm per user unit
  });

  it('viewBox min-x/min-y offsets are folded in', () => {
    const { design } = parseSvg(
      `<svg width="100mm" height="100mm" viewBox="50 50 100 100">
         <rect x="50" y="50" width="10" height="10"/>
       </svg>`,
    );
    expect(design.layers[0]?.shapes[0]?.subPaths[0]?.start).toEqual({ x: 0, y: 0 });
  });

  it('warns and assumes 100×100 mm when the SVG declares no size', () => {
    const { design, warnings } = parseSvg(`<svg><rect width="10" height="10"/></svg>`);
    expect(design.widthMm).toBe(100);
    expect(warnings.some((w) => w.includes('assuming 100×100'))).toBe(true);
  });
});

describe('parseSvg — transforms', () => {
  it('composes nested transforms parent-first (translate then scale)', () => {
    const { design } = parseSvg(
      `<svg width="100mm" height="100mm" viewBox="0 0 100 100">
         <g transform="translate(10 0)"><g transform="scale(2)">
           <rect x="5" y="0" width="10" height="10"/>
         </g></g>
       </svg>`,
    );
    // T(10)∘S(2) applied to x=5 → 10 + 2·5 = 20. (The reversed composition
    // would give 2·(5+10) = 30 — that is the bug this test exists to catch.)
    expect(design.layers[0]?.shapes[0]?.subPaths[0]?.start).toEqual({ x: 20, y: 0 });
  });

  it('applies the element own transform after ancestors', () => {
    const { design } = parseSvg(
      `<svg width="100mm" height="100mm" viewBox="0 0 100 100">
         <g transform="translate(10 10)"><rect transform="translate(5 5)" x="0" y="0" width="10" height="10"/></g>
       </svg>`,
    );
    expect(design.layers[0]?.shapes[0]?.subPaths[0]?.start).toEqual({ x: 15, y: 15 });
  });
});

describe('parseSvg — shapes', () => {
  it('circles come out as closed cubics — never arc segments', () => {
    const { design, warnings } = parseSvg(
      `<svg width="100mm" height="100mm" viewBox="0 0 100 100">
         <circle cx="50" cy="50" r="20"/>
       </svg>`,
    );
    expect(warnings).toEqual([]);
    const sub = design.layers[0]?.shapes[0]?.subPaths[0];
    expect(sub?.closed).toBe(true);
    expect(sub?.segments.length).toBeGreaterThan(0);
    expect(sub?.segments.every((s) => s.kind === 'cubic')).toBe(true);
  });

  it('lines are open subpaths', () => {
    const { design } = parseSvg(
      `<svg width="100mm" height="100mm" viewBox="0 0 100 100">
         <line x1="0" y1="0" x2="50" y2="50"/>
       </svg>`,
    );
    const sub = design.layers[0]?.shapes[0]?.subPaths[0];
    expect(sub?.closed).toBe(false);
    expect(sub?.segments).toEqual([{ kind: 'line', to: { x: 50, y: 50 } }]);
  });

  it('multi-subpath path data yields one shape with several subpaths', () => {
    const { design } = parseSvg(
      `<svg width="100mm" height="100mm" viewBox="0 0 100 100">
         <path d="M0 0 H10 V10 H0 Z M20 20 H30 V30 H20 Z"/>
       </svg>`,
    );
    expect(design.layers[0]?.shapes[0]?.subPaths).toHaveLength(2);
    expect(design.layers[0]?.shapes[0]?.subPaths.every((s) => s.closed)).toBe(true);
  });
});

describe('parseSvg — layers and paint', () => {
  it('groups shapes into layers by stroke color, first-seen order', () => {
    const { design } = parseSvg(
      `<svg width="100mm" height="100mm" viewBox="0 0 100 100">
         <rect x="0" y="0" width="10" height="10" stroke="red"/>
         <rect x="20" y="0" width="10" height="10" stroke="#00f"/>
         <rect x="40" y="0" width="10" height="10" stroke="rgb(255, 0, 0)"/>
       </svg>`,
    );
    expect(design.layers.map((l) => l.color)).toEqual(['#ff0000', '#0000ff']);
    expect(design.layers[0]?.shapes).toHaveLength(2);
    expect(design.layers.map((l) => l.settings.priority)).toEqual([0, 1]);
  });

  it('falls back to fill when stroke is none, and to black when unpainted', () => {
    const { design } = parseSvg(
      `<svg width="100mm" height="100mm" viewBox="0 0 100 100">
         <rect x="0" y="0" width="10" height="10" stroke="none" fill="lime"/>
         <rect x="20" y="0" width="10" height="10"/>
       </svg>`,
    );
    expect(design.layers.map((l) => l.color)).toEqual(['#00ff00', '#000000']);
  });

  it('inline style beats the presentation attribute, and paint inherits', () => {
    const { design } = parseSvg(
      `<svg width="100mm" height="100mm" viewBox="0 0 100 100">
         <g stroke="red">
           <rect x="0" y="0" width="10" height="10"/>
           <rect x="20" y="0" width="10" height="10" stroke="blue" style="stroke: #00ff00"/>
         </g>
       </svg>`,
    );
    expect(design.layers.map((l) => l.color)).toEqual(['#ff0000', '#00ff00']);
  });
});

describe('parseSvg — warnings, not silent loss', () => {
  it('warns on unsupported elements', () => {
    const { warnings } = parseSvg(
      `<svg width="100mm" height="100mm" viewBox="0 0 100 100">
         <text x="0" y="0">hi</text>
         <use href="#x"/>
       </svg>`,
    );
    expect(warnings.some((w) => w.includes('<text>'))).toBe(true);
    expect(warnings.some((w) => w.includes('<use>'))).toBe(true);
  });

  it('skips unparsable path data with a warning instead of importing garbage', () => {
    const { design, warnings } = parseSvg(
      `<svg width="100mm" height="100mm" viewBox="0 0 100 100">
         <path d="M0 0 L NOT_A_NUMBER"/>
         <rect x="0" y="0" width="10" height="10"/>
       </svg>`,
    );
    expect(design.layers.flatMap((l) => l.shapes)).toHaveLength(1);
    expect(warnings.some((w) => w.includes('unparsable path data'))).toBe(true);
  });

  it('rejects non-SVG XML loudly', () => {
    expect(() => parseSvg('<html></html>')).toThrow(/root element is not <svg>/);
  });
});
