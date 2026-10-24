import { useLayoutEffect, useRef, useState, type RefObject } from 'react';
import type { ChoicePrompt } from '../../model/types';
import { FILTER_FROM } from './trayLogic';

/** The card width (rem) of a tray tile: the full size, or what the tray body sets in `--tile-cw` to fit. */
export const TILE_CW_MAX = 6.6;
const TILE_CW_MIN = 4;
export const TILE_CW = 'var(--tile-cw, 6.6rem)';

/**
 * The size for a tray's tiles, in [min, max]: `max` when it fits, the largest that does by bisection, or `'list'` when even
 * `min` does not (the tray then shows the compact list, or scrolls when its body has no list form).
 */
export function fitTileSize(min: number, max: number, fits: (size: number) => boolean): number | 'list' {
  if (fits(max)) return max;
  if (!fits(min)) return 'list';
  let [lo, hi] = [min, max];
  for (let i = 0; i < 7; i++) {
    const mid = (lo + hi) / 2;
    if (fits(mid)) lo = mid;
    else hi = mid;
  }
  return lo;
}

/** The largest size in [min, max] for which `fits` holds; `undefined` = keep the full size (it fits, or even `min` does not). */
export function largestFit(min: number, max: number, fits: (size: number) => boolean): number | undefined {
  const size = fitTileSize(min, max, fits);
  return size === 'list' || size >= max ? undefined : size;
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

/** What the tray has decided so far in this prompt: the smallest tile size chosen, and whether it fell back to the list. */
export interface FitState {
  floor: number;
  list: boolean;
}

/**
 * Tiles or the compact list, decided once per prompt: the list is final (it never goes back to tiles, which would flip
 * with the dock cap like a growing tile does); tiles only shrink (`noRegrow`). `size` is what to apply to the tiles.
 */
export function settleFit(outcome: number | 'list', hasList: boolean, state: FitState): { size: number | undefined; state: FitState } {
  if (state.list || (outcome === 'list' && hasList)) return { size: undefined, state: { ...state, list: true } };
  const next = noRegrow(outcome === 'list' || outcome >= TILE_CW_MAX ? undefined : outcome, state.floor);
  return { size: next.size, state: { floor: next.floor, list: false } };
}

/** Which trays have card tiles that can become a compact list; see `tileKind`. */
export type TileKind = 'pick' | 'browse' | 'reveal';

/**
 * The trays whose card tiles can become a compact list. `pick`: card pickers (choose N with every option a card) and
 * the two piles of scry and surveil; `browse`: a pick of more cards than the filter box starts at (a library search),
 * which scrolls by design: it becomes a list only when not even its first row of tiles shows; `reveal`: cards shown
 * at hand size, with no labels or key hints to lose, which scroll too: a list only when less than half of their first
 * row shows. Everything else (chips, yes/no, numbers, one ordered column, the ability menu) has no tiles.
 */
export function tileKind(p: ChoicePrompt): TileKind | undefined {
  if (p.shape === 'order') return p.lists.length > 1 ? 'pick' : undefined;
  if (p.shape !== 'chooseN' || p.abilityMenu || p.options.length === 0 || !p.options.every((o) => o.cardId)) return undefined;
  if (p.max === 0) return 'reveal';
  return p.options.length > FILTER_FROM ? 'browse' : 'pick';
}

/** Whether the first row of tiles (card, label, key hint; for a reveal at least half a card) is in view at the tile size set now. */
function firstRowShows(el: HTMLElement, kind: TileKind): boolean {
  // A pick's tile is its card and label in one box (the card's parent); a reveal's card is the tile.
  const card = el.querySelector('[data-card-id]');
  const first = kind === 'reveal' ? card : card?.parentElement;
  if (!first) return true;
  const part = kind === 'reveal' ? 0.5 : 1;
  const r = first.getBoundingClientRect();
  return r.bottom - el.getBoundingClientRect().bottom <= (1 - part) * r.height + 1;
}

/**
 * Measure a tray body and set `--tile-cw` to the largest tile size (never above the state's floor) at which nothing
 * overflows. Returns the new state; `list` = even the smallest tile does not fit and the body can show a list.
 */
function fitTiles(el: HTMLElement, state: FitState, kind: TileKind | undefined): FitState {
  // Cards animate their size: measure the end state at once (the attribute switches the transitions off).
  el.dataset.fitting = '';
  el.style.removeProperty('--tile-cw');
  const overflows = () => el.scrollHeight > el.clientHeight;
  let outcome = fitTileSize(TILE_CW_MIN, TILE_CW_MAX, (cw) => {
    el.style.setProperty('--tile-cw', `${cw}rem`);
    return !overflows();
  });
  // A long pick, or a reveal, scrolls: that is no reason for the list while its first row shows (the tiles stay as they are).
  if (outcome === 'list' && (kind === 'browse' || kind === 'reveal') && firstRowShows(el, kind)) outcome = TILE_CW_MAX;
  const next = settleFit(outcome, kind !== undefined, state);
  if (next.size === undefined) el.style.removeProperty('--tile-cw');
  else el.style.setProperty('--tile-cw', `${next.size}rem`);
  void el.scrollHeight;
  delete el.dataset.fitting;
  return next.state;
}

/**
 * A tray whose body is capped to the board's height shrinks its card tiles until the whole body (tiles, labels, key
 * hints) is in view without scrolling; a long prompt text above takes the room. When even the smallest tile does not
 * fit, a body that has a list form (`kind`) switches to the compact list (owner ruling 2026-10-24, #140) and the hook
 * returns true. Re-fits when the body, the prompt or the window changes; within a prompt the size only shrinks and the
 * list is final (`settleFit`); a window resize starts again from the full tiles.
 */
export function useFitTiles(body: RefObject<HTMLElement | null>, deps: readonly unknown[], kind: TileKind | undefined): boolean {
  const state = useRef<FitState>({ floor: Infinity, list: false });
  const [compact, setCompact] = useState(false);
  useLayoutEffect(() => {
    const el = body.current;
    if (!el) return;
    const fit = () => {
      // The list is on screen: nothing to measure (its DOM is not the tiles').
      if (state.current.list) return;
      state.current = fitTiles(el, state.current, kind);
      if (state.current.list) setCompact(true);
    };
    fit();
    const watch = new ResizeObserver(fit);
    watch.observe(el);
    const resized = () => {
      state.current = { floor: Infinity, list: false };
      // Back to tiles first (rendered before the next paint); the effect re-runs and decides again.
      if (compact) setCompact(false);
      else fit();
    };
    window.addEventListener('resize', resized);
    return () => {
      watch.disconnect();
      window.removeEventListener('resize', resized);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, compact]);
  return compact;
}
