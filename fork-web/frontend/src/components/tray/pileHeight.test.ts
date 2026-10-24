import { describe, expect, it } from 'vitest';
import { floorFor, growOnly } from './pileHeight';

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

describe('floorFor (the held height survives Peek, which unmounts the pile area, but not a new prompt or a new tile size)', () => {
  const held = { promptId: 'p1', cw: '5.2rem', height: 77.3 };

  it('gives the held height back to the remounted pile area of the same prompt at the same tile size', () => {
    expect(floorFor(held, 'p1', '5.2rem')).toBe(77.3);
  });

  it('holds nothing before any move', () => {
    expect(floorFor(undefined, 'p1', '5.2rem')).toBeUndefined();
  });

  it('holds nothing for another prompt', () => {
    expect(floorFor(held, 'p2', '5.2rem')).toBeUndefined();
  });

  it('holds nothing when the tile size changed (the piles are another shape)', () => {
    expect(floorFor(held, 'p1', '4.4rem')).toBeUndefined();
    expect(floorFor(held, 'p1', '')).toBeUndefined();
  });
});
