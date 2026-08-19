// @openburn/core — pure CAM core. No Node APIs, no I/O (must run in browser).
// Pipeline: SVG file → Design (ir/) → Polyline[] → Toolpath[] → G-code (emit/).
// Remaining v0.1.0 structure: svg/, geometry/, planner/.

export * from './ir/index.js';
export * from './svg/index.js';
export * from './geometry/index.js';
export * from './planner/index.js';
export { formatCoord } from './emit/format.js';
export { emitGcode } from './emit/gcode.js';
export type { EmitOptions } from './emit/gcode.js';
