import { describe, expect, it } from 'vitest';
import { applyIntent } from '../mock/engine';
import { scenarioById } from '../mock/scenarios';
import { focusForIntent, focusOnTurnChange, focusedOpponent } from './focus';
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
