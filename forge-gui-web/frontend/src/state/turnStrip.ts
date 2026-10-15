import type { GameView, PlayerId, PlayerView } from '../model/types';

/** Whose turn follows the current one, skipping players who have lost. */
export function nextPlayer(game: GameView): PlayerView | undefined {
  const n = game.players.length;
  const start = game.players.findIndex((p) => p.id === game.turn.activePlayerId);
  for (let k = 1; k < n; k++) {
    const p = game.players[(start + k) % n]!;
    if (!p.hasLost) return p;
  }
  return undefined;
}

/** Who the game is waiting for: you, unless someone else is deciding. */
export function waitingOn(game: GameView): PlayerId {
  return game.decision.kind === 'waiting' ? game.decision.forPlayerId : game.youId;
}

/** AI opponents pass quickly: their "Waiting for" chip shows only after this, so it does not flicker. */
export const AI_CHIP_DELAY_MS = 400;

/** Natural widths in the top bar, in px (see TopBar's measurement). */
export interface FitWidths {
  /** The bar's content box. */
  available: number;
  /** Whose turn, turn line and priority chip, untruncated. */
  left: number;
  /** The strip with every step shown. */
  track: number;
  /** The tool buttons with their words. */
  tools: number;
  /** What the tool buttons save by dropping their words. */
  toolWords: number;
  /** Gaps between the three parts. */
  gaps: number;
}

/**
 * 0: everything shown. 1: tool buttons keep only their icon and key letter.
 * 2: also fold the combat steps (the strip shows them anyway during combat;
 * the turn block then truncates with "…").
 */
export function fitLevel(w: FitWidths): 0 | 1 | 2 {
  const full = w.left + w.track + w.tools + w.gaps;
  if (full <= w.available) return 0;
  if (full - w.toolWords <= w.available) return 1;
  return 2;
}
