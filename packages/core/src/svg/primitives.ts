/**
 * Every drawable SVG element reduced to path data — one geometry currency for
 * the rest of the pipeline (rounded corners and circles come out as arcs; the
 * parser unarcs them to cubics right after).
 */

type Attrs = Readonly<Record<string, string>>;

const num = (attrs: Attrs, name: string, fallback = 0): number => {
  const v = attrs[name];
  if (v === undefined) return fallback;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
};

function rectToPath(attrs: Attrs): string | null {
  const x = num(attrs, 'x');
  const y = num(attrs, 'y');
  const w = num(attrs, 'width');
  const h = num(attrs, 'height');
  if (w <= 0 || h <= 0) return null;

  // Per spec: a missing radius inherits the other; both clamp to half-side.
  let rx = attrs['rx'] !== undefined ? num(attrs, 'rx') : num(attrs, 'ry');
  let ry = attrs['ry'] !== undefined ? num(attrs, 'ry') : num(attrs, 'rx');
  rx = Math.min(Math.max(rx, 0), w / 2);
  ry = Math.min(Math.max(ry, 0), h / 2);

  if (rx === 0 || ry === 0) {
    return `M${x} ${y}H${x + w}V${y + h}H${x}Z`;
  }
  return (
    `M${x + rx} ${y}` +
    `H${x + w - rx}A${rx} ${ry} 0 0 1 ${x + w} ${y + ry}` +
    `V${y + h - ry}A${rx} ${ry} 0 0 1 ${x + w - rx} ${y + h}` +
    `H${x + rx}A${rx} ${ry} 0 0 1 ${x} ${y + h - ry}` +
    `V${y + ry}A${rx} ${ry} 0 0 1 ${x + rx} ${y}Z`
  );
}

function ellipseToPath(cx: number, cy: number, rx: number, ry: number): string | null {
  if (rx <= 0 || ry <= 0) return null;
  return (
    `M${cx - rx} ${cy}` +
    `A${rx} ${ry} 0 1 0 ${cx + rx} ${cy}` +
    `A${rx} ${ry} 0 1 0 ${cx - rx} ${cy}Z`
  );
}

function pointsToPath(attrs: Attrs, close: boolean): string | null {
  const points = (attrs['points'] ?? '')
    .trim()
    .split(/[\s,]+/)
    .map(parseFloat)
    .filter(Number.isFinite);
  if (points.length < 4) return null;
  let d = `M${points[0]} ${points[1]}`;
  for (let i = 2; i + 1 < points.length; i += 2) d += `L${points[i]} ${points[i + 1]}`;
  return close ? `${d}Z` : d;
}

/** Path data for a drawable element, or null when it draws nothing. */
export function elementToPathD(name: string, attrs: Attrs): string | null {
  switch (name) {
    case 'path':
      return attrs['d'] ?? null;
    case 'rect':
      return rectToPath(attrs);
    case 'circle':
      return ellipseToPath(num(attrs, 'cx'), num(attrs, 'cy'), num(attrs, 'r'), num(attrs, 'r'));
    case 'ellipse':
      return ellipseToPath(num(attrs, 'cx'), num(attrs, 'cy'), num(attrs, 'rx'), num(attrs, 'ry'));
    case 'line':
      return `M${num(attrs, 'x1')} ${num(attrs, 'y1')}L${num(attrs, 'x2')} ${num(attrs, 'y2')}`;
    case 'polyline':
      return pointsToPath(attrs, false);
    case 'polygon':
      return pointsToPath(attrs, true);
    default:
      return null;
  }
}

/** Elements this parser can draw. */
export const DRAWABLE = new Set([
  'path',
  'rect',
  'circle',
  'ellipse',
  'line',
  'polyline',
  'polygon',
]);

/** Containers we descend into. */
export const CONTAINER = new Set(['svg', 'g', 'a']);

/** Known-unsupported elements worth a warning (FEATURE_CATALOG §B tracks them). */
export const UNSUPPORTED = new Set([
  'use',
  'defs',
  'symbol',
  'text',
  'tspan',
  'image',
  'style',
  'switch',
  'foreignObject',
]);
