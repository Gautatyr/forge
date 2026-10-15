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

/**
 * Debounces who is waited for: `shown(key)` turns true once `key` has been the
 * current key for `delayMs` (0: at once). Every change of key restarts the
 * delay, so each pass to an AI hides its chip again, not only the first one.
 * TopBar reads `shown` while rendering and calls `set` from an effect;
 * `onChange` fires when the delay ends, to render again.
 */
export class SettleGate {
  private key?: string;
  private settled = false;
  private timer?: ReturnType<typeof setTimeout>;

  private readonly onChange: () => void;

  constructor(onChange: () => void) {
    this.onChange = onChange;
  }

  set(key: string, delayMs: number): void {
    if (key === this.key) return;
    clearTimeout(this.timer);
    this.key = key;
    this.settled = delayMs <= 0;
    if (this.settled) return;
    this.timer = setTimeout(() => {
      this.settled = true;
      this.onChange();
    }, delayMs);
  }

  /** A key not yet `set` (the render before the effect) is not settled. */
  shown(key: string, delayMs: number): boolean {
    return delayMs <= 0 || (key === this.key && this.settled);
  }

  /** Stops the timer; a later `set` starts over (React StrictMode re-runs effects). */
  dispose(): void {
    clearTimeout(this.timer);
    this.key = undefined;
    this.settled = false;
  }
}

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
