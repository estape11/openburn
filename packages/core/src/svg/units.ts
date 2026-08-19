/**
 * SVG length parsing. Physical units convert exactly; unitless and `px` use
 * the CSS reference of 96 px per inch (the convention Inkscape and browsers
 * agree on — LightBurn imports the same way).
 */

const MM_PER_INCH = 25.4;
export const MM_PER_PX = MM_PER_INCH / 96;

const FACTORS_TO_MM: Record<string, number> = {
  mm: 1,
  cm: 10,
  in: MM_PER_INCH,
  pt: MM_PER_INCH / 72,
  pc: MM_PER_INCH / 6,
  px: MM_PER_PX,
  '': MM_PER_PX,
};

/** Parse a length attribute (`"120mm"`, `"340"`, `"12.5cm"`) to millimeters.
 * Returns null for missing/percentage/garbage values — the caller decides the
 * fallback, because it differs per attribute (§ width vs viewBox). */
export function lengthToMm(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  const m = /^\s*([+-]?\d*\.?\d+(?:[eE][+-]?\d+)?)\s*([a-z%]*)\s*$/.exec(raw);
  if (!m) return null;
  const value = parseFloat(m[1] as string);
  const unit = (m[2] as string).toLowerCase();
  const factor = FACTORS_TO_MM[unit];
  if (factor === undefined) return null; // %, em, ex… — not resolvable here
  return value * factor;
}
