import { describe, expect, it } from 'vitest';
import type { CardView } from '../model/types';
import { hiddenInCompact, inCreatureRow } from './battlefieldGroups';
import {
  COMPACT_BELOW,
  fitBattlefield,
  fitRow,
  MAX_COVER,
  RATIO,
  rowHeight,
  SEPARATOR_GAPS,
  STAGGER_RAISE,
  staggerRaise,
  tapLift,
  widestLine,
  type LayoutItem,
  type RowFit,
} from './battlefieldLayout';
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

  /** Width and height the Battlefield component lays out for a fit (staggered lines drop separators). */
  const laidOut = (items: LayoutItem[], r: RowFit) => {
    const perLine = Math.min(items.length, r.perLine);
    return {
      w: widestLine(items, perLine, r.cw, GAP, r.overlap === 0) - (perLine - 1) * r.overlap,
      h: rowHeight(items, r.cw, r.lines, GAP, r.overlap > 0),
    };
  };
  const fitsBox = (c: LayoutItem[], s: LayoutItem[], w: number, h: number) => {
    const f = fitBattlefield(c, s, w, h, GAP, MAX, MIN);
    const lc = laidOut(c, f.creatures);
    const ls = laidOut(s, f.support);
    expect(lc.w).toBeLessThanOrEqual(w + 0.01);
    expect(ls.w).toBeLessThanOrEqual(w + 0.01);
    expect(lc.h + ls.h + (c.length && s.length ? GAP : 0)).toBeLessThanOrEqual(h + 0.01);
    expect(f.creatures.perLine * f.creatures.lines).toBeGreaterThanOrEqual(c.length);
    expect(f.support.perLine * f.support.lines).toBeGreaterThanOrEqual(s.length);
    return f;
  };

  it('stays at 72 px and overlaps, within the width and the height', () => {
    const f = fitsBox(plain(14), plain(10), 520, 200);
    expect(f.creatures.cw).toBe(MIN);
    expect(f.creatures.overlap).toBeGreaterThan(0);
    expect(f.creatures.overlap / f.creatures.cw).toBeLessThanOrEqual(MAX_COVER);
  });

  it('fits a large ungrouped token board in the height at 72 px (review of PR 26)', () => {
    // Columns opponent seat at 1920×1080: content box ~ 499 × 255.
    const f = fitsBox(plain(16), plain(14), 499, 255);
    expect(f.creatures.cw).toBe(MIN);
    expect(f.creatures.overlap).toBeGreaterThan(0);
  });

  it('shrinks below 72 px only when even maximal overlap cannot fit the height', () => {
    const f = fitsBox(plain(30), plain(30), 300, 110);
    expect(f.creatures.cw).toBeLessThan(MIN);
    expect(f.creatures.overlap / f.creatures.cw).toBeLessThanOrEqual(MAX_COVER);
  });

  it('counts group separators and the command-zone caption in the width (review of PR 26)', () => {
    const sep = (it: LayoutItem) => ({ ...it, separator: true });
    // Others, then lands (separator), then the commander (separator, caption 88 px).
    const support: LayoutItem[] = [...plain(3), sep(plain(1)[0]!), ...plain(4), { ...sep(plain(1)[0]!), minW: 88 }];
    expect(widestLine(support, support.length, 50, GAP)).toBeCloseTo(8 * 50 + 88 + 8 * GAP + 2 * SEPARATOR_GAPS * GAP, 5);
    expect(widestLine(support, support.length, 50, GAP, false)).toBeCloseTo(8 * 50 + 88 + 8 * GAP, 5);
    for (const [c, w, h] of [
      [4, 714, 300],
      [3, 536, 255],
      [6, 499, 255],
      [2, 360, 150],
    ] as const) {
      fitsBox(plain(c), support, w, h);
    }
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

  it('fitRow (compact seats) staggers within the height when wrapping is not enough', () => {
    const f = fitRow(plain(20), 300, 60, GAP, MAX, 32);
    expect(laidOut(plain(20), f).w).toBeLessThanOrEqual(300 + 0.01);
    expect(laidOut(plain(20), f).h).toBeLessThanOrEqual(60 + 0.01);
  });

  it('fitRow (compact seats) wraps and stays within the box', () => {
    const f = fitRow(plain(8), 300, 600, GAP, MAX, 40);
    expect(f.lines).toBeGreaterThan(1);
    expect(rowHeight(plain(8), f.cw, f.lines, GAP)).toBeLessThanOrEqual(600);
  });
});

const face = (typeLine: string) => ({ name: typeLine, manaCost: '', typeLine, oracleText: '' });
function card(id: string, typeLine: string, extra: Partial<CardView> = {}): CardView {
  return {
    id,
    name: typeLine,
    front: face(typeLine),
    ownerId: 'p',
    controllerId: 'p',
    zone: 'battlefield',
    isToken: false,
    isCommander: false,
    tapped: false,
    summoningSick: false,
    counters: [],
    damage: 0,
    ptModifiers: [],
    keywords: [],
    attachments: [],
    ...extra,
  };
}

describe('creature row and compact seats (pass-3 spec, section 4)', () => {
  it('puts creatures, planeswalkers, battles and land creatures in the creature row', () => {
    expect(inCreatureRow(card('a', 'Creature — Goblin'))).toBe(true);
    expect(inCreatureRow(card('b', 'Legendary Planeswalker — Jace'))).toBe(true);
    expect(inCreatureRow(card('c', 'Battle — Siege'))).toBe(true);
    expect(inCreatureRow(card('d', 'Land Creature — Forest Dryad'))).toBe(true);
    expect(inCreatureRow(card('e', 'Basic Land — Island'))).toBe(false);
    expect(inCreatureRow(card('f', 'Artifact'))).toBe(false);
    expect(inCreatureRow(card('g', 'Enchantment — Aura'))).toBe(false);
  });

  it('counts only what a compact seat does not draw (review of PR 26)', () => {
    const cards = [
      card('goblin', 'Creature — Goblin', { attachments: ['sword'] }),
      card('sword', 'Artifact — Equipment', { attachedTo: 'goblin' }),
      card('jace', 'Legendary Planeswalker — Jace'),
      card('siege', 'Battle — Siege'),
      card('arbor', 'Land Creature — Forest Dryad'),
      card('rock', 'Artifact'),
      card('island', 'Basic Land — Island'),
      card('swamp', 'Basic Land — Swamp', { tapped: true }),
    ];
    const all = Object.fromEntries(cards.map((c) => [c.id, c]));
    expect(hiddenInCompact(cards, all)).toEqual({ others: 1, lands: 2, untappedLands: 1 });
  });
});

describe('staggered back cards keep their counter chips in view (issue #173)', () => {
  const plain = (n: number) => Array.from({ length: n }, () => ({ tapped: false, attachments: 0 }));
  const GAP = 8.8;
  const CHIP = 14;

  it('raises a back card by the chip band even when 13 % of a tiny card is less', () => {
    expect(32 / RATIO * STAGGER_RAISE).toBeLessThan(CHIP);
    expect(staggerRaise(32, CHIP)).toBe(CHIP);
    expect(staggerRaise(32)).toBeCloseTo((32 / RATIO) * STAGGER_RAISE, 9);
  });

  it('leaves large cards at 13 % of their height', () => {
    expect(staggerRaise(200, CHIP)).toBeCloseTo((200 / RATIO) * STAGGER_RAISE, 9);
  });

  it('counts the raise in a staggered row height, and only there', () => {
    const items = plain(10);
    expect(rowHeight(items, 32, 1, GAP, true, CHIP) - rowHeight(items, 32, 1, GAP, false, CHIP)).toBeCloseTo(CHIP, 9);
    expect(rowHeight(items, 32, 1, GAP, false, CHIP)).toBeCloseTo(rowHeight(items, 32, 1, GAP), 9);
  });

  it('shrinks the cards so the box still holds when every staggered line carries the larger raise', () => {
    const [w, h] = [420, 200];
    const used = (f: ReturnType<typeof fitBattlefield>) =>
      rowHeight(plain(6), f.creatures.cw, f.creatures.lines, GAP, f.creatures.overlap > 0, CHIP) +
      rowHeight(plain(60), f.support.cw, f.support.lines, GAP, f.support.overlap > 0, CHIP) +
      GAP;
    const unaware = fitBattlefield(plain(6), plain(60), w, h, GAP, 180, 72);
    const aware = fitBattlefield(plain(6), plain(60), w, h, GAP, 180, 72, CHIP);
    expect(aware.support.overlap).toBeGreaterThan(0);
    // A fit that ignores the chip raise overflows once the raise is counted (it passes only on the old fit) ...
    expect(used(unaware)).toBeGreaterThan(h + 0.01);
    // ... and the fit that knows it takes smaller cards and stays inside.
    expect(aware.creatures.cw).toBeLessThan(unaware.creatures.cw);
    expect(used(aware)).toBeLessThanOrEqual(h + 0.01);
  });

  it('lifts a tapped back card by the height an upright one has over it, so both tops line up', () => {
    expect(tapLift(100)).toBeCloseTo(100 / RATIO - 100, 9);
    expect(tapLift(100) + 100).toBeCloseTo(100 / RATIO, 9);
  });

  it('draws counters in the title band of cards narrower than the name-label width', () => {
    expect(COMPACT_BELOW).toBe(150);
  });
});
