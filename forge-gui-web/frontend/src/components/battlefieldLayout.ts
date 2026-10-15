/**
 * Card sizing for a battlefield. Pure maths, unit-tested.
 *
 * Tries two arrangements and keeps the one that gives creatures the biggest
 * cards: creatures and "support" (other permanents + lands) in two rows, or
 * everything in one row. Each row may wrap onto up to four lines.
 */
export const RATIO = 0.716;
/** Share of a card's height an attachment peeks out above its host. */
export const ATTACH_PEEK = 0.17;
const TAPPED_UNITS = 1 / RATIO;

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
}

export interface BattlefieldFit {
  arrangement: 'two-rows' | 'one-row';
  creatures: RowFit;
  support: RowFit;
}

function units(it: LayoutItem) {
  return it.tapped ? TAPPED_UNITS : 1;
}

export function fitRow(items: LayoutItem[], w: number, h: number, gap: number, scale: number, maxCw: number): RowFit {
  if (items.length === 0 || w <= 0 || h <= 0) return { cw: 0, lines: 1, perLine: Math.max(1, items.length) };
  const maxAtt = Math.min(2, Math.max(...items.map((i) => i.attachments)));
  let best: RowFit = { cw: 0, lines: 1, perLine: items.length };
  for (let lines = 1; lines <= Math.min(4, items.length); lines++) {
    const lineH = (h - (lines - 1) * gap) / lines;
    const byH = (lineH / (1 + ATTACH_PEEK * maxAtt)) * RATIO * scale;
    const perLine = Math.ceil(items.length / lines);
    let widest = 0;
    for (let i = 0; i < items.length; i += perLine) {
      const lineUnits = items.slice(i, i + perLine).reduce((s, it) => s + units(it), 0);
      widest = Math.max(widest, lineUnits);
    }
    const count = Math.min(perLine, items.length);
    const byW = (w - (count - 1) * gap) / widest;
    const cw = Math.min(byH, byW, maxCw);
    if (cw > best.cw * 1.02) best = { cw, lines: Math.ceil(items.length / perLine), perLine };
  }
  return best;
}

export function fitBattlefield(
  creatures: LayoutItem[],
  support: LayoutItem[],
  w: number,
  h: number,
  gap: number,
  scale: number,
  maxCw: number,
): BattlefieldFit {
  if (creatures.length === 0 || support.length === 0) {
    const all = [...creatures, ...support];
    const f = fitRow(all, w, h, gap, scale, maxCw);
    return { arrangement: 'one-row', creatures: f, support: f };
  }
  const rowGap = gap;
  const twoC = fitRow(creatures, w, (h - rowGap) * 0.6, gap, scale, maxCw);
  const twoS = fitRow(support, w, (h - rowGap) * 0.4, gap, scale, maxCw);
  // One row: support gets a little extra gap as a separator.
  const one = fitRow([...creatures, ...support], w - gap * 3.5, h, gap, scale, maxCw);
  if (one.cw > twoC.cw * 1.04) return { arrangement: 'one-row', creatures: one, support: one };
  return { arrangement: 'two-rows', creatures: twoC, support: twoS };
}
