import { describe, expect, it } from 'vitest';
import { scenarioById } from '../mock/scenarios';
import type { GameView } from '../model/types';
import { linkNotes } from './cardLinks';
import { statusChips } from './statusChips';

function base(): GameView {
  return scenarioById('hand9').build();
}

describe('linkNotes', () => {
  it('names the cards a card holds and the card an exiled card was exiled with', () => {
    const g = base();
    const [a, b] = Object.keys(g.cards) as [string, string];
    g.cards[a] = { ...g.cards[a]!, links: [{ kind: 'imprinted', cardIds: [b] }, { kind: 'exiled', cardIds: [b] }] };
    g.cards[b] = { ...g.cards[b]!, links: [{ kind: 'exiledWith', cardIds: [a] }] };
    expect(linkNotes(g, g.cards[a]!)).toEqual([`Imprinted: ${g.cards[b]!.name}`, `Exiled with this: ${g.cards[b]!.name}`]);
    expect(linkNotes(g, g.cards[b]!)).toEqual([`Exiled with: ${g.cards[a]!.name}`]);
  });

  it('has no note for a card without links or whose linked cards are not in the view', () => {
    const g = base();
    const [a] = Object.keys(g.cards) as [string];
    expect(linkNotes(g, g.cards[a]!)).toEqual([]);
    expect(linkNotes(g, { ...g.cards[a]!, links: [{ kind: 'imprinted', cardIds: ['nope'] }] })).toEqual([]);
  });
});

describe('statusChips', () => {
  it('lists effects then attachments, grouping identical names', () => {
    const g = base();
    const ids = Object.keys(g.cards);
    const [e1, e2, au] = ids as [string, string, string];
    g.cards[e1] = { ...g.cards[e1]!, name: 'The Monarch' };
    g.cards[e2] = { ...g.cards[e2]!, name: 'The Monarch' };
    g.cards[au] = { ...g.cards[au]!, name: 'Curse of Bounty' };
    const me = { ...g.players[0]!, effects: [e1, e2], attachments: [au] };
    expect(statusChips(me, g).map((c) => [c.kind, c.name, c.count, c.cardId])).toEqual([
      ['effect', 'The Monarch', 2, e1],
      ['attached', 'Curse of Bounty', 1, au],
    ]);
    expect(statusChips(me, g)[1]!.title).toBe('Curse of Bounty is attached to you.');
  });

  it('has none for a player without status, and skips cards not in the view', () => {
    const g = base();
    expect(statusChips(g.players[1]!, g)).toEqual([]);
    expect(statusChips({ ...g.players[1]!, effects: ['gone'] }, g)).toEqual([]);
  });
});
