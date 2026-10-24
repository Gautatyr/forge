import { useCallback, useLayoutEffect, useRef } from 'react';
import type { ChoiceDraft } from '../../state/ui';

/** Marks a pile area (value: the prompt id) whose `min-height` is held (`usePileFloor`); a tile re-fit (`fitTiles`) clears and restores it. */
export const PILE_FLOOR_ATTR = 'data-pile-floor';

/** The largest height seen: `floor` is `undefined` before any; a zero or NaN height (not laid out) is ignored. */
export function growOnly(floor: number | undefined, height: number): number | undefined {
  if (!(height > 0)) return floor;
  return floor === undefined ? height : Math.max(floor, height);
}

/** The held pile height of the current prompt, with the tile size (`--tile-cw`, '' in the list) it was measured at. */
export interface HeldFloor {
  promptId: string;
  cw: string;
  height: number;
}

/** The height to hold for this prompt at this tile size: none for another prompt or another tile size (the piles changed shape). */
export function floorFor(held: HeldFloor | undefined, promptId: string, cw: string): number | undefined {
  return held && held.promptId === promptId && held.cw === cw ? held.height : undefined;
}

// Module-level, not in the component: the pile area unmounts while the player peeks at the board (V), the prompt stays.
let held: HeldFloor | undefined;

const tileSize = (el: HTMLElement) => getComputedStyle(el).getPropertyValue('--tile-cw').trim();

/** After a tile re-fit settled: put the held height back on each pile area of `el` when the tile size is still the one it was held at, else forget it. */
export function restorePileFloor(el: HTMLElement): void {
  el.querySelectorAll<HTMLElement>(`[${PILE_FLOOR_ATTR}]`).forEach((p) => {
    const floor = floorFor(held, p.getAttribute(PILE_FLOOR_ATTR) ?? '', tileSize(p));
    if (floor === undefined) held = undefined;
    else p.style.minHeight = `${floor}px`;
  });
}

/**
 * Scry and surveil: the tray's height follows the taller of the two piles, so moving a card out of the taller one shrank
 * the tray and its top jumped from under the pointer (#151). Within one prompt the pile area never shrinks: just before
 * each change of the draft, its height is held as `min-height` (set on the element, not through React, so it stands before
 * the re-render; the height measured already includes the floor held so far). The held height outlives the pile area (Peek
 * unmounts it): a remount applies it again, and a tile re-fit (`fitTiles`) measures without it, then restores it
 * (`restorePileFloor`) unless the tile size changed. A new prompt starts without one.
 */
export function usePileFloor(promptId: string, setDraft: (d: ChoiceDraft) => void) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const floor = floorFor(held, promptId, tileSize(el));
    if (floor === undefined) el.style.removeProperty('min-height');
    else el.style.minHeight = `${floor}px`;
  }, [promptId]);
  const hold = useCallback(
    (d: ChoiceDraft) => {
      const el = ref.current;
      if (el) {
        const cw = tileSize(el);
        const height = growOnly(floorFor(held, promptId, cw), el.getBoundingClientRect().height);
        if (height !== undefined) {
          held = { promptId, cw, height };
          el.style.minHeight = `${height}px`;
        }
      }
      setDraft(d);
    },
    [promptId, setDraft],
  );
  return { ref, hold };
}
