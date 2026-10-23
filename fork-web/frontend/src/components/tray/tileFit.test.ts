import { describe, expect, it } from 'vitest';
import { largestFit, noRegrow } from './tileFit';

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

describe('noRegrow (the tray height cap and the tile size must not flip every frame)', () => {
  it('never grows back within a prompt', () => {
    // what the fit finds frame by frame while the dock cap switches: shrink, room appears, shrink, room appears
    let floor = Infinity;
    const applied: (number | undefined)[] = [];
    for (const found of [undefined, 4.99, undefined, 5.4, undefined, 4.5, 6]) {
      const next = noRegrow(found, floor);
      floor = next.floor;
      applied.push(next.size);
    }
    expect(applied).toEqual([undefined, 4.99, 4.99, 4.99, 4.99, 4.5, 4.5]);
  });

  it('starts from the full size again for a new prompt or a resized window (floor Infinity)', () => {
    expect(noRegrow(undefined, Infinity)).toEqual({ size: undefined, floor: 6.6 });
    expect(noRegrow(5, Infinity)).toEqual({ size: 5, floor: 5 });
  });
});
