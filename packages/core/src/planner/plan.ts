/**
 * Cut planner: Polyline[] + layer settings → Job (ordered Toolpaths).
 *
 * Two ordering rules, in priority order:
 * 1. **Inner before outer** (hard constraint): a part that is cut free can
 *    shift or tilt; anything still to be cut inside it would land wrong.
 *    Containment depth is computed per layer over closed polylines.
 * 2. **Nearest-neighbor travel** (heuristic): within the same containment
 *    depth, continue with whichever polyline starts closest to the laser's
 *    current position.
 *
 * Layers run by ascending `priority`; passes repeat a layer's sequence.
 */
import type { Design, Job, Layer, Move, Point, Polyline, Toolpath } from '../ir/index.js';

export function planJob(design: Design, polylines: readonly Polyline[]): Job {
  const byLayer = new Map<string, Polyline[]>();
  for (const poly of polylines) {
    const bucket = byLayer.get(poly.layerId) ?? [];
    bucket.push(poly);
    byLayer.set(poly.layerId, bucket);
  }

  const layers = [...design.layers]
    .filter((l) => l.settings.output)
    .sort((a, b) => a.settings.priority - b.settings.priority);

  const toolpaths: Toolpath[] = [];
  let position: Point = { x: 0, y: 0 }; // laser parked at machine origin

  for (const layer of layers) {
    const candidates = byLayer.get(layer.id);
    if (!candidates || candidates.length === 0) continue;
    const ordered = orderWithinLayer(candidates, position);
    for (let pass = 0; pass < Math.max(1, layer.settings.passes); pass++) {
      const { moves, end } = movesForSequence(ordered, layer, position);
      toolpaths.push({ layerId: layer.id, moves });
      position = end;
    }
  }
  return { toolpaths };
}

/** Sort a layer's polylines: containment depth descending (innermost first),
 * nearest-neighbor within each depth group. */
function orderWithinLayer(polylines: readonly Polyline[], start: Point): Polyline[] {
  const depths = polylines.map((p) => containmentDepth(p, polylines));
  const groups = new Map<number, Polyline[]>();
  for (let i = 0; i < polylines.length; i++) {
    const depth = depths[i] as number;
    const group = groups.get(depth) ?? [];
    group.push(polylines[i] as Polyline);
    groups.set(depth, group);
  }

  const ordered: Polyline[] = [];
  let position = start;
  for (const depth of [...groups.keys()].sort((a, b) => b - a)) {
    let remaining = [...(groups.get(depth) as Polyline[])];
    while (remaining.length > 0) {
      let best = 0;
      let bestDist = Infinity;
      for (let i = 0; i < remaining.length; i++) {
        const first = (remaining[i] as Polyline).points[0] as Point;
        const d = Math.hypot(first.x - position.x, first.y - position.y);
        if (d < bestDist) {
          bestDist = d;
          best = i;
        }
      }
      const next = remaining[best] as Polyline;
      remaining = remaining.filter((_, i) => i !== best);
      ordered.push(next);
      position = endPoint(next);
    }
  }
  return ordered;
}

/** How many OTHER closed polylines of the same layer contain this one. */
function containmentDepth(poly: Polyline, all: readonly Polyline[]): number {
  const probe = poly.points[0] as Point;
  let depth = 0;
  for (const other of all) {
    if (other === poly || !other.closed) continue;
    if (pointInPolygon(probe, other.points)) depth += 1;
  }
  return depth;
}

/** Ray casting, even-odd rule. */
export function pointInPolygon(p: Point, polygon: readonly Point[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i] as Point;
    const b = polygon[j] as Point;
    const crosses = a.y > p.y !== b.y > p.y;
    if (crosses && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

function movesForSequence(
  ordered: readonly Polyline[],
  layer: Layer,
  start: Point,
): { moves: Move[]; end: Point } {
  const { powerPercent, speedMmPerMin } = layer.settings;
  const moves: Move[] = [];
  let position = start;
  for (const poly of ordered) {
    const first = poly.points[0] as Point;
    moves.push({ kind: 'rapid', to: first });
    for (const point of poly.points.slice(1)) {
      moves.push({ kind: 'cut', to: point, powerPercent, feedMmPerMin: speedMmPerMin });
    }
    if (poly.closed) {
      // Close the loop explicitly — the flattener does not duplicate the start.
      moves.push({ kind: 'cut', to: first, powerPercent, feedMmPerMin: speedMmPerMin });
    }
    position = endPoint(poly);
  }
  return { moves, end: position };
}

const endPoint = (poly: Polyline): Point =>
  poly.closed ? (poly.points[0] as Point) : (poly.points[poly.points.length - 1] as Point);
