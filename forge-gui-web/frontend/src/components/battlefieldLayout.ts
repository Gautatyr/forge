/**
 * Card sizing for a battlefield. Pure maths, unit-tested.
 *
 * Two tiers (pass-3 spec, section 4): the creature row (creatures,
 * planeswalkers, battles) at full size, the support row (lands, other
 * permanents, the commander in the command zone) at 60 % of it. The area takes
 * the largest creature width that fits, up to `maxCw`. When space runs out:
 * 1. the support row shrinks, down to 45 %;
 * 2. creatures wrap onto more lines;
 * 3. cards overlap like the staggered hand (`overlap` > 0), at `minCw`.
 */
export const RATIO = 0.716;
/** Share of a card's height an attachment peeks out above its host. */
export const ATTACH_PEEK = 0.17;
/** Staggered overlap: back cards are raised by this share of the height, so their name band shows. */
export const STAGGER_RAISE = 0.13;
const TAPPED_UNITS = 1 / RATIO;

/** Support row size as a share of the creature size, in the order they are tried. */
export const SUPPORT_FACTORS = [0.6, 0.55, 0.5, 0.45] as const;
const MAX_CREATURE_LINES = 4;
const MAX_SUPPORT_LINES = 3;

export interface LayoutItem {
  tapped: boolean;
  attachments: number;
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

function units(it: LayoutItem) {
  return it.tapped ? TAPPED_UNITS : 1;
}

function maxAtt(items: LayoutItem[]) {
  return items.length ? Math.min(2, Math.max(...items.map((i) => i.attachments))) : 0;
}

/** Height of `lines` lines of cards `cw` wide. */
export function rowHeight(items: LayoutItem[], cw: number, lines: number, gap: number): number {
  if (items.length === 0) return 0;
  const line = (cw / RATIO) * (1 + ATTACH_PEEK * maxAtt(items));
  return lines * line + (lines - 1) * gap;
}

function widestLine(items: LayoutItem[], perLine: number, cw: number, gap: number) {
  let widest = 0;
  for (let i = 0; i < items.length; i += perLine) {
    const line = items.slice(i, i + perLine);
    widest = Math.max(widest, line.reduce((s, it) => s + units(it) * cw, 0) + (line.length - 1) * gap);
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

/**
 * Staggered overlap at `cw`: as many cards per line as fit with at most half a
 * card covered (so back cards never cover each other), on as few lines as possible.
 */
function overlapRow(items: LayoutItem[], cw: number, w: number, gap: number): RowFit {
  if (items.length === 0) return { ...EMPTY, cw };
  const wide = Math.max(...items.map((it) => units(it) * cw));
  const maxPerLine = Math.max(1, Math.floor((w - wide) / (cw / 2)) + 1);
  const lines = Math.ceil(items.length / maxPerLine);
  const perLine = Math.ceil(items.length / lines);
  const natural = widestLine(items, perLine, cw, gap);
  const overlap = perLine > 1 && natural > w ? Math.min(cw / 2 + gap, (natural - w) / (perLine - 1)) : 0;
  return { cw, lines, perLine, overlap };
}

export function fitBattlefield(
  creatures: LayoutItem[],
  support: LayoutItem[],
  w: number,
  h: number,
  gap: number,
  maxCw: number,
  minCw: number,
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
  // Last resort: staggered lines at the minimum size.
  const f = SUPPORT_FACTORS.at(-1)!;
  return {
    creatures: overlapRow(creatures, minCw, w, gap),
    support: overlapRow(support, minCw * f, w, gap),
    supportFactor: f,
  };
}

/** Creatures only (Focus layout, compact seats): largest size that fits, wrapping as needed. */
export function fitRow(items: LayoutItem[], w: number, h: number, gap: number, maxCw: number, minCw: number): RowFit {
  if (items.length === 0 || w <= 0 || h <= 0) return EMPTY;
  for (let cw = Math.floor(maxCw); cw >= minCw; cw--) {
    for (let lines = 1; lines <= MAX_CREATURE_LINES; lines++) {
      const r = wrap(items, cw, w, gap, lines);
      if (r && rowHeight(items, cw, r.lines, gap) <= h + 0.01) return r;
    }
  }
  return overlapRow(items, minCw, w, gap);
}
