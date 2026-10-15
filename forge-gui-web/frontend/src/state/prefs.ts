import { PRIORITY_STEPS } from '../model/phases';
import type { PlayerId, StepId } from '../model/types';

/** How opponents are arranged in multiplayer. 1v1 always uses one full-width seat. */
export type OpponentLayout = 'columns' | 'table' | 'focus';
export type CardSize = 's' | 'm' | 'l';

/**
 * Where the game waits for you when the stack is empty (a step set to "Pass"
 * still prompts you when something is on the stack). A client setting: the
 * bridge answers the engine's `isUiSetToSkipPhase(turnPlayer, phase)` from it.
 */
export interface StopPrefs {
  /** Steps of your own turns. */
  yourTurn: StepId[];
  /** Shared row: steps of every opponent's turns. */
  opponentsTurn: StepId[];
  /** "Set per opponent": an opponent's own row once it differs. Lasts one match: not restored on load. */
  perOpponent: Record<PlayerId, StepId[]>;
}

/** Forge's defaults (`ForgePreferences` PHASE_HUMAN_* for your turns, PHASE_AI_* for opponents'). */
export const DEFAULT_STOPS: StopPrefs = {
  yourTurn: ['main1', 'declareBlockers', 'main2'],
  opponentsTurn: ['beginCombat', 'declareAttackers', 'declareBlockers', 'end'],
  perOpponent: {},
};

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
  stops: StopPrefs;
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
  stops: DEFAULT_STOPS,
};

const KEY = 'forge.match.prefs.v1';

function stepList(raw: unknown): StepId[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  return PRIORITY_STEPS.map((s) => s.id).filter((id) => raw.includes(id));
}

function parseStops(raw: unknown): StopPrefs {
  if (typeof raw !== 'object' || raw === null) return DEFAULT_STOPS;
  const r = raw as Partial<Record<keyof StopPrefs, unknown>>;
  return {
    yourTurn: stepList(r.yourTurn) ?? DEFAULT_STOPS.yourTurn,
    opponentsTurn: stepList(r.opponentsTurn) ?? DEFAULT_STOPS.opponentsTurn,
    perOpponent: {},
  };
}

/** Stored prefs over the defaults; anything unreadable falls back to its default. */
export function parsePrefs(raw: string): Prefs {
  try {
    const stored = JSON.parse(raw) as Partial<Prefs> & { focusedOpponentId?: unknown };
    const p = { ...DEFAULT_PREFS, ...stored, stops: parseStops(stored.stops) };
    // Pass 1 stored the Focus pick as a preference; it is screen state now.
    delete p.focusedOpponentId;
    if (!OPPONENT_SHARES.includes(p.opponentShare)) p.opponentShare = DEFAULT_PREFS.opponentShare;
    return p;
  } catch {
    return DEFAULT_PREFS;
  }
}

export function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return parsePrefs(raw);
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
