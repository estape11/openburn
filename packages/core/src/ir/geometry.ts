/**
 * Geometric primitives shared by the whole IR.
 *
 * Unit discipline (DEVELOPMENT_GUIDE §9): everything in the IR is in
 * **millimeters**. The px→mm conversion happens exactly once, in the SVG
 * importer; the SVG→machine Y-axis flip happens exactly once, in the geometry
 * stage — nothing downstream ever sees pixels.
 */

/** 2D point. Millimeters. Machine orientation (Y grows upward) unless the
 * containing type says otherwise. */
export interface Point {
  readonly x: number;
  readonly y: number;
}

/**
 * Affine transform, SVG `matrix(a b c d e f)` order:
 *
 *   x' = a·x + c·y + e
 *   y' = b·x + d·y + f
 */
export type Matrix = readonly [number, number, number, number, number, number];

/** The identity transform. */
export const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];
