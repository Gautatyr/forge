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

export type NotesSide = 'above' | 'left' | 'right';

/** Narrowest notes block put beside the image (rem). */
const NOTES_BESIDE_MIN_REM = 8;

export interface NotesPlace {
  side: NotesSide;
  /** The width the block may take: the image width above it, the room beside it otherwise. */
  maxWidth: number;
  /** The block's own box (`measure`'s size at `maxWidth`, anchored to the image). */
  box: Box;
  /** Set only when no candidate holds every row: the block is cut to this height (last resort). */
  maxHeight: number | null;
}

/**
 * Where the notes block goes, given the placed IMAGE `image`. `measure` sets the block's side and max width in the page and
 * reads its size back (above: exactly the image width; beside: as wide as its rows need, up to `maxWidth`). Candidates, first
 * that holds every row (never cut) and keeps clear of the `keep` boxes wins: above the image at the image's width (a
 * `NOTES_GAP_REM` gap, down to a 0.5 rem margin at the window top); then beside the image to its left, at the image's top, at
 * growing widths; then to its right. The beside block may run down to the bottom of `area`, then to the window bottom. When
 * nothing holds every row clear of `keep`, the one that holds every row and covers the least of it; when nothing holds
 * every row, the one that loses the fewest pixels, cut (`maxHeight`). No card's notes ever move the image.
 */
export function layoutNotes(o: {
  image: Box;
  area: Box;
  rem: number;
  vh: number;
  keep: Box[];
  gap?: number;
  measure: (side: NotesSide, maxWidth: number) => { width: number; height: number };
}): NotesPlace {
  const { image, area, rem, vh, keep } = o;
  const gap = o.gap ?? NOTES_GAP_REM * rem;
  const m = 0.5 * rem;
  const avoid = keep.map((b) => grow(b, gap));
  const cands: { side: NotesSide; maxWidth: number; box: Box; lost: number; lostWin: number; covered: number }[] = [];
  const add = (side: NotesSide, maxWidth: number) => {
    const { width, height } = o.measure(side, maxWidth);
    const top = side === 'above' ? image.top - gap - height : image.top;
    const left = side === 'above' ? image.left : side === 'left' ? image.left - gap - width : image.left + image.width + gap;
    const box = { left, top, width: side === 'above' ? image.width : width, height };
    // Pixels of the block cut off: at the window top (above), past the bottom of the area / of the window (beside).
    const lost = side === 'above' ? Math.max(0, m - top) : Math.max(0, top + height - (area.top + area.height));
    const lostWin = side === 'above' ? lost : Math.max(0, top + height - (vh - m));
    cands.push({ side, maxWidth, box, lost, lostWin, covered: avoid.reduce((n, b) => n + overlap(box, b), 0) });
  };
  add('above', image.width);
  const roomLeft = image.left - gap - m;
  const roomRight = area.left + area.width - (image.left + image.width) - gap;
  for (const [side, room] of [['left', roomLeft], ['right', roomRight]] as const) {
    if (room < NOTES_BESIDE_MIN_REM * rem) continue;
    const widths = [...new Set([14, 22, 32].map((r) => Math.min(room, r * rem)).concat(room).map(Math.floor))].sort((a, b) => a - b);
    for (const w of widths) add(side, w);
  }
  const pick =
    cands.find((c) => c.lost === 0 && c.covered === 0) ??
    cands.find((c) => c.lostWin === 0 && c.covered === 0) ??
    cands.filter((c) => c.lostWin === 0).sort((a, b) => a.covered - b.covered)[0] ??
    [...cands].sort((a, b) => a.lostWin - b.lostWin)[0]!;
  const cut = pick.lostWin > 0 ? pick.box.height - pick.lostWin : null;
  return { side: pick.side, maxWidth: pick.maxWidth, box: pick.box, maxHeight: cut === null ? null : Math.max(0, cut) };
}

/**
 * The whole layout of the preview: image width and corner, and the notes block's place. `measure` sets the image width in the
 * page and reads back the image box; `measureNotes` sets the notes block's side and max width and reads its size. The image
 * rect is a function of the window, the area and the prompt's `keep` boxes only: the notes never change it (see `layoutNotes`).
 */
export function layoutPreview(o: {
  area: Box;
  rem: number;
  vh: number;
  keep: Box[];
  measure: (width: number) => { width: number; height: number };
  measureNotes: (side: NotesSide, maxWidth: number) => { width: number; height: number };
}): { width: number; left: number; top: number; clear: boolean; notes: NotesPlace } {
  const reserve = NOTES_RESERVE_REM * o.rem;
  const start = overBoardWidth({ rem: o.rem, vh: o.vh, areaHeight: o.area.height });
  const { width, at } = fitPreview(start, (w) => placePreview({ area: o.area, size: o.measure(w), keep: o.keep, reserve }));
  // The image is set to its final width before the notes are measured beside it (the above block takes that width).
  const image = o.measure(width);
  const notes = layoutNotes({ image: { left: at.left, top: at.top, ...image }, area: o.area, rem: o.rem, vh: o.vh, keep: o.keep, measure: o.measureNotes });
  return { width, ...at, notes };
}
