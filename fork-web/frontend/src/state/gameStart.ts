/**
 * Game start copy (design pass 4 §2.4): the London mulligan built on the
 * choice tray's yes/no and in-place choose-N shapes, and the opponents' tags.
 * The engine gives the facts; the words live here, for the mock and the adapter.
 */
import type { CardId, ChooseNPrompt, GameView, MulliganState, PlayerId, YesNoPrompt } from '../model/types';
import type { IconName } from '../components/Icon';
import { headline } from './gameEnd';
import { nextPlayer } from './turnStrip';
import { t } from '../i18n';

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
  | { kind: 'turn'; playerId: PlayerId; number: number; round?: number; nextId?: PlayerId }
  /** Before turn 1: "Game start" (the toss), then "Opening hands". */
  | { kind: 'start'; text: string }
  /** The result's headline: "You won", "Mira won" (with `playerId`'s seat shape), "Draw". */
  | { kind: 'over'; playerId?: PlayerId; text: string };

export function turnHeading(game: GameView): TurnHeading {
  if (game.result) return { kind: 'over', ...headline(game) };
  const id = turnPlayerId(game);
  if (!id) return { kind: 'start', text: game.players.some((p) => p.mulligan) ? t('start.openingHands') : t('start.gameStart') };
  const round = game.turn.round;
  return { kind: 'turn', playerId: id, number: game.turn.number, ...(round ? { round } : {}), nextId: nextPlayer(game)?.id };
}

/** "Round 7 · Turn 26"; "Turn 26" alone when the round is unknown (older recordings). */
export function turnNumberText(h: { number: number; round?: number }): string {
  return h.round ? t('top.roundTurn', { round: h.round, n: h.number }) : t('top.turn', { n: h.number });
}

/** Who chooses the starting player: the toss winner (first game) or the loser of the last game. */
export type TossChooser = 'wonToss' | 'lostLastGame';

/** The starting player's question (playtest 1): "You won the coin toss. Who plays first?" */
export function tossTitle(chooser: TossChooser): string {
  return chooser === 'wonToss' ? t('start.toss.won') : t('start.toss.lost');
}

export interface MulliganFacts {
  /** Cards drawn: 7. */
  handSize: number;
  /** Cards to put on the bottom when keeping now (mulligans that cost a card). */
  toBottom: number;
  /** The engine says the next mulligan is free. */
  freeNext: boolean;
  /** Cards the next mulligan draws; the hand size when absent. */
  draw?: number;
  /** Cards the next mulligan puts on the bottom (London: you draw `draw`, then bottom these). */
  nextBottom?: number;
}

export const MULLIGAN_PROMPT_ID = 'mulligan';
export const BOTTOM_PROMPT_ID = 'mulligan-bottom';

/** "Opening hand · 7 cards": Keep (Space) or Mulligan (M). */
export function mulliganPrompt(f: MulliganFacts, id = MULLIGAN_PROMPT_ID): YesNoPrompt {
  const keep = f.toBottom > 0 ? t('mull.keepBottom', { count: f.toBottom }) : t('mull.keep', { count: f.handSize });
  return {
    id,
    shape: 'yesNo',
    title: t('mull.title', { count: f.handSize }),
    instruction: t('mull.instruction', {
      draw: f.draw ?? f.handSize,
      bottom: f.nextBottom ? t('mull.thenBottom', { count: f.nextBottom }) : '',
      free: f.freeNext ? ` ${t('mull.free')}` : '',
    }),
    confirmLabel: keep,
    yesLabel: keep,
    noLabel: t('mull.mulligan'),
    defaultAnswer: 'yes',
    keys: { no: 'M' },
  };
}

/** After keeping: choose in place, in your hand, the cards that go to the bottom. */
export function bottomPrompt(hand: CardId[], n: number, nameOf: (id: CardId) => string = (id) => id, id = BOTTOM_PROMPT_ID): ChooseNPrompt {
  return {
    id,
    shape: 'chooseN',
    title: t('mull.bottomTitle', { count: n }),
    instruction: t('mull.bottomInstruction', { count: hand.length - n }),
    confirmLabel: t('mull.putBottom'),
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
      return { icon: 'hourglass', text: t('mull.deciding'), count: undefined, title: t('mull.decidingTitle') };
    case 'kept':
      return { icon: 'check', text: `${t('mull.kept')} `, count: String(m.cards), title: t('mull.keptTitle', { count: m.cards }) };
    case 'mulligan':
      return { icon: 'flip', text: `${t('mull.tag')} `, count: `→ ${m.cards}`, title: t('mull.tagTitle', { count: m.cards }) };
  }
}
