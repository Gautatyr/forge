import { useCallback, useLayoutEffect, useRef } from 'react';
import type { ChoiceDraft } from '../../state/ui';

/** Marks a pile area whose `min-height` is held (`usePileFloor`); a tile re-fit clears it (`fitTiles`) before it measures. */
export const PILE_FLOOR_ATTR = 'data-pile-floor';

/** The largest height seen: `floor` is `undefined` before any; a zero or NaN height (not laid out) is ignored. */
export function growOnly(floor: number | undefined, height: number): number | undefined {
  if (!(height > 0)) return floor;
  return floor === undefined ? height : Math.max(floor, height);
}

/**
 * Scry and surveil: the tray's height follows the taller of the two piles, so moving a card out of the taller one shrank
 * the tray and its top jumped from under the pointer (#151). Within one prompt the pile area never shrinks: just before
 * each change of the draft, its height is held as `min-height`. It is set on the element, not through React, so it
 * stands before the re-render; the height measured already includes the floor held so far. Reset on a new prompt;
 * a tile re-fit clears it (`fitTiles`) before it measures.
 */
export function usePileFloor(promptId: string, setDraft: (d: ChoiceDraft) => void) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    ref.current?.style.removeProperty('min-height');
  }, [promptId]);
  const hold = useCallback(
    (d: ChoiceDraft) => {
      const el = ref.current;
      if (el) {
        const floor = growOnly(parseFloat(el.style.minHeight) || undefined, el.getBoundingClientRect().height);
        if (floor !== undefined) el.style.minHeight = `${floor}px`;
      }
      setDraft(d);
    },
    [setDraft],
  );
  return { ref, hold };
}
