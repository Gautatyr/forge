/**
 * Size and place of the hover preview over the board. Pure geometry:
 * HoverPreview measures the DOM and applies the result.
 */
export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** The readable floor: 271x378 px (the in-rail size of PR #52). Never smaller. */
export const OVER_BOARD_MIN_W = 271;
const RATIO = 0.716;

/**
 * Image width: the size of the first fixed preview (2026-10-16, 486x678 px at 1920x1080): height at most 66 % of the
 * window and 58 rem, and what the board above the hand (`areaHeight`) leaves under a 3.5 rem notes block; never under
 * the floor. A function of the window only, never of the hovered card, so every card gets the same image.
 */
export function overBoardWidth(o: { rem: number; vh: number; areaHeight: number }): number {
  const h = Math.min(o.vh * 0.66, 58 * o.rem, o.areaHeight - 3.5 * o.rem);
  return Math.round(Math.max(OVER_BOARD_MIN_W, h * RATIO));
}

const overlap = (a: Box, b: Box): number => {
  const w = Math.min(a.left + a.width, b.left + b.width) - Math.max(a.left, b.left);
  const h = Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top);
  return w > 0 && h > 0 ? w * h : 0;
};

const grow = (b: Box, m: number): Box => ({ left: b.left - m, top: b.top - m, width: b.width + 2 * m, height: b.height + 2 * m });

/**
 * The top-left corner for a preview of `size` inside `area`. The spot is one place for every hovered card: flush with
 * the rail side, bottom on the hand. The hovered card is not avoided (the 2026-10-16 behaviour, the owner's "one fixed
 * place" ruling). Only what the open prompt is about moves it: the `keep` boxes (the cards and tray of the prompt, the
 * targets a hovered stack item lights). Candidates, first one clear of them wins: that spot, flush with the rail side
 * at the top, the far side (bottom, top), the middle (bottom, top). When nothing is clear, the candidate covering the
 * least of them wins (`clear: false`).
 */
export function placePreview(o: {
  area: Box;
  size: { width: number; height: number };
  keep: Box[];
  /** Clear space kept around the kept boxes. */
  gap?: number;
}): { left: number; top: number; clear: boolean } {
  const { area, size, keep, gap = 6 } = o;
  const maxLeft = Math.max(area.left, area.left + area.width - size.width);
  const maxTop = Math.max(area.top, area.top + area.height - size.height);
  const xs = [maxLeft, area.left, Math.min(maxLeft, Math.max(area.left, area.left + (area.width - size.width) / 2))];
  const ys = [maxTop, area.top];
  const avoid = keep.map((b) => grow(b, gap));
  let best = { left: xs[0]!, top: ys[0]!, clear: false };
  let bestScore = Infinity;
  for (const x of xs) {
    for (const y of ys) {
      const box = { left: x, top: y, width: size.width, height: size.height };
      const score = avoid.reduce((n, b) => n + overlap(box, b), 0);
      if (score < bestScore) [best, bestScore] = [{ left: x, top: y, clear: score === 0 }, score];
      if (score === 0) return best;
    }
  }
  return best;
}

/** Each retry takes this share off the width. */
const SHRINK = 0.94;

/**
 * The preview at `startWidth`, narrowed step by step (never under the readable floor) until `attempt` (place it,
 * measure it) finds a spot clear of what the open prompt is about; the floor's answer when none is.
 */
export function fitPreview<T extends { clear: boolean }>(startWidth: number, attempt: (width: number) => T): { width: number; at: T } {
  let width = Math.max(OVER_BOARD_MIN_W, startWidth);
  for (;;) {
    const at = attempt(width);
    if (at.clear || width <= OVER_BOARD_MIN_W) return { width, at };
    width = Math.max(OVER_BOARD_MIN_W, Math.floor(width * SHRINK));
  }
}
