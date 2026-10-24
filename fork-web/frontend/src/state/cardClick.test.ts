/**
 * Issue #174: a card the engine lets you play from outside your hand (the top of your library with Mystic Forge or
 * Bolas's Citadel, an opponent's exiled card with Gonti, a graveyard or exile permission) is clickable once the engine
 * lights it (setWeaklySelectable); an unlit one is not played.
 */
import { describe, expect, it } from 'vitest';
import type { WireObject } from '../wire/generated/wire';
import { LiveSession } from '../adapter/session';
import { toGameView } from '../adapter/toView';
import { otherZoneGroup } from '../components/otherZoneGroup';
import type { GameView } from '../model/types';
import { cardClick } from './cardClick';

const YOU = { type: 'player', id: 0 } as const;
const card = (id: number) => ({ type: 'card', id }) as const;

const cardObjs = (id: number, owner: number, zone: string, name: string, type: string): WireObject[] => [
  { type: 'card', id, props: { Owner: owner, Controller: owner, Zone: zone, CurrentState: 'Original' } } as WireObject,
  { type: 'cardState', id, state: 'Original', props: { Name: name, Type: type } } as WireObject,
];

/** Your priority in your main phase: Sol Ring on top of your library (60), Grizzly Bears in your graveyard (61), an opponent's exiled Plains (62), Llanowar Elves on the stack (63). */
function game(lit: number[]): GameView {
  const objects: WireObject[] = [
    { type: 'game', id: 1, props: { Players: [0, 1], Turn: 4, Phase: 'MAIN1', PlayerTurn: 0, GameType: 'Constructed', Stack: [] } },
    { type: 'player', id: 0, props: { Name: 'Hugo', Life: 20, Library: [60], Graveyard: [61], HasPriority: true } },
    { type: 'player', id: 1, props: { Name: 'AI', IsAI: true, Life: 20, Exile: [62] } },
    ...cardObjs(60, 0, 'Library', 'Sol Ring', 'Artifact'),
    ...cardObjs(61, 0, 'Graveyard', 'Grizzly Bears', 'Creature - Bear'),
    ...cardObjs(62, 1, 'Exile', 'Plains', 'Basic Land - Plains'),
    ...cardObjs(63, 0, 'Stack', 'Llanowar Elves', 'Creature - Elf'),
  ];
  const s = new LiveSession();
  s.apply({ t: 'snapshot', game: 1, seq: 0, label: 't', viewer: { seat: 0, player: 0 }, objects, log: [] });
  s.apply({ t: 'call', method: 'showPromptMessage', args: [YOU, 'Priority: Hugo', null] });
  s.apply({ t: 'call', method: 'updateButtons', args: [YOU, 'OK', 'End Turn', true, true, true] });
  s.apply({ t: 'call', method: 'setWeaklySelectable', args: [lit.map(card)] });
  return toGameView(s);
}

describe('clicking a card outside your hand while you hold priority', () => {
  it('plays the lit top card of your library', () => {
    const g = game([60]);
    expect(cardClick(g, '60')).toEqual({ kind: 'intent', intent: { type: 'play', cardId: '60' } });
    expect(cardClick(g, '60', true)).toEqual({ kind: 'intent', intent: { type: 'play', cardId: '60', hold: true } });
  });

  it('does nothing for a library card the engine does not light', () => {
    expect(cardClick(game([]), '60')).toEqual({ kind: 'none' });
  });

  it('plays a lit card of an opponent you may cast (Gonti)', () => {
    expect(cardClick(game([62]), '62')).toEqual({ kind: 'intent', intent: { type: 'play', cardId: '62' } });
  });

  it('does nothing for an opponent’s card the engine does not light', () => {
    expect(cardClick(game([]), '62')).toEqual({ kind: 'none' });
  });

  it('plays a lit graveyard card, and says an unlit one can’t be played', () => {
    expect(cardClick(game([61]), '61')).toEqual({ kind: 'intent', intent: { type: 'play', cardId: '61' } });
    expect(cardClick(game([]), '61')).toMatchObject({ kind: 'note' });
  });

  it('never plays a card on the stack', () => {
    expect(cardClick(game([63]), '63')).toEqual({ kind: 'none' });
  });
});

describe('the group beside the hand', () => {
  it('lists the lit library, graveyard and opponent cards, the opponent’s with its owner', () => {
    const g = game([60, 61, 62]);
    expect(otherZoneGroup(g).map((e) => `${e.card.name} | ${e.caption}`)).toEqual([
      'Sol Ring | Library',
      'Grizzly Bears | Graveyard',
      'Plains | Exile · AI',
    ]);
  });

  it('lists nothing that is not lit', () => {
    expect(otherZoneGroup(game([]))).toEqual([]);
  });
});
