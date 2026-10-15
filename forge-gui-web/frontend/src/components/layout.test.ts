import { describe, expect, it } from 'vitest';
import { fitBattlefield, fitRow, RATIO } from './battlefieldLayout';
import { handGeometry } from './handLayout';

// Hand area at 1920×1080 with 16px rem: 1920 − rail 288 − padding 32 = 1600 wide, 25vh = 270 tall.
const W = 1600;
const H = 270;
const REM = 16;

describe('handGeometry (ruling D2)', () => {
  it('keeps 9 cards flat with no overlap at 1920×1080', () => {
    const g = handGeometry(9, 0, W, H, REM);
    expect(g.stagger).toBe(false);
    expect(g.step).toBeGreaterThanOrEqual(g.cardW);
    expect(g.cardW).toBeGreaterThan(140);
  });

  it('keeps 9 cards plus 2 castable from other zones flat', () => {
    const g = handGeometry(9, 2, W, H, REM);
    expect(g.stagger).toBe(false);
    expect(g.step).toBeGreaterThanOrEqual(g.cardW);
  });

  it('staggers 12 cards so no name band is covered', () => {
    const g = handGeometry(12, 0, W, H, REM);
    expect(g.stagger).toBe(true);
    // Back cards (odd) sit `raise` higher than front cards: their name band
    // (13 % of the height) stays above the front cards' top edge.
    expect(g.raise).toBeGreaterThanOrEqual(g.cardH * 0.13 - 0.01);
    // Back cards never overlap each other: two steps ≥ one card width.
    expect(2 * g.step).toBeGreaterThanOrEqual(g.cardW - 0.01);
    // Everything fits in the area.
    expect(11 * g.step + g.cardW).toBeLessThanOrEqual(W + 0.01);
    expect(g.cardH + g.raise).toBeLessThanOrEqual(H);
  });

  // Ruling from mockup review 1: beyond 9 cards, stagger right away; no shrinking step first.
  const full = handGeometry(1, 0, W, H, REM).cardW;
  for (const n of [10, 12, 15]) {
    it(`staggers ${n} cards at full size`, () => {
      const g = handGeometry(n, 0, W, H, REM);
      expect(g.stagger).toBe(true);
      expect(g.cardW).toBeCloseTo(full, 5);
      expect((n - 1) * g.step + g.cardW).toBeLessThanOrEqual(W + 0.01);
      expect(2 * g.step).toBeGreaterThanOrEqual(g.cardW - 0.01);
    });
  }

  it('staggers 10 cards plus 2 castable from other zones at full size', () => {
    const g = handGeometry(10, 2, W, H, REM);
    expect(g.stagger).toBe(true);
    expect(g.cardW).toBeCloseTo(full, 5);
  });

  it('keeps 10+ cards flat only when they fit at full size with no overlap', () => {
    const g = handGeometry(10, 0, 4000, H, REM);
    expect(g.stagger).toBe(false);
    expect(g.cardW).toBeCloseTo(full, 5);
    expect(g.step).toBeGreaterThanOrEqual(g.cardW);
  });

  it('fits 20 cards in the width', () => {
    const g = handGeometry(20, 0, W, H, REM);
    expect(19 * g.step + g.cardW).toBeLessThanOrEqual(W + 0.01);
    expect(2 * g.step).toBeGreaterThanOrEqual(g.cardW - 0.01);
  });
});

describe('battlefield fitting', () => {
  const plain = (n: number, tapped = false) => Array.from({ length: n }, () => ({ tapped, attachments: 0 }));

  it('is limited by height when there are few cards', () => {
    const f = fitRow(plain(2), 1000, 140, 8, 1, 400);
    expect(f.lines).toBe(1);
    expect(f.cw).toBeCloseTo(140 * RATIO, 5);
  });

  it('wraps onto more lines in a tall narrow seat', () => {
    const f = fitRow(plain(8), 300, 600, 8, 1, 400);
    expect(f.lines).toBeGreaterThan(1);
    expect(f.perLine * f.lines).toBeGreaterThanOrEqual(8);
  });

  it('counts tapped cards as wider', () => {
    const upright = fitRow(plain(6), 500, 400, 8, 1, 400);
    const tapped = fitRow(plain(6, true), 500, 400, 8, 1, 400);
    expect(tapped.cw).toBeLessThan(upright.cw);
  });

  it('uses one row when the seat is wide and short', () => {
    const f = fitBattlefield(plain(3), plain(3), 1500, 200, 8, 1, 400);
    expect(f.arrangement).toBe('one-row');
  });

  it('uses two rows when the seat is tall', () => {
    const f = fitBattlefield(plain(6), plain(8), 900, 400, 8, 1, 400);
    expect(f.arrangement).toBe('two-rows');
  });
});
