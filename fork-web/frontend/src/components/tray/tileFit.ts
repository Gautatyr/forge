import { useLayoutEffect, useRef, type RefObject } from 'react';

/** The card width (rem) of a tray tile: the full size, or what the tray body sets in `--tile-cw` to fit. */
export const TILE_CW_MAX = 6.6;
const TILE_CW_MIN = 4;
export const TILE_CW = 'var(--tile-cw, 6.6rem)';

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
 * Within one prompt the size never grows back: the tray's height cap (the dock placement, ChoiceTray) depends on the tray's
 * own height, so growing the tiles after a shrink re-caps the tray and the two flip every frame. `floor` is the smallest
 * size chosen so far (`Infinity` for a new prompt or a resized window); `size` is what to apply, `undefined` = the full size.
 */
export function noRegrow(found: number | undefined, floor: number): { size: number | undefined; floor: number } {
  const size = Math.min(found ?? TILE_CW_MAX, floor);
  return { size: size >= TILE_CW_MAX ? undefined : size, floor: size };
}

/** Set `--tile-cw` on a tray body to the largest tile size (never above `floor.value`) at which nothing overflows. */
function fitTiles(el: HTMLElement, floor: { value: number }): void {
  const overflows = () => el.scrollHeight > el.clientHeight;
  // Cards animate their size: measure the end state at once (the attribute switches the transitions off).
  el.dataset.fitting = '';
  el.style.removeProperty('--tile-cw');
  const found = largestFit(TILE_CW_MIN, TILE_CW_MAX, (cw) => {
    el.style.setProperty('--tile-cw', `${cw}rem`);
    return !overflows();
  });
  const next = noRegrow(found, floor.value);
  floor.value = next.floor;
  if (next.size === undefined) el.style.removeProperty('--tile-cw');
  else el.style.setProperty('--tile-cw', `${next.size}rem`);
  void el.scrollHeight;
  delete el.dataset.fitting;
}

/**
 * A tray whose body is capped to the board's height shrinks its card tiles until the whole body (tiles, labels, key
 * hints) is in view without scrolling; a long prompt text above takes the room. Re-fits when the body, the prompt or
 * the window changes; the size only shrinks within a prompt (`noRegrow`), a window resize starts again from the full size.
 */
export function useFitTiles(body: RefObject<HTMLElement | null>, deps: readonly unknown[]): void {
  const floor = useRef({ value: Infinity });
  useLayoutEffect(() => {
    const el = body.current;
    if (!el) return;
    fitTiles(el, floor.current);
    const watch = new ResizeObserver(() => fitTiles(el, floor.current));
    watch.observe(el);
    const resized = () => {
      floor.current.value = Infinity;
      fitTiles(el, floor.current);
    };
    window.addEventListener('resize', resized);
    return () => {
      watch.disconnect();
      window.removeEventListener('resize', resized);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
