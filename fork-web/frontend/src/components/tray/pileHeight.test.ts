import { describe, expect, it } from 'vitest';
import { growOnly } from './pileHeight';

describe('growOnly (the pile area of scry/surveil never shrinks within a prompt, so the tray does not move)', () => {
  it('starts at the first height seen', () => {
    expect(growOnly(undefined, 77.3)).toBe(77.3);
  });

  it('keeps the tallest height when a pile drops from two rows to one', () => {
    expect(growOnly(77.3, 48.1)).toBe(77.3);
  });

  it('grows when a pile gets taller', () => {
    expect(growOnly(48.1, 77.3)).toBe(77.3);
  });

  it('ignores an unmeasured (hidden or zero) height', () => {
    expect(growOnly(77.3, 0)).toBe(77.3);
    expect(growOnly(undefined, NaN)).toBeUndefined();
  });
});
