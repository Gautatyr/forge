/**
 * Where the hover preview shows (HoverPreview.module.css). Its fixed spot is over the rail; a card hovered
 * inside the rail or the log drawer (elements carrying this attribute) would be covered there, so its preview
 * shows beside that panel, on its left: left of the drawer while it is open, else left of the rail.
 * At small heights (the rail's panel column under IN_RAIL_MIN_COLUMN_REM) the rail cannot hold a readable preview and
 * complete Stack and Combat panels: the preview shows over the board instead (previewPlacement.ts; owner ruling
 * 2026-10-22, match-screen-decisions.md).
 */
export const PREVIEW_BESIDE_ATTR = 'data-preview-beside';

/**
 * Height of the rail's panel column (the area above the action block), in rem, under which the preview leaves the
 * rail. rem scales with the window height down to 844 px, so this is a fixed set of window heights: 1920x1080 is
 * 50 rem (rail), 1366x768 is 44 and 1280x720 is 40 (over the board).
 */
export const IN_RAIL_MIN_COLUMN_REM = 48;

export type PreviewSpot = 'rail' | 'besideRail' | 'besideDrawer' | 'overBoard';

interface Closest {
  closest(selector: string): unknown;
}

/** Whether the hovered element sits in a panel the preview must not cover. */
export function previewBeside(el: Closest): boolean {
  return el.closest(`[${PREVIEW_BESIDE_ATTR}]`) != null;
}

/** `columnRem`: the rail's panel column height in rem; 0 or absent (not measured yet) keeps the rail spot. */
export function previewSpot(hover: { beside?: boolean }, logOpen: boolean, columnRem = 0): PreviewSpot {
  if (hover.beside) return logOpen ? 'besideDrawer' : 'besideRail';
  return columnRem > 0 && columnRem < IN_RAIL_MIN_COLUMN_REM ? 'overBoard' : 'rail';
}
