/**
 * Paint normalization: whatever the file says → `#rrggbb` lowercase, which is
 * the layer-mapping key. Deliberately small: the common cases plus the CSS
 * named colors that actually show up in laser SVGs.
 */

const NAMED: Record<string, string> = {
  black: '#000000',
  white: '#ffffff',
  red: '#ff0000',
  green: '#008000',
  lime: '#00ff00',
  blue: '#0000ff',
  yellow: '#ffff00',
  cyan: '#00ffff',
  aqua: '#00ffff',
  magenta: '#ff00ff',
  fuchsia: '#ff00ff',
  orange: '#ffa500',
  purple: '#800080',
  brown: '#a52a2a',
  pink: '#ffc0cb',
  gray: '#808080',
  grey: '#808080',
  silver: '#c0c0c0',
  maroon: '#800000',
  navy: '#000080',
  teal: '#008080',
  olive: '#808000',
  gold: '#ffd700',
};

/** Normalize a paint value. Returns:
 * - `#rrggbb` for a resolvable color,
 * - `'none'` for an explicit none,
 * - null for unresolvable paints (url(#grad), currentColor…). */
export function normalizePaint(raw: string | undefined): string | 'none' | null {
  if (raw === undefined) return null;
  const value = raw.trim().toLowerCase();
  if (value === '') return null;
  if (value === 'none') return 'none';

  if (/^#[0-9a-f]{6}$/.test(value)) return value;
  if (/^#[0-9a-f]{3}$/.test(value)) {
    const [, r, g, b] = value;
    return `#${r}${r}${g}${g}${b}${b}`;
  }

  const rgb = /^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/.exec(value);
  if (rgb) {
    const hex = (s: string) => Math.min(255, parseInt(s, 10)).toString(16).padStart(2, '0');
    return `#${hex(rgb[1] as string)}${hex(rgb[2] as string)}${hex(rgb[3] as string)}`;
  }

  return NAMED[value] ?? null;
}
