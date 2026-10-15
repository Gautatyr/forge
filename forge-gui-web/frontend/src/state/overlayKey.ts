import { useSyncExternalStore } from 'react';

/**
 * D7: holding one key shows every overlay in words. Today it turns keyword
 * icons into word chips. Alt: a modifier is natural to hold and clashes with
 * no letter shortcut (D9).
 */
export const OVERLAY_KEY = 'Alt';

export interface OverlayKeyEvent {
  type: string;
  key?: string;
  altKey?: boolean;
}

export function nextOverlayHeld(held: boolean, e: OverlayKeyEvent): boolean {
  if (e.type === 'blur') return false;
  if (e.key === OVERLAY_KEY) return e.type === 'keydown';
  if (e.type === 'keydown' && held && !e.altKey) return false;
  return held;
}

let held = false;
const listeners = new Set<() => void>();

function onEvent(e: Event) {
  const k = e as KeyboardEvent;
  // Alt alone would otherwise open the browser's menu bar on release.
  if (k.key === OVERLAY_KEY) e.preventDefault();
  const next = nextOverlayHeld(held, { type: e.type, key: k.key, altKey: k.altKey });
  if (next === held) return;
  held = next;
  for (const l of listeners) l();
}

const EVENTS = ['keydown', 'keyup', 'blur'] as const;

function subscribe(listener: () => void) {
  if (listeners.size === 0) for (const t of EVENTS) window.addEventListener(t, onEvent);
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size > 0) return;
    for (const t of EVENTS) window.removeEventListener(t, onEvent);
    held = false;
  };
}

/** True while the overlay key is held. */
export function useOverlayKey(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => held,
    () => false,
  );
}
