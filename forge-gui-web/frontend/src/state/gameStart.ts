/**
 * Game start copy (design pass 4 §2.4): the London mulligan built on the
 * choice tray's yes/no and in-place choose-N shapes, and the opponents' tags.
 * The engine gives the facts; the words live here, for the mock and the adapter.
 */
import type { CardId, ChooseNPrompt, GameView, MulliganState, PlayerId, YesNoPrompt } from '../model/types';
import type { IconName } from '../components/Icon';
import { headline } from './gameEnd';
import { nextPlayer } from './turnStrip';

/**
 * The player whose turn it is; undefined before turn 1 (toss, opening hands)
 * and once the game is over. The top bar, the plates' "Your turn" tag, the
 * active seat and the step strip all read this, never `game.turn` directly.
 */
export function turnPlayerId(game: GameView): PlayerId | undefined {
  return game.starting || game.result ? undefined : game.turn.activePlayerId;
}

/** What the top bar's turn block reads. */
export type TurnHeading =
  | { kind: 'turn'; playerId: PlayerId; number: number; nextId?: PlayerId }
  /** Before turn 1: "Game start" (the toss), then "Opening hands". */
  | { kind: 'start'; text: string }
  /** The result's headline: "You won", "Mira won" (with `playerId`'s seat shape), "Draw". */
  | { kind: 'over'; playerId?: PlayerId; text: string };

export function turnHeading(game: GameView): TurnHeading {
  if (game.result) return { kind: 'over', ...headline(game) };
  const id = turnPlayerId(game);
  if (!id) return { kind: 'start', text: game.players.some((p) => p.mulligan) ? 'Opening hands' : 'Game start' };
  return { kind: 'turn', playerId: id, number: game.turn.number, nextId: nextPlayer(game)?.id };
}

export interface MulliganFacts {
  /** Cards drawn: 7. */
  handSize: number;
  /** Cards to put on the bottom when keeping now (mulligans that cost a card). */
  toBottom: number;
  /** The engine says the next mulligan is free. */
  freeNext: boolean;
}

export const MULLIGAN_PROMPT_ID = 'mulligan';
export const BOTTOM_PROMPT_ID = 'mulligan-bottom';

/** "Opening hand · 7 cards": Keep (Space) or Mulligan (M). */
export function mulliganPrompt(f: MulliganFacts, id = MULLIGAN_PROMPT_ID): YesNoPrompt {
  const keep = f.toBottom > 0 ? `Keep · put ${f.toBottom} on the bottom` : `Keep ${f.handSize}`;
  return {
    id,
    shape: 'yesNo',
    title: `Opening hand · ${f.handSize} cards`,
    instruction: `Keep these cards, or shuffle and draw ${f.handSize} new ones.${f.freeNext ? ' Your first mulligan is free.' : ''}`,
    confirmLabel: keep,
    yesLabel: keep,
    noLabel: 'Mulligan',
    defaultAnswer: 'yes',
    keys: { no: 'M' },
  };
}

/** After keeping: choose in place, in your hand, the cards that go to the bottom. */
export function bottomPrompt(hand: CardId[], n: number, nameOf: (id: CardId) => string = (id) => id, id = BOTTOM_PROMPT_ID): ChooseNPrompt {
  return {
    id,
    shape: 'chooseN',
    title: `Choose ${n} card${n === 1 ? '' : 's'} to put on the bottom of your library`,
    instruction: `The other ${hand.length - n} are your opening hand.`,
    confirmLabel: 'Put on bottom',
    min: n,
    max: n,
    progress: true,
    options: hand.map((cardId) => ({ id: cardId, label: nameOf(cardId), cardId })),
  };
}

export interface MulliganTag {
  icon: IconName;
  /** Kept on narrow headers too, unlike the other tags' words. */
  text: string;
  count?: string;
  title: string;
}

/** Opponents' header tags: "Deciding…", "Kept 7", "Mulligan → 6". */
export function mulliganTag(m: MulliganState): MulliganTag {
  switch (m.state) {
    case 'deciding':
      return { icon: 'hourglass', text: 'Deciding…', count: undefined, title: 'Deciding on their opening hand' };
    case 'kept':
      return { icon: 'check', text: 'Kept ', count: String(m.cards), title: `Kept ${m.cards} cards` };
    case 'mulligan':
      return { icon: 'flip', text: 'Mulligan ', count: `→ ${m.cards}`, title: `Took a mulligan: going down to ${m.cards} cards` };
  }
}
