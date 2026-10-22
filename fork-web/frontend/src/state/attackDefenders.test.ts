import { describe, expect, it } from 'vitest';
import { applyIntent } from '../mock/engine';
import { scenarioById } from '../mock/scenarios';
import type { GameView } from '../model/types';
import { cardStatus } from './cardStatus';
import { pickDefender } from './focus';
import { INITIAL_UI } from './ui';

/** Your declare attackers step with Theo's planeswalker "pw" offered as a defender (issue #65). */
function withWalker(): GameView {
  let g = scenarioById('priority').build();
  while (g.stack.length) g = applyIntent(g, { type: 'primary' });
  g = applyIntent(g, { type: 'primary' });
  const any = Object.values(g.cards)[0]!;
  const pw = { ...any, id: 'pw', name: 'Teferi', ownerId: 'theo', controllerId: 'theo', zone: 'battlefield' as const };
  const d = g.decision.kind === 'declareAttackers' ? g.decision : undefined;
  return { ...g, cards: { ...g.cards, pw }, decision: { ...d!, defenderCards: ['pw'] } };
}

describe('planeswalkers and battles as defenders (issue #65)', () => {
  it('lights a planeswalker you may attack, and marks it once picked', () => {
    const g = withWalker();
    expect(cardStatus(g, INITIAL_UI, 'pw')).toMatchObject({ actionable: true, actionKind: 'defender', selected: false });
    const ui = { ...INITIAL_UI, ...pickDefender(g, { kind: 'card', id: 'pw' }) };
    expect(ui).toMatchObject({ attackDefender: 'theo', attackDefenderCard: 'pw', focusOpponentId: 'theo' });
    expect(cardStatus(g, ui, 'pw')).toMatchObject({ actionable: true, selected: true });
    // Picking a player drops the planeswalker.
    expect(pickDefender(g, { kind: 'player', id: 'mira' })).toEqual({ attackDefender: 'mira', attackDefenderCard: undefined, focusOpponentId: 'mira' });
  });

  it('names the planeswalker on its attacker, and each attacker once on the planeswalker', () => {
    const g = withWalker();
    const d = g.decision.kind === 'declareAttackers' ? g.decision : undefined;
    const attacker = d!.candidates[0]!;
    const attack = { attackerId: attacker, defenderId: 'theo', defenderCardId: 'pw' };
    // Live, the engine's combat holds the draft too.
    const live = { ...g, combat: { attacks: [attack], blocks: [] }, decision: { ...d!, draft: [attack] } } as GameView;
    expect(cardStatus(live, INITIAL_UI, attacker).attacking).toEqual({ defender: 'Teferi', draft: false });
    expect(cardStatus(live, INITIAL_UI, 'pw').attackedBy).toEqual([g.cards[attacker]!.name]);
  });
});
