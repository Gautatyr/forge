/**
 * Where the overlay-key word chips go on a card: right-aligned, stacked up from
 * the bottom of `region`, each one jumping over any overlay it would cover
 * (state badges, group count, P/T, damage, counters, combat strip). What does
 * not fit collapses into a "+N" chip; nothing is drawn over an overlay.
 */

export interface Size {
  width: number;
  height: number;
}

/** In region coordinates: x to the right, y down from the region's top left. */
export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface WordChipPlacement {
  /** Distance from the region's bottom to each shown chip's bottom, in chip order. */
  bottoms: number[];
  /** Distance from the region's bottom to the "+N" chip (N = chips not shown), when there is one. */
  more?: number;
}

/** Overlap under half a pixel is rounding, not cover. */
const EPS = 0.5;

const overlaps = (a: Rect, b: Rect) =>
  Math.min(a.right, b.right) - Math.max(a.left, b.left) > EPS && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > EPS;

export function placeWordChips(region: Size, chips: Size[], more: Size, avoid: Rect[], gap: number): WordChipPlacement {
  // Lowest bottom offset from `from` up where the chip covers nothing and stays inside.
  const place = (chip: Size, from: number): number | undefined => {
    const width = Math.min(chip.width, region.width);
    let y = from;
    for (;;) {
      const r: Rect = { left: region.width - width, right: region.width, top: region.height - y - chip.height, bottom: region.height - y };
      if (r.top < -EPS) return undefined;
      const hit = avoid.filter((a) => overlaps(r, a));
      if (!hit.length) return y;
      y = region.height - Math.min(...hit.map((a) => a.top)) + gap;
    }
  };

  const bottoms: number[] = [];
  const above = (i: number) => (i < 0 ? 0 : bottoms[i]! + chips[i]!.height + gap);
  for (const chip of chips) {
    const y = place(chip, above(bottoms.length - 1));
    if (y === undefined) break;
    bottoms.push(y);
  }
  if (bottoms.length === chips.length) return { bottoms };
  for (;;) {
    const y = place(more, above(bottoms.length - 1));
    if (y !== undefined) return { bottoms, more: y };
    if (!bottoms.length) return { bottoms };
    bottoms.pop();
  }
}
