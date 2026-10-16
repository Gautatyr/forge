import { describe, expect, it } from 'vitest';
import { priorityDecision, refreshOtherZoneCasts, type MockGame } from '../mock/engine';
import { scenarioById } from '../mock/scenarios';
import type { GameView } from '../model/types';
import { otherZoneGroup } from './otherZoneGroup';

const names = (g: GameView) => otherZoneGroup(g).map((e) => `${e.card.name} | ${e.caption}`);

/** Every land and mana creature of yours tapped and the pool empty: nothing is affordable. */
function broke(g: MockGame): MockGame {
  const out = structuredClone(g);
  for (const id of out.players[0]!.battlefield) out.cards[id]!.tapped = true;
  out.players[0]!.manaPool = {};
  out.decision = priorityDecision(out);
  refreshOtherZoneCasts(out);
  return out;
}

describe('the group beside the hand (design pass 4, P3/P4)', () => {
  it('lists your commander and every card you may cast from another zone, with captions', () => {
    const g = scenarioById('hand9').build();
    expect(names(g)).toEqual(["Sythis, Harvest's Hand | Command zone · tax +2", "Moment's Peace | Graveyard · flashback"]);
  });

  it('does not depend on what you can afford', () => {
    const g = broke(scenarioById('hand9').build());
    const playable = g.decision.kind === 'priority' ? g.decision.playable : [];
    expect(playable.map((id) => g.cards[id]!.name)).not.toContain("Moment's Peace");
    expect(playable.map((id) => g.cards[id]!.name)).not.toContain("Sythis, Harvest's Hand");
    expect(names(g)).toEqual([
      "Sythis, Harvest's Hand | Command zone · tax +2",
      "Moment's Peace | Graveyard · flashback",
    ]);
  });

  it('does not depend on timing: still listed on an opponent’s turn', () => {
    const g = scenarioById('hand9').build();
    const theirs: GameView = {
      ...g,
      turn: { ...g.turn, activePlayerId: 'mira', priorityPlayerId: 'mira' },
      decision: { kind: 'waiting', forPlayerId: 'mira', what: 'Mira is taking her turn' },
    };
    expect(names(theirs)).toHaveLength(2);
  });

  it('leaves out graveyard and exile cards with no cast permission', () => {
    const g = scenarioById('hand9').build();
    const listed = otherZoneGroup(g).map((e) => e.card.name);
    expect(listed).not.toContain('Llanowar Elves');
    expect(listed).not.toContain('Mesa Enchantress');
  });

  it('captions each permission kind', () => {
    const g = scenarioById('hand9').build();
    const me = g.players[0]!;
    const [a, b] = me.graveyard as [string, string];
    const [c] = me.exile as [string];
    const game: GameView = {
      ...g,
      players: [
        {
          ...me,
          otherZoneCasts: [
            { cardId: a, via: 'escape' },
            { cardId: b, via: 'other' },
            { cardId: c, via: 'adventure' },
          ],
        },
        ...g.players.slice(1),
      ],
    };
    expect(otherZoneGroup(game).map((e) => e.caption)).toEqual([
      'Command zone · tax +2',
      'Graveyard · escape',
      'Graveyard',
      'Exile · adventure',
    ]);
  });
});
