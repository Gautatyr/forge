import { useLayoutEffect, type RefObject } from 'react';

/** The card width (rem) of a tray tile: the full size, or what the tray body sets in `--tile-cw` to fit. */
export const TILE_CW_MAX = 6.6;
const TILE_CW_MIN = 4;
export const TILE_CW = `var(--tile-cw, ${TILE_CW_MAX}rem)`;

/**
 * The largest size in [min, max] for which `fits` holds, by bisection. `undefined` = keep the full size: it already fits,
 * or even `min` does not (the body then scrolls, as before).
 */
export function largestFit(min: number, max: number, fits: (size: number) => boolean): number | undefined {
  if (fits(max) || !fits(min)) return undefined;
  let [lo, hi] = [min, max];
  for (let i = 0; i < 7; i++) {
    const mid = (lo + hi) / 2;
    if (fits(mid)) lo = mid;
    else hi = mid;
  }
  return lo;
}

/**
 * A tray whose body is capped to the board's height shrinks its card tiles until the whole body (tiles, labels, key
 * hints) is in view without scrolling; a long prompt text above takes the room. Re-fits when the body or the prompt changes.
 */
export function useFitTiles(body: RefObject<HTMLElement | null>, deps: readonly unknown[]): void {
  useLayoutEffect(() => {
    const el = body.current;
    if (!el) return;
    const fit = () => {
      const overflows = () => el.scrollHeight > el.clientHeight;
      // Cards animate their size: measure the end state at once (the attribute switches the transitions off).
      el.dataset.fitting = '';
      el.style.removeProperty('--tile-cw');
      const size = largestFit(TILE_CW_MIN, TILE_CW_MAX, (cw) => {
        el.style.setProperty('--tile-cw', `${cw}rem`);
        return !overflows();
      });
      if (size === undefined) el.style.removeProperty('--tile-cw');
      else el.style.setProperty('--tile-cw', `${size}rem`);
      void el.scrollHeight;
      delete el.dataset.fitting;
    };
    fit();
    const watch = new ResizeObserver(fit);
    watch.observe(el);
    return () => watch.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
