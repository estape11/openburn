/**
 * Format a coordinate for G-code output: millimeters, at most 3 decimals
 * (1 µm resolution — finer than any laser mechanics), no trailing zeros so
 * the emitted stream stays small (streaming budget is a 128-byte RX buffer).
 */
export function formatCoord(mm: number): string {
  if (!Number.isFinite(mm)) {
    throw new RangeError(`Non-finite coordinate: ${mm}`);
  }
  // toFixed then strip, instead of Math.round tricks: keeps -0 out of output.
  const fixed = mm.toFixed(3).replace(/\.?0+$/, '');
  return fixed === '-0' ? '0' : fixed;
}
