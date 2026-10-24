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
 * Room kept above the image for the notes block (rem), the same for every card: the size and the clearance test count
 * it, the card's own notes never do.
 */
export const NOTES_RESERVE_REM = 3.5;
/** The gap between the notes block and the image (rem): `--sp-2`. */
export const NOTES_GAP_REM = 0.5;

/**
 * Image width: the size of the first fixed preview (2026-10-16, 486x678 px at 1920x1080): height at most 66 % of the
 * window and 58 rem, and what the board above the hand (`areaHeight`) leaves under the notes reserve; never under
 * the floor. A function of the window only, never of the hovered card, so every card gets the same image.
 */
export function overBoardWidth(o: { rem: number; vh: number; areaHeight: number }): number {
  const h = Math.min(o.vh * 0.66, 58 * o.rem, o.areaHeight - NOTES_RESERVE_REM * o.rem);
  return Math.round(Math.max(OVER_BOARD_MIN_W, h * RATIO));
}

const overlap = (a: Box, b: Box): number => {
  const w = Math.min(a.left + a.width, b.left + b.width) - Math.max(a.left, b.left);
  const h = Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top);
  return w > 0 && h > 0 ? w * h : 0;
};

const grow = (b: Box, m: number): Box => ({ left: b.left - m, top: b.top - m, width: b.width + 2 * m, height: b.height + 2 * m });

/**
 * The top-left corner for the preview IMAGE (`size`: the image box only, never the notes block) inside `area`. One place
 * for every hovered card: flush with the rail side, the image bottom on the hand. The hovered card is not avoided (the
 * 2026-10-16 behaviour, the owner's "one fixed place" ruling). Only what the open prompt is about moves it: the `keep`
 * boxes (the cards and tray of the prompt, the targets a hovered stack item lights). Candidates, first one clear of
 * them wins: that spot, flush with the rail side at the top, the far side (bottom, top), the middle (bottom, top).
 * When nothing is clear, the candidate covering the least of them wins (`clear: false`). A candidate is tested as the
 * image plus `reserve` px above it (the fixed notes reserve), so no card's notes height enters. The image top is
 * never above the area.
 */
export function placePreview(o: {
  area: Box;
  size: { width: number; height: number };
  keep: Box[];
  /** Clear space kept around the kept boxes. */
  gap?: number;
  /** Height above the image counted in the clearance test (the fixed notes reserve). */
  reserve?: number;
}): { left: number; top: number; clear: boolean } {
  const { area, size, keep, gap = 6, reserve = 0 } = o;
  const maxLeft = Math.max(area.left, area.left + area.width - size.width);
  const xs = [maxLeft, area.left, Math.min(maxLeft, Math.max(area.left, area.left + (area.width - size.width) / 2))];
  const onHand = Math.max(area.top, area.top + area.height - size.height);
  const ys = [onHand, Math.min(area.top + reserve, onHand)];
  const avoid = keep.map((b) => grow(b, gap));
  let best = { left: xs[0]!, top: ys[0]!, clear: false };
  let bestScore = Infinity;
  for (const x of xs) {
    for (const y of ys) {
      const box = { left: x, top: y - reserve, width: size.width, height: size.height + reserve };
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

/**
 * The whole layout of the preview: image width and corner, and how tall the notes block may be. `measure` sets the
 * image width in the page and reads back the image box and the notes block's natural height. The image rect is a
 * function of the window, the area and the prompt's `keep` boxes only: the notes height changes only `notes` (the
 * block grows upward from the image, a 0.5 rem gap above it, down to a 0.5 rem margin at the window top, and is
 * clipped there).
 */
export function layoutPreview(o: {
  area: Box;
  rem: number;
  vh: number;
  keep: Box[];
  measure: (width: number) => { image: { width: number; height: number }; notes: number };
}): { width: number; left: number; top: number; clear: boolean; notes: number } {
  const reserve = NOTES_RESERVE_REM * o.rem;
  const start = overBoardWidth({ rem: o.rem, vh: o.vh, areaHeight: o.area.height });
  let notes = 0;
  const { width, at } = fitPreview(start, (w) => {
    const m = o.measure(w);
    notes = m.notes;
    return placePreview({ area: o.area, size: m.image, keep: o.keep, reserve });
  });
  return { width, ...at, notes: Math.max(0, Math.min(notes, at.top - NOTES_GAP_REM * o.rem - 0.5 * o.rem)) };
}
