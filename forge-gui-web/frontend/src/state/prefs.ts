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
  /** Multiplayer: percent of the board height given to opponents; you get the rest. */
  opponentShare: OpponentShare;
}

export const OPPONENT_SHARES = [35, 40, 45, 50, 55] as const;
export type OpponentShare = (typeof OPPONENT_SHARES)[number];

export const DEFAULT_PREFS: Prefs = {
  layout: 'columns',
  cardSize: 'm',
  groupLands: true,
  groupTokens: true,
  uiScale: 1,
  opponentShare: 45,
};

const KEY = 'forge.match.prefs.v1';

export function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = { ...DEFAULT_PREFS, ...(JSON.parse(raw) as Partial<Prefs> & { focusedOpponentId?: unknown }) };
      // Pass 1 stored the Focus pick as a preference; it is screen state now.
      delete p.focusedOpponentId;
      if (!OPPONENT_SHARES.includes(p.opponentShare)) p.opponentShare = DEFAULT_PREFS.opponentShare;
      return p;
    }
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
