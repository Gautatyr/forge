/** Pure geometry for the board lines (Arrows.tsx), exported for tests. */
export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface Point {
  x: number;
  y: number;
}

/** Below this many visible pixels a stack item counts as scrolled out. */
const MIN_VISIBLE = 24;
const INSET = 8;

/**
 * Where a target line starts on a stack item: its centre, kept on the part
 * of the item its scroll region shows. Undefined when the item is scrolled
 * out (or nearly): a start on the region's edge would sit on another item
 * and read as that item's line.
 */
export function sourceY(item: Box, scroller: Box | undefined): number | undefined {
  const centre = (item.top + item.bottom) / 2;
  if (!scroller) return centre;
  const top = Math.max(item.top, scroller.top);
  const bottom = Math.min(item.bottom, scroller.bottom);
  if (bottom - top < MIN_VISIBLE) return undefined;
  return Math.min(Math.max(centre, top + INSET), bottom - INSET);
}

/**
 * End point for a line aimed at a box (a player plate): on the segment from
 * `from` to the box centre, at least `gap` outside the edge the segment
 * crosses. The line and its marker then stay off the plate's text.
 */
export function outsideAnchor(from: Point, box: Box, gap: number): Point {
  const cx = (box.left + box.right) / 2;
  const cy = (box.top + box.bottom) / 2;
  const dx = from.x - cx;
  const dy = from.y - cy;
  const len = Math.hypot(dx, dy);
  if (len === 0) return { x: cx, y: cy };
  const tx = dx === 0 ? Infinity : (box.right - box.left) / 2 / Math.abs(dx);
  const ty = dy === 0 ? Infinity : (box.bottom - box.top) / 2 / Math.abs(dy);
  const t = Math.min(tx, ty);
  if (t >= 1) return from; // the source is inside the box
  // Distance along the segment that puts the point `gap` past the crossed edge.
  const normal = (tx < ty ? Math.abs(dx) : Math.abs(dy)) / len;
  const s = Math.min(gap / normal, 3 * gap);
  return { x: cx + t * dx + (s * dx) / len, y: cy + t * dy + (s * dy) / len };
}
