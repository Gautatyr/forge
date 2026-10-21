import type { Intent } from '../model/intents';
import { opponents } from '../model/selectors';
import type { GameView, PlayerId } from '../model/types';
import type { OpponentLayout } from './prefs';
import type { UiState } from './ui';

/**
 * Focus layout: which opponent is expanded (ruling from mockup review 1).
 * - An opponent's turn starts: focus that opponent.
 * - Your turn starts: keep the current focus.
 * - You attack an opponent: focus them.
 * - "Show board" on a compact seat: focus it until the next of the above.
 */
export function focusOnTurnChange(game: GameView, current: PlayerId | undefined): PlayerId | undefined {
  const opps = opponents(game).filter((p) => !p.hasLost);
  const active = opps.find((p) => p.id === game.turn.activePlayerId);
  if (active) return active.id;
  if (current && opps.some((p) => p.id === current)) return current;
  // Nothing focused yet on your turn: the opponent who played just before you.
  return opps.at(-1)?.id;
}

/** The defender an attack intent aims at: focus follows it. */
export function focusForIntent(intent: Intent): PlayerId | undefined {
  return intent.type === 'toggleAttacker' || intent.type === 'attackWithAll' || intent.type === 'setAttackDefender'
    ? intent.defenderId
    : undefined;
}

export function focusedOpponent(game: GameView, ui: UiState): PlayerId | undefined {
  const id = ui.focusOpponentId;
  if (id && opponents(game).some((p) => p.id === id && !p.hasLost)) return id;
  return focusOnTurnChange(game, undefined);
}

/**
 * The defender new attackers go at. In the Focus layout it is the focused
 * opponent, so the big seat always matches the selected defender and the first
 * attacker click does not swap the board (picking a defender also focuses it).
 * Elsewhere: the player picked, else the first defender.
 */
export function currentDefender(game: GameView, ui: UiState, layout: OpponentLayout): PlayerId | undefined {
  const d = game.decision;
  if (d.kind !== 'declareAttackers') return undefined;
  if (layout === 'focus') {
    const focused = focusedOpponent(game, ui);
    if (focused && d.defenders.includes(focused)) return focused;
  }
  if (ui.attackDefender && d.defenders.includes(ui.attackDefender)) return ui.attackDefender;
  return d.defenders[0];
}
