/**
 * Where the hover preview sits when it shows over the board (previewSpot.ts: short rail columns). Pure geometry:
 * HoverPreview measures the DOM and applies the result.
 */
export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** The readable size: the in-rail preview image at 1920x1080 (271x378 px). Never smaller over the board. */
export const OVER_BOARD_MIN_W = 271;
/** Width of the image in rem at the 1080p root size (16 px); it grows with the root size above that. */
const OVER_BOARD_REM_W = 16.94;
const RATIO = 0.716;

/** Image width over the board: at least the 1920 size, scaled with the UI, never taller than 70 % of the area. */
export function overBoardWidth(rem: number, areaHeight: number): number {
  return Math.round(Math.max(OVER_BOARD_MIN_W, Math.min(OVER_BOARD_REM_W * rem, areaHeight * 0.7 * RATIO)));
}

const overlap = (a: Box, b: Box): number => {
  const w = Math.min(a.left + a.width, b.left + b.width) - Math.max(a.left, b.left);
  const h = Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top);
  return w > 0 && h > 0 ? w * h : 0;
};

const grow = (b: Box, m: number): Box => ({ left: b.left - m, top: b.top - m, width: b.width + 2 * m, height: b.height + 2 * m });

/**
 * The top-left corner for a preview of `size` inside `area` that covers neither the hovered card nor any `keep` box
 * (the cards and tray of an open prompt). Candidates, first clear one wins: flush with the rail side, then the far
 * side, then the middle; each at the hovered card's height, then at the top, then at the bottom. When nothing is
 * clear, the candidate covering the least of them (the hovered card weighs most) wins.
 */
export function placePreview(o: {
  area: Box;
  size: { width: number; height: number };
  hovered?: Box;
  keep: Box[];
  /** Clear space kept around the hovered card and the kept boxes. */
  gap?: number;
}): { left: number; top: number } {
  const { area, size, hovered, keep, gap = 6 } = o;
  const maxLeft = Math.max(area.left, area.left + area.width - size.width);
  const maxTop = Math.max(area.top, area.top + area.height - size.height);
  const clampX = (x: number) => Math.min(maxLeft, Math.max(area.left, x));
  const clampY = (y: number) => Math.min(maxTop, Math.max(area.top, y));
  const xs = [maxLeft, area.left, clampX(area.left + (area.width - size.width) / 2)];
  const mid = hovered ? hovered.top + hovered.height / 2 - size.height / 2 : maxTop;
  const ys = [clampY(mid), area.top, maxTop];
  const avoid = keep.map((b) => grow(b, gap));
  const hov = hovered ? grow(hovered, gap) : undefined;
  let best = { left: xs[0]!, top: ys[0]! };
  let bestScore = Infinity;
  for (const x of xs) {
    for (const y of ys) {
      const box = { left: x, top: y, width: size.width, height: size.height };
      const score = (hov ? overlap(box, hov) * 1000 : 0) + avoid.reduce((n, b) => n + overlap(box, b), 0);
      if (score < bestScore) [best, bestScore] = [{ left: x, top: y }, score];
      if (score === 0) return best;
    }
  }
  return best;
}
