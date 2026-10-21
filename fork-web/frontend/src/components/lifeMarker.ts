import { useEffect, useState } from 'react';

/** How long a plate shows a life change beside the total (design pass 4, P6). */
export const LIFE_MARKER_MS = 4000;

export interface LifeMarker {
  life: number;
  /** Change shown now; 0 shows nothing. */
  delta: number;
  /** Bumped on every change: each one restarts the 4 s. */
  seq: number;
}

/**
 * Next marker once the life total reads `life`. A change that lands while a
 * marker is up adds to it; a total that does not move keeps the marker as it is.
 */
export function nextLifeMarker(prev: LifeMarker | undefined, life: number): LifeMarker {
  if (!prev) return { life, delta: 0, seq: 0 };
  if (prev.life === life) return prev;
  return { life, delta: prev.delta + life - prev.life, seq: prev.seq + 1 };
}

/** The 4 s after change `seq` are over: hide the marker unless a newer change restarted them. */
export function expireLifeMarker(m: LifeMarker, seq: number): LifeMarker {
  return m.seq === seq && m.delta !== 0 ? { ...m, delta: 0 } : m;
}

/**
 * The life change to show beside a plate's total, or 0. `resetKey` changes when
 * the plate shows a different game (a scenario switch): no change is shown then.
 */
export function useLifeChange(life: number, resetKey: string): number {
  const [state, setState] = useState(() => ({ key: resetKey, marker: nextLifeMarker(undefined, life) }));
  let marker = state.marker;
  if (state.key !== resetKey || marker.life !== life) {
    // Adjusting state while rendering (React's documented pattern for derived state).
    marker = state.key !== resetKey ? nextLifeMarker(undefined, life) : nextLifeMarker(marker, life);
    setState({ key: resetKey, marker });
  }
  const { delta, seq } = marker;
  useEffect(() => {
    if (delta === 0) return;
    const t = window.setTimeout(() => setState((s) => ({ ...s, marker: expireLifeMarker(s.marker, seq) })), LIFE_MARKER_MS);
    return () => window.clearTimeout(t);
  }, [delta, seq]);
  return delta;
}
