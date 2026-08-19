/**
 * Machine-side IR: flattened, planned, ready to emit.
 *
 * `Toolpath` is the seam that decouples CAM from the output dialect: the GRBL
 * emitter is its first consumer, and a future Ruida (.rd) emitter is the
 * reason it exists as a separate stage instead of emitting G-code straight
 * from the planner.
 *
 * Pipeline position:  SVG file → Design → **Polyline[] → Toolpath[]** → G-code
 */
import type { Point } from './geometry.js';

/** A flattened path: straight segments only, machine coordinates (mm, Y up,
 * origin at machine zero). What the planner orders and the estimator measures. */
export interface Polyline {
  readonly points: readonly Point[];
  /** Mirrors SubPath.closed — the planner needs it for containment. */
  readonly closed: boolean;
  /** Back-reference for settings lookup and UI highlighting. */
  readonly layerId: string;
  readonly shapeId: string;
}

/** One machine motion. A `rapid` is laser-off travel (G0); a `cut` is a
 * working move (G1) with explicit power and feed so a Toolpath is
 * self-contained — emitters never reach back into the Design. */
export type Move =
  | { readonly kind: 'rapid'; readonly to: Point }
  | {
      readonly kind: 'cut';
      readonly to: Point;
      readonly powerPercent: number;
      readonly feedMmPerMin: number;
    };

/** An ordered run of moves for one layer pass. */
export interface Toolpath {
  readonly layerId: string;
  readonly moves: readonly Move[];
}

/** A planned job: what the emitter turns into a G-code program and the
 * estimator turns into seconds. */
export interface Job {
  readonly toolpaths: readonly Toolpath[];
}
