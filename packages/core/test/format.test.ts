import { describe, expect, it } from 'vitest';
import { formatCoord } from '../src/emit/format.js';

describe('formatCoord', () => {
  it('rounds to 3 decimals (1 µm)', () => {
    expect(formatCoord(12.34567)).toBe('12.346');
  });

  it('strips trailing zeros to keep the stream small', () => {
    expect(formatCoord(10)).toBe('10');
    expect(formatCoord(10.5)).toBe('10.5');
    expect(formatCoord(10.1)).toBe('10.1');
  });

  it('never emits -0', () => {
    expect(formatCoord(-0.0001)).toBe('0');
    expect(formatCoord(-0)).toBe('0');
  });

  it('rejects non-finite input instead of emitting NaN into a G-code stream', () => {
    expect(() => formatCoord(Number.NaN)).toThrow(RangeError);
    expect(() => formatCoord(Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });
});
