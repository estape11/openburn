/**
 * Design-side IR: what an imported file looks like *before* flattening.
 *
 * Named `Design` (not `Document`) deliberately: `Document` collides with the
 * DOM global the moment this package is imported in the browser, and shadowed
 * globals are a debugging tax nobody should pay.
 *
 * Pipeline position:  SVG file → **Design** → Polyline[] → Toolpath[] → G-code
 */
import type { Matrix, Point } from './geometry.js';

/** A curve segment in absolute coordinates. Arcs don't appear here: the SVG
 * importer normalizes them to cubics (svgpath `unarc`), so downstream code has
 * exactly three cases to handle. */
export type PathSegment =
  | { readonly kind: 'line'; readonly to: Point }
  | { readonly kind: 'cubic'; readonly c1: Point; readonly c2: Point; readonly to: Point }
  | { readonly kind: 'quadratic'; readonly c: Point; readonly to: Point };

/** One continuous pen-down run of a path. */
export interface SubPath {
  /** Where the pen lands before the first segment (absolute `M`). */
  readonly start: Point;
  readonly segments: readonly PathSegment[];
  /** True when the source ended with `Z` (or the shape is inherently closed,
   * e.g. rect/circle). Closed subpaths participate in inner-first containment
   * ordering; open ones never contain anything. */
  readonly closed: boolean;
}

/** An importable shape, already reduced to path form (rect/circle/etc. are
 * converted by the importer — there is only one geometry currency here). */
export interface Shape {
  /** Stable within the Design; used by the UI for selection and by tests. */
  readonly id: string;
  readonly subPaths: readonly SubPath[];
  /** Accumulated CTM from the source tree (group transforms folded in).
   * Applied once, at flatten time — segments above are in *local* coords. */
  readonly transform: Matrix;
}

/** How a layer is executed. MVP is vector cutting only; `fill` and
 * `offset-fill` join when scan filling lands (FEATURE_CATALOG §C). */
export type LayerMode = 'line';

/** Per-layer machine settings — the LightBurn-style heart of the UX. */
export interface LayerSettings {
  readonly mode: LayerMode;
  /** 0–100. The emitter scales this to an S value using the machine's `$30`
   * (never a raw S here: the same design must run on machines with different
   * spindle scales). */
  readonly powerPercent: number;
  readonly speedMmPerMin: number;
  /** Whole passes over the layer's toolpaths. ≥1. */
  readonly passes: number;
  /** Off = the layer is visible in the UI but emits nothing. */
  readonly output: boolean;
  /** Lower runs first. Ties keep import order. */
  readonly priority: number;
}

/** A color-mapped group of shapes sharing one set of machine settings. */
export interface Layer {
  readonly id: string;
  /** Normalized `#rrggbb` of the source stroke — the mapping key on import. */
  readonly color: string;
  readonly name: string;
  readonly settings: LayerSettings;
  readonly shapes: readonly Shape[];
}

/** A loaded design: the root of the design-side IR. */
export interface Design {
  /** Canvas size in mm (from viewBox/width/height resolution). */
  readonly widthMm: number;
  readonly heightMm: number;
  readonly layers: readonly Layer[];
}

/** Defaults a fresh layer gets on import; deliberately timid (low power, slow)
 * so "forgot to configure" marks material instead of setting it on fire. */
export const DEFAULT_LAYER_SETTINGS: LayerSettings = {
  mode: 'line',
  powerPercent: 20,
  speedMmPerMin: 1000,
  passes: 1,
  output: true,
  priority: 0,
};
