/**
 * Card sizing for a battlefield. Pure maths, unit-tested.
 *
 * Two tiers (pass-3 spec, section 4): the creature row (creatures,
 * planeswalkers, battles) at full size, the support row (lands, other
 * permanents, the commander in the command zone) at 60 % of it. The area takes
 * the largest creature width that fits, up to `maxCw`. When space runs out:
 * 1. the support row shrinks, down to 45 %;
 * 2. creatures wrap onto more lines;
 * 3. cards overlap like the staggered hand (`overlap` > 0), at `minCw`, within
 *    the height; smaller than `minCw` only when even that cannot fit.
 */
export const RATIO = 0.716;
/** Share of a card's height an attachment peeks out above its host. */
export const ATTACH_PEEK = 0.17;
/** Staggered overlap: back cards are raised by this share of the height, so their name band shows. */
export const STAGGER_RAISE = 0.13;
/** Cards narrower than this (px) are compact: their name label and their counter chips share a band over the title bar. */
export const COMPACT_BELOW = 150;
/** Height of that band's counter chips, in rem (Card.module.css `.band`): the least a staggered back card is raised. */
export const CHIP_BAND_REM = 1.2;

/**
 * Extra lift of a tapped back card in a staggered line, in px: a tapped card is `cw` high where an upright one is
 * `cw / RATIO`, and the line is bottom-aligned, so without it the card's top (its title band) would sit that much
 * lower, under the front cards.
 */
export function tapLift(cw: number): number {
  return cw / RATIO - cw;
}

/**
 * How far a staggered line raises its back cards, in px: `STAGGER_RAISE` of the height, but at least `minRaise`
 * (the height of a counter chip), which on a tiny card is more than 13 %. The strip it exposes is all that shows
 * of a back card when the front cards cover the rest.
 */
export function staggerRaise(cw: number, minRaise = 0): number {
  return Math.max((cw / RATIO) * STAGGER_RAISE, minRaise);
}
/** Extra margin before a group separator, in gaps (Battlefield.module.css `.separator`). */
export const SEPARATOR_GAPS = 1.5;
const TAPPED_UNITS = 1 / RATIO;

/** Support row size as a share of the creature size, in the order they are tried. */
export const SUPPORT_FACTORS = [0.6, 0.55, 0.5, 0.45] as const;
const MAX_CREATURE_LINES = 4;
const MAX_SUPPORT_LINES = 3;
/** Staggered lines may cover at most this share of a card's width. */
export const MAX_COVER = 0.85;
const MAX_STAGGER_LINES = 8;

export interface LayoutItem {
  tapped: boolean;
  attachments: number;
  /** First entry of a new group: SEPARATOR_GAPS × gap before it (dropped in staggered lines). */
  separator?: boolean;
  /** Width the entry reserves even when its card is narrower (the command-zone caption), in px. */
  minW?: number;
}

export interface RowFit {
  /** Card width in px. */
  cw: number;
  lines: number;
  /** Items per line; the last line may hold fewer. */
  perLine: number;
  /** Staggered overlap: px each card after the first slides under its left neighbour. 0 = none. */
  overlap: number;
}

export interface BattlefieldFit {
  creatures: RowFit;
  support: RowFit;
  /** Support size / creature size. */
  supportFactor: number;
}

const EMPTY: RowFit = { cw: 0, lines: 1, perLine: 1, overlap: 0 };

function itemW(it: LayoutItem, cw: number) {
  return Math.max(it.tapped ? TAPPED_UNITS * cw : cw, it.minW ?? 0);
}

function maxAtt(items: LayoutItem[]) {
  return items.length ? Math.min(2, Math.max(...items.map((i) => i.attachments))) : 0;
}

/** Height of `lines` lines of cards `cw` wide; staggered lines add their back cards' raise. */
export function rowHeight(items: LayoutItem[], cw: number, lines: number, gap: number, staggered = false, minRaise = 0): number {
  if (items.length === 0) return 0;
  const ch = cw / RATIO;
  const line = ch * (1 + ATTACH_PEEK * maxAtt(items)) + (staggered ? staggerRaise(cw, minRaise) : 0);
  return lines * line + (lines - 1) * gap;
}

/** Width of the widest line as the flex line lays it out (separators count unless staggered), before overlap. */
export function widestLine(items: LayoutItem[], perLine: number, cw: number, gap: number, separators = true): number {
  let widest = 0;
  for (let i = 0; i < items.length; i += perLine) {
    const line = items.slice(i, i + perLine);
    const seps = separators ? line.filter((it) => it.separator).length * SEPARATOR_GAPS * gap : 0;
    widest = Math.max(widest, line.reduce((s, it) => s + itemW(it, cw), 0) + (line.length - 1) * gap + seps);
  }
  return widest;
}

/** Fewest lines (up to `maxLines`) in which the row fits `w`, or undefined. */
function wrap(items: LayoutItem[], cw: number, w: number, gap: number, maxLines: number): RowFit | undefined {
  if (items.length === 0) return { ...EMPTY, cw };
  for (let lines = 1; lines <= Math.min(maxLines, items.length); lines++) {
    const perLine = Math.ceil(items.length / lines);
    if (widestLine(items, perLine, cw, gap) <= w + 0.01) {
      return { cw, lines: Math.ceil(items.length / perLine), perLine, overlap: 0 };
    }
  }
  return undefined;
}

/** The row on at most `lines` lines at `cw`; staggered (separators dropped) when it does not fit `w` flat. */
function staggerRow(items: LayoutItem[], cw: number, w: number, gap: number, lines: number): RowFit {
  if (items.length === 0) return { ...EMPTY, cw };
  const perLine = Math.ceil(items.length / lines);
  const fit = { cw, lines: Math.ceil(items.length / perLine), perLine, overlap: 0 };
  if (widestLine(items, perLine, cw, gap) <= w + 0.01) return fit;
  const flat = widestLine(items, perLine, cw, gap, false);
  return { ...fit, overlap: perLine > 1 ? Math.max(1, (flat - w) / (perLine - 1)) : Infinity };
}

const covered = (r: RowFit) => (r.cw > 0 ? r.overlap / r.cw : 0);

/**
 * Last resort: staggered lines like the hand. Picks the line counts that fit
 * the height with the least overlap (then the fewest lines). Only when no
 * count fits does the size drop below `cw`: cards are never clipped.
 */
function stagger(creatures: LayoutItem[], support: LayoutItem[], w: number, h: number, gap: number, cw: number, f: number, minRaise: number): BattlefieldFit {
  const both = creatures.length > 0 && support.length > 0;
  for (let size = Math.floor(cw); size >= 8; size--) {
    let best: { c: RowFit; s: RowFit; score: number; lines: number } | undefined;
    for (let cl = 1; cl <= Math.min(MAX_STAGGER_LINES, Math.max(1, creatures.length)); cl++) {
      for (let sl = 1; sl <= Math.min(MAX_STAGGER_LINES, Math.max(1, support.length)); sl++) {
        const c = staggerRow(creatures, size, w, gap, cl);
        const s = staggerRow(support, size * f, w, gap, sl);
        if (covered(c) > MAX_COVER || covered(s) > MAX_COVER) continue;
        const height =
          rowHeight(creatures, size, c.lines, gap, c.overlap > 0, minRaise) +
          rowHeight(support, size * f, s.lines, gap, s.overlap > 0, minRaise) +
          (both ? gap : 0);
        if (height > h + 0.01) continue;
        const score = Math.max(covered(c), covered(s));
        const lines = c.lines + s.lines;
        if (!best || score < best.score - 1e-9 || (Math.abs(score - best.score) < 1e-9 && lines < best.lines)) {
          best = { c, s, score, lines };
        }
      }
    }
    if (best) return { creatures: best.c, support: best.s, supportFactor: f };
  }
  return { creatures: staggerRow(creatures, 8, w, gap, 1), support: staggerRow(support, 8 * f, w, gap, 1), supportFactor: f };
}

export function fitBattlefield(
  creatures: LayoutItem[],
  support: LayoutItem[],
  w: number,
  h: number,
  gap: number,
  maxCw: number,
  minCw: number,
  minRaise = 0,
): BattlefieldFit {
  if (w <= 0 || h <= 0 || creatures.length + support.length === 0) {
    return { creatures: EMPTY, support: EMPTY, supportFactor: SUPPORT_FACTORS[0] };
  }
  const configs: { cLines: number; f: number }[] = [
    ...SUPPORT_FACTORS.map((f) => ({ cLines: 1, f })),
    ...Array.from({ length: MAX_CREATURE_LINES - 1 }, (_, i) => ({ cLines: i + 2, f: SUPPORT_FACTORS.at(-1)! })),
  ];
  for (let cw = Math.floor(maxCw); cw >= minCw; cw--) {
    for (const { cLines, f } of configs) {
      const c = wrap(creatures, cw, w, gap, cLines);
      if (!c) continue;
      const s = wrap(support, cw * f, w, gap, MAX_SUPPORT_LINES);
      if (!s) continue;
      const both = creatures.length > 0 && support.length > 0;
      const height = rowHeight(creatures, cw, c.lines, gap) + rowHeight(support, cw * f, s.lines, gap) + (both ? gap : 0);
      if (height <= h + 0.01) return { creatures: c, support: s, supportFactor: f };
    }
  }
  return stagger(creatures, support, w, h, gap, minCw, SUPPORT_FACTORS.at(-1)!, minRaise);
}

/** Creatures only (Focus layout, compact seats): largest size that fits, wrapping as needed. */
export function fitRow(items: LayoutItem[], w: number, h: number, gap: number, maxCw: number, minCw: number, minRaise = 0): RowFit {
  if (items.length === 0 || w <= 0 || h <= 0) return EMPTY;
  for (let cw = Math.floor(maxCw); cw >= minCw; cw--) {
    for (let lines = 1; lines <= MAX_CREATURE_LINES; lines++) {
      const r = wrap(items, cw, w, gap, lines);
      if (r && rowHeight(items, cw, r.lines, gap) <= h + 0.01) return r;
    }
  }
  return stagger(items, [], w, h, gap, minCw, 1, minRaise).creatures;
}
