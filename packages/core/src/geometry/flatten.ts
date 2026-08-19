/**
 * Geometry stage: Design (mm, Y-down) → Polyline[] (mm, machine Y-up).
 *
 * Two invariants live here and only here:
 * - the **Y flip** from SVG orientation to machine orientation
 *   (`y' = heightMm − y`), applied to every emitted point;
 * - curve **flattening within a stated tolerance** — adaptive subdivision,
 *   not uniform-t sampling: straights get 1 segment, tight curves get many.
 *
 * Output size matters downstream: every extra point becomes a G-code line
 * competing for a 128-byte controller buffer, so collinear points are
 * simplified out after flattening.
 */
import type { Design, PathSegment, Point, Polyline } from '../ir/index.js';

export interface FlattenOptions {
  /** Maximum deviation between the true curve and its polyline, in mm. */
  toleranceMm?: number;
}

/** Flatten every shape of every layer. Layer settings are NOT interpreted here
 * (output-off layers still flatten — the planner filters; the UI previews). */
export function flattenDesign(design: Design, options: FlattenOptions = {}): Polyline[] {
  const tolerance = options.toleranceMm ?? 0.02;
  const polylines: Polyline[] = [];
  for (const layer of design.layers) {
    for (const shape of layer.shapes) {
      for (const sub of shape.subPaths) {
        const points = flattenSubPath(sub.start, sub.segments, tolerance);
        // Simplify with a fraction of the tolerance so the total deviation
        // stays bounded by ~1.25·tolerance.
        const simplified = removeCollinear(points, tolerance / 4);
        if (simplified.length < 2) continue; // degenerate: nothing to cut
        polylines.push({
          points: simplified.map((p) => ({ x: p.x, y: design.heightMm - p.y })),
          closed: sub.closed,
          layerId: layer.id,
          shapeId: shape.id,
        });
      }
    }
  }
  return polylines;
}

function flattenSubPath(
  start: Point,
  segments: readonly PathSegment[],
  tolerance: number,
): Point[] {
  const out: Point[] = [start];
  let current = start;
  for (const seg of segments) {
    switch (seg.kind) {
      case 'line':
        out.push(seg.to);
        break;
      case 'cubic':
        flattenCubic(current, seg.c1, seg.c2, seg.to, tolerance, out);
        break;
      case 'quadratic': {
        // Exact degree elevation: a quadratic IS a cubic with these controls.
        const c1 = lerp(current, seg.c, 2 / 3);
        const c2 = lerp(seg.to, seg.c, 2 / 3);
        flattenCubic(current, c1, c2, seg.to, tolerance, out);
        break;
      }
    }
    current = seg.to;
  }
  return out;
}

/** Adaptive flattening by recursive De Casteljau subdivision: emit the
 * endpoint when the control points sit within `tolerance` of the chord,
 * split at t=0.5 otherwise. Depth cap guards degenerate inputs. */
function flattenCubic(
  p0: Point,
  p1: Point,
  p2: Point,
  p3: Point,
  tolerance: number,
  out: Point[],
  depth = 0,
): void {
  if (depth > 24 || isFlatEnough(p0, p1, p2, p3, tolerance)) {
    out.push(p3);
    return;
  }
  // De Casteljau split at t = 0.5.
  const p01 = mid(p0, p1);
  const p12 = mid(p1, p2);
  const p23 = mid(p2, p3);
  const p012 = mid(p01, p12);
  const p123 = mid(p12, p23);
  const p0123 = mid(p012, p123);
  flattenCubic(p0, p01, p012, p0123, tolerance, out, depth + 1);
  flattenCubic(p0123, p123, p23, p3, tolerance, out, depth + 1);
}

/** Flatness: max distance of the control points from the p0–p3 chord. This
 * bounds the curve's deviation (the curve lies in the control hull). */
function isFlatEnough(p0: Point, p1: Point, p2: Point, p3: Point, tolerance: number): boolean {
  return (
    perpendicularDistance(p1, p0, p3) <= tolerance && perpendicularDistance(p2, p0, p3) <= tolerance
  );
}

function perpendicularDistance(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  // Distance to the infinite line — good enough for a flatness test, and it
  // never underestimates the deviation for well-behaved control hulls.
  return Math.abs(dy * p.x - dx * p.y + b.x * a.y - b.y * a.x) / Math.sqrt(lengthSq);
}

/** Drop points that deviate less than `epsilon` from the line through their
 * neighbors — the flattener's straight runs collapse to their endpoints. */
function removeCollinear(points: readonly Point[], epsilon: number): Point[] {
  if (points.length <= 2) return [...points];
  const out: Point[] = [points[0] as Point];
  for (let i = 1; i < points.length - 1; i++) {
    const kept = out[out.length - 1] as Point;
    const candidate = points[i] as Point;
    const next = points[i + 1] as Point;
    if (perpendicularDistance(candidate, kept, next) > epsilon) {
      out.push(candidate);
    }
  }
  out.push(points[points.length - 1] as Point);
  return out;
}

const mid = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const lerp = (a: Point, b: Point, t: number): Point => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
});
