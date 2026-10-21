/**
 * Where the hover preview shows (HoverPreview.module.css). Its fixed spot is over the rail; a card hovered
 * inside the rail or the log drawer (elements carrying this attribute) would be covered there, so its preview
 * shows beside that panel, on its left: left of the drawer while it is open, else left of the rail.
 */
export const PREVIEW_BESIDE_ATTR = 'data-preview-beside';

export type PreviewSpot = 'rail' | 'besideRail' | 'besideDrawer';

interface Closest {
  closest(selector: string): unknown;
}

/** Whether the hovered element sits in a panel the preview must not cover. */
export function previewBeside(el: Closest): boolean {
  return el.closest(`[${PREVIEW_BESIDE_ATTR}]`) != null;
}

export function previewSpot(hover: { beside?: boolean }, logOpen: boolean): PreviewSpot {
  if (!hover.beside) return 'rail';
  return logOpen ? 'besideDrawer' : 'besideRail';
}
