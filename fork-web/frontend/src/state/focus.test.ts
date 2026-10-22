import { describe, expect, it } from 'vitest';
import { applyIntent } from '../mock/engine';
import { scenarioById } from '../mock/scenarios';
import type { GameView } from '../model/types';
import { currentAttackAim, currentDefender, focusForIntent, focusOnTurnChange, focusedOpponent } from './focus';
import { INITIAL_UI } from './ui';

describe('Focus layout follows the turn (mockup review 1)', () => {
  it('focuses the opponent whose turn it is, even over the previous focus', () => {
    const g = scenarioById('blockers').build(); // Mira's turn
    expect(focusOnTurnChange(g, 'theo')).toBe('mira');
    expect(focusedOpponent(g, INITIAL_UI)).toBe('mira');
  });

  it('keeps the current focus when your turn starts', () => {
    const g = scenarioById('priority').build(); // your turn
    expect(focusOnTurnChange(g, 'theo')).toBe('theo');
    expect(focusedOpponent(g, { ...INITIAL_UI, focusOpponentId: 'theo' })).toBe('theo');
  });

  it('defaults to the opponent who played just before you on your turn', () => {
    const g = scenarioById('priority').build();
    expect(focusOnTurnChange(g, undefined)).toBe('ana');
    expect(focusedOpponent(g, INITIAL_UI)).toBe('ana');
  });

  it('switches to the opponent you attack', () => {
    expect(focusForIntent({ type: 'toggleAttacker', cardId: 'x', defenderId: 'theo' })).toBe('theo');
    expect(focusForIntent({ type: 'attackWithAll', defenderId: 'mira' })).toBe('mira');
    expect(focusForIntent({ type: 'primary' })).toBeUndefined();
  });

  it('ignores a focus on a player who is not an opponent', () => {
    const g = scenarioById('priority').build();
    expect(focusedOpponent(g, { ...INITIAL_UI, focusOpponentId: 'you' })).toBe('ana');
  });

  it('moves focus to the next opponent when their turn starts', () => {
    let g = scenarioById('priority').build();
    while (g.stack.length) g = applyIntent(g, { type: 'primary' });
    g = applyIntent(g, { type: 'primary' }); // to combat
    g = applyIntent(g, { type: 'primary' }); // skip attack → main 2
    g = applyIntent(g, { type: 'primary' }); // end turn
    expect(g.turn.activePlayerId).toBe('mira');
    expect(focusOnTurnChange(g, 'ana')).toBe('mira');
  });

});

describe('Focus layout: the default defender is the focused opponent (review of PR 16)', () => {
  const toCombat = () => {
    let g = scenarioById('priority').build();
    while (g.stack.length) g = applyIntent(g, { type: 'primary' });
    g = applyIntent(g, { type: 'primary' });
    expect(g.decision.kind).toBe('declareAttackers');
    return g;
  };

  it('defaults to the focused opponent, so the first attacker click keeps the big seat', () => {
    const g = toCombat();
    expect(focusedOpponent(g, INITIAL_UI)).toBe('ana');
    const def = currentDefender(g, INITIAL_UI, 'focus');
    expect(def).toBe('ana');
    expect(focusForIntent({ type: 'toggleAttacker', cardId: 'x', defenderId: def! })).toBe('ana');
  });

  it('follows the focus over a defender picked on an earlier turn', () => {
    const g = toCombat();
    expect(currentDefender(g, { ...INITIAL_UI, attackDefender: 'theo', focusOpponentId: 'mira' }, 'focus')).toBe('mira');
  });

  it('keeps the explicit pick or the first defender in the other layouts', () => {
    const g = toCombat();
    const d = g.decision.kind === 'declareAttackers' ? g.decision.defenders : [];
    expect(currentDefender(g, INITIAL_UI, 'columns')).toBe(d[0]);
    expect(currentDefender(g, { ...INITIAL_UI, attackDefender: 'theo' }, 'table')).toBe('theo');
  });

  it('is undefined outside attack declaration', () => {
    expect(currentDefender(scenarioById('priority').build(), INITIAL_UI, 'focus')).toBeUndefined();
  });
});

describe('attacking a planeswalker (issue #65)', () => {
  /** Combat with Theo's planeswalker "pw" offered as a defender. */
  const withWalker = (): GameView => {
    let g = scenarioById('priority').build();
    while (g.stack.length) g = applyIntent(g, { type: 'primary' });
    g = applyIntent(g, { type: 'primary' });
    const any = Object.values(g.cards)[0]!;
    const pw = { ...any, id: 'pw', name: 'Teferi', ownerId: 'theo', controllerId: 'theo', zone: 'battlefield' as const };
    const d = g.decision.kind === 'declareAttackers' ? g.decision : undefined;
    return { ...g, cards: { ...g.cards, pw }, decision: { ...d!, defenderCards: ['pw'] } };
  };

  it('aims at the picked planeswalker, with its controller as the defending player', () => {
    const g = withWalker();
    const ui = { ...INITIAL_UI, attackDefender: 'theo', attackDefenderCard: 'pw', focusOpponentId: 'theo' };
    expect(currentAttackAim(g, ui, 'columns')).toEqual({ defenderId: 'theo', defenderCardId: 'pw' });
    expect(currentAttackAim(g, ui, 'focus')).toEqual({ defenderId: 'theo', defenderCardId: 'pw' });
  });

  it('drops the planeswalker once another opponent is focused, or when the engine no longer offers it', () => {
    const g = withWalker();
    const ui = { ...INITIAL_UI, attackDefender: 'theo', attackDefenderCard: 'pw', focusOpponentId: 'mira' };
    expect(currentAttackAim(g, ui, 'focus')).toEqual({ defenderId: 'mira' });
    const gone = { ...g, decision: { ...g.decision, defenderCards: [] } } as GameView;
    expect(currentAttackAim(gone, { ...ui, focusOpponentId: 'theo' }, 'columns')).toEqual({ defenderId: 'theo' });
  });

  it('aims at a player when none is picked, and at nothing outside attack declaration', () => {
    const g = withWalker();
    expect(currentAttackAim(g, { ...INITIAL_UI, attackDefender: 'theo' }, 'table')).toEqual({ defenderId: 'theo' });
    expect(currentAttackAim(scenarioById('priority').build(), INITIAL_UI, 'focus')).toBeUndefined();
  });
});
