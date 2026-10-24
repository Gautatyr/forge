import { useCallback } from 'react';
import type { Intent } from '../model/intents';
import type { CardId, GameView, ManaColour, ManaSource } from '../model/types';
import { useMatch } from './MatchContext';
import { t } from '../i18n';
import { cardName } from '../model/selectors';

/** What a click on a card means while you hold priority or pay a cost (design pass 4, §2.1 and P1–P2). */
export type CardClick =
  | { kind: 'intent'; intent: Intent }
  /** A source that adds two or more kinds: the chooser at the card asks which. */
  | { kind: 'chooseMana'; cardId: CardId; colours: ManaColour[] }
  /** A short neutral note in the prompt line (3 s). */
  | { kind: 'note'; text: string }
  | { kind: 'none' }
  /** Not ours to answer: targets, combat and choices go through the match context. */
  | { kind: 'default' };

function tap(source: ManaSource): CardClick {
  return source.colours.length > 1
    ? { kind: 'chooseMana', cardId: source.cardId, colours: source.colours }
    : { kind: 'intent', intent: { type: 'tapForMana', cardId: source.cardId } };
}

/** `hold`: Shift was held on the click; a cast or activation then keeps the priority it gets back (pass after casting). */
export function cardClick(game: GameView, id: CardId, hold = false): CardClick {
  const d = game.decision;
  const c = game.cards[id];
  if (!c) return { kind: 'none' };
  if (d.kind === 'payMana') {
    const source = d.sources.find((s) => s.cardId === id);
    return source ? tap(source) : { kind: 'none' };
  }
  if (d.kind !== 'priority' && d.kind !== 'waiting') return { kind: 'default' };

  if (c.zone !== 'battlefield') {
    if (c.zone === 'stack') return { kind: 'none' };
    // What the engine lights (setWeaklySelectable) may be played from any zone, whoever owns it: the top of a library
    // (Mystic Forge, Bolas's Citadel), an opponent's exiled card (Gonti), a graveyard or exile permission.
    if (d.kind === 'priority' && d.playable.includes(id)) return { kind: 'intent', intent: { type: 'play', cardId: id, ...(hold && { hold }) } };
    // Not lit: a library card or an opponent's card is not yours to click.
    if (c.ownerId !== game.youId || c.zone === 'library') return { kind: 'none' };
    return { kind: 'note', text: t('click.cantPlay', { name: cardName(c) }) };
  }
  if (d.kind !== 'priority' || c.controllerId !== game.youId) return { kind: 'none' };
  const source = d.manaSources?.find((s) => s.cardId === id);
  if (source) return tap(source);
  return { kind: 'intent', intent: { type: 'activate', cardId: id, ...(hold && { hold }) } };
}

/** Click handler for cards: priority and payment clicks here, everything else to `activateCard`. */
export function useCardClick(): (id: CardId, hold?: boolean) => void {
  const { game, send, setUi, activateCard } = useMatch();
  return useCallback(
    (id: CardId, hold = false) => {
      const r = cardClick(game, id, hold);
      switch (r.kind) {
        case 'intent':
          setUi({ manaChoice: undefined });
          send(r.intent);
          return;
        case 'chooseMana':
          setUi({ manaChoice: { cardId: r.cardId, colours: r.colours } });
          return;
        case 'note':
          setUi((u) => ({ ...u, promptNote: { id: (u.promptNote?.id ?? 0) + 1, text: r.text } }));
          return;
        case 'none':
          return;
        case 'default':
          activateCard(id);
      }
    },
    [game, send, setUi, activateCard],
  );
}
