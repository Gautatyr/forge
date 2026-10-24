/**
 * Issue #180: while a card choice is open, a card that is no legal pick is `inert` (the page draws no pointer cursor on
 * it); legal picks and every card outside a choice are not. The CSS class is `Card.module.css` `.inert`.
 */
import { describe, expect, it } from 'vitest';
import { applyIntent } from '../mock/engine';
import { scenarioById } from '../mock/scenarios';
import { cardStatusWithChoice } from '../components/tray/inPlace';
import type { GameView } from '../model/types';
import { cardStatus } from './cardStatus';
import { INITIAL_UI } from './ui';

const ids = (g: GameView) => Object.keys(g.cards);
const inertIds = (g: GameView) => ids(g).filter((id) => cardStatusWithChoice(g, INITIAL_UI, id).inert);
/** A lit card is clickable; a dimmed one never is. */
function expectConsistent(g: GameView) {
  for (const id of ids(g)) {
    const s = cardStatusWithChoice(g, INITIAL_UI, id);
    if (s.actionable) expect(s.inert, id).toBe(false);
    if (s.dimmed) expect(s.inert, id).toBe(true);
  }
}

describe('inert cards (no pointer cursor)', () => {
  it('with priority nothing is inert', () => {
    for (const id of ['priority', 'hand9', 'duel', 'keywords']) expect(inertIds(scenarioById(id).build()), id).toEqual([]);
  });

  it('declare blockers: the blockers and attackers you may click are not inert, the rest of the table is', () => {
    const g = scenarioById('blockers').build();
    if (g.decision.kind !== 'declareBlockers') throw new Error('not blocking');
    const d = g.decision;
    for (const id of [...d.candidates, ...d.attackers]) expect(cardStatus(g, INITIAL_UI, id).inert, id).toBe(false);
    const other = ids(g).filter((id) => !d.candidates.includes(id) && !d.attackers.includes(id) && g.cards[id]!.zone === 'battlefield');
    expect(other.length).toBeGreaterThan(0);
    for (const id of other) expect(cardStatus(g, INITIAL_UI, id).inert, id).toBe(true);
    expectConsistent(g);
  });

  it('declare blockers after a first click: the candidates that may not block that attacker turn inert', () => {
    const g = scenarioById('blockers').build();
    if (g.decision.kind !== 'declareBlockers') throw new Error('not blocking');
    const d = { ...g.decision, options: [{ attackerId: g.decision.attackers[0]!, blockers: [g.decision.candidates[0]!], ifFreed: [], min: 1 }] };
    const live: GameView = { ...g, decision: d };
    const ui = { ...INITIAL_UI, pendingAttacker: d.attackers[0] };
    expect(cardStatus(live, ui, d.candidates[0]!).inert).toBe(false);
    expect(cardStatus(live, ui, d.candidates[1]!).inert).toBe(true);
  });

  it('declare attackers: your creatures that may attack are not inert, your other permanents and opponents are', () => {
    const g = applyIntent(scenarioById('hand9').build(), { type: 'primary' });
    if (g.decision.kind !== 'declareAttackers') throw new Error(`not attacking: ${g.decision.kind}`);
    const d = g.decision;
    expect(d.candidates.length).toBeGreaterThan(0);
    for (const id of d.candidates) expect(cardStatus(g, INITIAL_UI, id).inert, id).toBe(false);
    const rest = ids(g).filter((id) => !d.candidates.includes(id) && !d.defenderCards.includes(id));
    for (const id of rest) expect(cardStatus(g, INITIAL_UI, id).inert, id).toBe(true);
    expectConsistent(g);
  });

  it('paying: the sources that can pay are not inert, everything else is', () => {
    const base = scenarioById('hand9').build();
    const hi = base.players[0]!.hand.find((c) => base.cards[c]!.name === 'Heroic Intervention')!;
    const g = applyIntent(base, { type: 'play', cardId: hi });
    if (g.decision.kind !== 'payMana') throw new Error('not paying');
    const sources = g.decision.sources.map((s) => s.cardId);
    expect(sources.length).toBeGreaterThan(0);
    for (const id of ids(g)) expect(cardStatus(g, INITIAL_UI, id).inert, id).toBe(!sources.includes(id));
  });

  it('choosing in place: the options are not inert, other cards are', () => {
    const g = scenarioById('sacrifice').build();
    const elf = Object.values(g.cards).find((c) => c.name === 'Elvish Mystic' && c.controllerId === g.youId)!.id;
    expect(cardStatusWithChoice(g, INITIAL_UI, elf).inert).toBe(false);
    const forest = Object.values(g.cards).find((c) => c.name === 'Forest' && c.zone === 'battlefield')!.id;
    expect(cardStatusWithChoice(g, INITIAL_UI, forest).inert).toBe(true);
    expectConsistent(g);
  });
});
