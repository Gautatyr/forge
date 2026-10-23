import { describe, expect, it } from 'vitest';
import { largestFit } from './tileFit';

describe('largestFit (tray card tiles shrink so the choices, key hints and confirm stay in view)', () => {
  it('keeps the full size when it fits', () => {
    expect(largestFit(4, 6.6, () => true)).toBeUndefined();
  });

  it('takes the largest size that fits, never below the minimum', () => {
    const size = largestFit(4, 6.6, (cw) => cw <= 5.2)!;
    expect(size).toBeLessThanOrEqual(5.2);
    expect(size).toBeGreaterThan(5.1);
  });

  it('leaves the full size (the body scrolls) when even the minimum does not fit', () => {
    expect(largestFit(4, 6.6, () => false)).toBeUndefined();
  });

  it('uses the minimum when only it fits', () => {
    expect(largestFit(4, 6.6, (cw) => cw <= 4)).toBe(4);
  });
});
