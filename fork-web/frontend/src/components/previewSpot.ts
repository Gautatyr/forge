/**
 * The hover preview shows over the board (HoverPreview.tsx, previewPlacement.ts). A card hovered inside the rail or the
 * log drawer (elements carrying this attribute) is covered by neither: the preview lands flush with that panel's board
 * side, at the hovered element's height.
 */
export const PREVIEW_BESIDE_ATTR = 'data-preview-beside';

interface Closest {
  closest(selector: string): unknown;
}

/** Whether the hovered element sits in a panel the preview must not cover. */
export function previewBeside(el: Closest): boolean {
  return el.closest(`[${PREVIEW_BESIDE_ATTR}]`) != null;
}
