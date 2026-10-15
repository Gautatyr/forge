import type { PlayerId } from '../model/types';

/** How opponents are arranged in multiplayer. 1v1 always uses one full-width seat. */
export type OpponentLayout = 'columns' | 'table' | 'focus';
export type CardSize = 's' | 'm' | 'l';

/** Light board customisation (not a docking workspace). */
export interface Prefs {
  layout: OpponentLayout;
  cardSize: CardSize;
  groupLands: boolean;
  groupTokens: boolean;
  /** 0.75–2, multiplies the root font size. */
  uiScale: number;
  /** Focus layout: the expanded opponent. */
  focusedOpponentId?: PlayerId;
}

export const DEFAULT_PREFS: Prefs = {
  layout: 'columns',
  cardSize: 'm',
  groupLands: true,
  groupTokens: true,
  uiScale: 1,
};

const KEY = 'forge.match.prefs.v1';

export function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULT_PREFS, ...(JSON.parse(raw) as Partial<Prefs>) };
  } catch {
    /* storage unavailable: defaults */
  }
  return DEFAULT_PREFS;
}

export function savePrefs(p: Prefs) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}

export const CARD_SCALE: Record<CardSize, number> = { s: 0.78, m: 0.9, l: 1 };
