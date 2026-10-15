import { describe, expect, it } from 'vitest';
import { fitBattlefield, fitRow, rowHeight } from './battlefieldLayout';
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

  /** Width the hand component lays out: staggered hand, group gap, other-zone cards with gaps between them. */
  const totalWidth = (n: number, extra: number, g: ReturnType<typeof handGeometry>) =>
    (n - 1) * g.step + g.cardW + (extra > 0 ? g.groupGap + extra * g.cardW + (extra - 1) * g.gap : 0);

  it('staggers 10 cards plus 2 castable from other zones at full size', () => {
    const g = handGeometry(10, 2, W, H, REM);
    expect(g.stagger).toBe(true);
    expect(g.cardW).toBeCloseTo(full, 5);
    expect(totalWidth(10, 2, g)).toBeLessThanOrEqual(W + 0.01);
  });

  // Large hands with other-zone cards shrink; the shrunk row still fits (review of PR 16).
  for (const [n, extra] of [
    [15, 2],
    [20, 2],
    [30, 3],
    [12, 4],
  ] as const) {
    it(`fits ${n} cards plus ${extra} castable from other zones in the width`, () => {
      const g = handGeometry(n, extra, W, H, REM);
      expect(g.stagger).toBe(true);
      expect(totalWidth(n, extra, g)).toBeLessThanOrEqual(W + 0.01);
      expect(2 * g.step).toBeGreaterThanOrEqual(g.cardW - 0.01);
    });
  }

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

describe('battlefield fitting (pass-3 spec, section 4)', () => {
  const plain = (n: number, tapped = false) => Array.from({ length: n }, () => ({ tapped, attachments: 0 }));
  const GAP = 8.8;
  const MIN = 72;
  const MAX = 180;

  it('caps a near-empty board at the maximum size', () => {
    const f = fitBattlefield(plain(1), plain(2), 1000, 600, GAP, MAX, MIN);
    expect(f.creatures.cw).toBe(MAX);
    expect(f.supportFactor).toBe(0.6);
    expect(f.support.cw).toBeCloseTo(MAX * 0.6, 5);
  });

  it('keeps the support row at 60 % when the creature row is width-bound', () => {
    const f = fitBattlefield(plain(8), plain(5), 1200, 400, GAP, MAX, MIN);
    expect(f.supportFactor).toBe(0.6);
    expect(f.support.cw).toBeCloseTo(f.creatures.cw * 0.6, 5);
  });

  it('fills the height: creature row + gap + support row', () => {
    const f = fitBattlefield(plain(3), plain(5), 900, 250, GAP, MAX, MIN);
    const used = rowHeight(plain(3), f.creatures.cw, f.creatures.lines, GAP) + GAP + rowHeight(plain(5), f.support.cw, f.support.lines, GAP);
    expect(used).toBeLessThanOrEqual(250 + 0.01);
    // One more pixel of creature width would not fit at any support size.
    const next = f.creatures.cw + 1;
    expect(rowHeight(plain(3), next, 1, GAP) + GAP + rowHeight(plain(5), next * 0.45, 1, GAP)).toBeGreaterThan(250);
  });

  it('shrinks the support row before wrapping creatures', () => {
    // Height-bound: support at 60 % would not fit at this creature size.
    const f = fitBattlefield(plain(2), plain(4), 900, 230, GAP, MAX, MIN);
    expect(f.creatures.lines).toBe(1);
    expect(f.supportFactor).toBeLessThan(0.6);
    expect(f.supportFactor).toBeGreaterThanOrEqual(0.45);
  });

  it('wraps creatures when one line would drop below the next size', () => {
    const f = fitBattlefield(plain(12), plain(2), 520, 600, GAP, MAX, MIN);
    expect(f.creatures.lines).toBeGreaterThan(1);
    expect(f.creatures.overlap).toBe(0);
  });

  it('never goes below 72 px: overlaps instead, within the width', () => {
    const n = 14;
    const f = fitBattlefield(plain(n), plain(10), 520, 200, GAP, MAX, MIN);
    expect(f.creatures.cw).toBe(MIN);
    expect(f.creatures.overlap).toBeGreaterThan(0);
    // Back cards never overlap each other: two steps >= one card width.
    const step = f.creatures.cw + GAP - f.creatures.overlap;
    expect(2 * step).toBeGreaterThanOrEqual(f.creatures.cw - 0.01);
    const perLine = Math.min(n, f.creatures.perLine);
    expect((perLine - 1) * step + f.creatures.cw).toBeLessThanOrEqual(520 + 0.01);
    expect(f.creatures.perLine * f.creatures.lines).toBeGreaterThanOrEqual(n);
  });

  it('counts tapped cards as wider', () => {
    const upright = fitBattlefield(plain(6), [], 500, 400, GAP, MAX, MIN);
    const tapped = fitBattlefield(plain(6, true), [], 500, 400, GAP, MAX, MIN);
    expect(tapped.creatures.cw).toBeLessThan(upright.creatures.cw);
  });

  it('keeps every line within the width', () => {
    for (const [c, s, w, h] of [
      [4, 5, 520, 250],
      [1, 6, 520, 250],
      [9, 8, 1360, 370],
      [8, 0, 1080, 290],
    ] as const) {
      const f = fitBattlefield(plain(c), plain(s), w, h, GAP, MAX, MIN);
      const line = (n: number, cw: number) => n * cw + (n - 1) * GAP;
      expect(line(Math.min(c, f.creatures.perLine), f.creatures.cw)).toBeLessThanOrEqual(w + 0.01);
      if (s) expect(line(Math.min(s, f.support.perLine), f.support.cw)).toBeLessThanOrEqual(w + 0.01);
    }
  });

  it('opponent seat in Columns at 1920x1080 gets ~118-125 px creatures', () => {
    // Battlefield content box of a Columns seat at 1920x1080 with a one-line header.
    const f = fitBattlefield(plain(4), plain(5), 505, 255, GAP, MAX, MIN);
    expect(f.creatures.cw).toBeGreaterThanOrEqual(113);
    expect(f.creatures.cw).toBeLessThanOrEqual(130);
  });

  it('fitRow (compact seats) wraps and stays within the box', () => {
    const f = fitRow(plain(8), 300, 600, GAP, MAX, 40);
    expect(f.lines).toBeGreaterThan(1);
    expect(rowHeight(plain(8), f.cw, f.lines, GAP)).toBeLessThanOrEqual(600);
  });
});
