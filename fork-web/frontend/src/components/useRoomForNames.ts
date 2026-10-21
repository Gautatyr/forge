import { useLayoutEffect, type RefObject } from 'react';

/** Bottom of the lowest item in a wrapping flex row (items inside `display: contents` wrappers included). */
function contentBottom(row: HTMLElement): number {
  let bottom = 0;
  const visit = (el: Element) => {
    for (const c of el.children) {
      if (getComputedStyle(c).display === 'contents') visit(c);
      else bottom = Math.max(bottom, c.getBoundingClientRect().bottom);
    }
  };
  visit(row);
  return bottom;
}

/**
 * One-line headers (design pass 4, P5): "With room, the commander name joins it."
 * Sets `data-cmd-names="on"` on the plate when the names fit without adding a line
 * to `row`, `"off"` otherwise; re-checked on every render and resize.
 */
export function useRoomForNames(plate: RefObject<HTMLElement | null>, row: RefObject<HTMLElement | null>, enabled: boolean) {
  useLayoutEffect(() => {
    const el = plate.current;
    const r = row.current;
    if (!el || !r) return;
    if (!enabled) {
      el.removeAttribute('data-cmd-names');
      return;
    }
    const fit = () => {
      el.setAttribute('data-cmd-names', 'off');
      const without = contentBottom(r);
      el.setAttribute('data-cmd-names', 'on');
      el.setAttribute('data-cmd-names', contentBottom(r) > without + 0.5 ? 'off' : 'on');
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  });
}
