import type { Intent } from '../model/intents';
import { defendingPlayerOf, opponents } from '../model/selectors';
import type { CardId, GameView, PlayerId } from '../model/types';
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

/** What new attackers attack: a player, or a planeswalker or battle with its defending player (issue #65). */
export interface AttackAim {
  defenderId: PlayerId;
  defenderCardId?: CardId;
}

/**
 * The planeswalker or battle picked as the defender, while the engine offers it and its player is the focused opponent
 * (picking it focuses them; focusing another opponent drops it).
 */
export function pickedDefenderCard(game: GameView, ui: UiState): CardId | undefined {
  const d = game.decision;
  const card = ui.attackDefenderCard ? game.cards[ui.attackDefenderCard] : undefined;
  if (d.kind !== 'declareAttackers' || !card || !d.defenderCards.includes(card.id)) return undefined;
  return focusedOpponent(game, ui) === defendingPlayerOf(card) ? card.id : undefined;
}

/** The picked planeswalker or battle with its defending player, else the current defending player. */
export function currentAttackAim(game: GameView, ui: UiState, layout: OpponentLayout): AttackAim | undefined {
  if (game.decision.kind !== 'declareAttackers') return undefined;
  const card = pickedDefenderCard(game, ui);
  if (card) return { defenderId: defendingPlayerOf(game.cards[card]!), defenderCardId: card };
  const defenderId = currentDefender(game, ui, layout);
  return defenderId ? { defenderId } : undefined;
}

/** UI state for picking a defender: a player, or a planeswalker or battle (its defending player is focused). */
export function pickDefender(game: GameView, target: { kind: 'player' | 'card'; id: string }): Partial<UiState> {
  const c = target.kind === 'card' ? game.cards[target.id] : undefined;
  const player = c ? defendingPlayerOf(c) : target.id;
  return { attackDefender: player, attackDefenderCard: c?.id, focusOpponentId: player };
}
