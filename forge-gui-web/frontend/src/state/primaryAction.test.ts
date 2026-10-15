import { describe, expect, it } from 'vitest';
import { applyIntent } from '../mock/engine';
import { SCENARIOS, scenarioById } from '../mock/scenarios';
import { primaryAction } from './primaryAction';
import { DEFAULT_STOPS } from './prefs';
import { setYourStop } from './stops';
import { INITIAL_UI } from './ui';

describe('primary button says what it will do', () => {
  it('offers Resolve while the stack holds items', () => {
    const g = scenarioById('priority').build();
    const a = primaryAction(g, INITIAL_UI, DEFAULT_STOPS);
    expect(a.label).toBe('Resolve');
    expect(a.detail).toContain('Lightning Bolt');
  });

  it('counts attackers, then blockers', () => {
    let g = scenarioById('duel').build();
    g = applyIntent(g, { type: 'primary' }); // to combat
    expect(primaryAction(g, INITIAL_UI, DEFAULT_STOPS).label).toBe('Skip attack');
    g = applyIntent(g, { type: 'attackWithAll', defenderId: 'ai' });
    expect(primaryAction(g, INITIAL_UI, DEFAULT_STOPS).label).toMatch(/^Attack with \d+$/);

    const b = scenarioById('blockers').build();
    expect(primaryAction(b, INITIAL_UI, DEFAULT_STOPS).label).toBe('No blocks');
  });

  it('defaults auto-pass and auto-yield to off (ruling D4)', () => {
    for (const { id } of SCENARIOS) {
      const g = scenarioById(id).build();
      expect(g.autoPass).toBe(false);
      expect(g.autoYield).toBe(false);
    }
  });

  it('names the next stop when passing with an empty stack', () => {
    const g = scenarioById('duel').build();
    const main2 = { ...g, turn: { ...g.turn, step: 'main2' as const } };
    const endTurn = primaryAction(main2, INITIAL_UI, DEFAULT_STOPS);
    expect(endTurn.label).toBe('End turn');
    expect(endTurn.detail).toBe("Next stop: Forge AI's Start of combat");

    const upkeep = { ...g, turn: { ...g.turn, step: 'upkeep' as const } };
    const pass = primaryAction(upkeep, INITIAL_UI, DEFAULT_STOPS);
    expect(pass.label).toBe('Pass priority');
    expect(pass.detail).toBe('Next stop: your Main 1');
    expect(primaryAction(upkeep, INITIAL_UI, setYourStop(DEFAULT_STOPS, 'draw', true)).detail).toBe('Next stop: your Draw step');

    const opp = { ...g, turn: { ...g.turn, activePlayerId: 'ai', step: 'beginCombat' as const } };
    expect(primaryAction(opp, INITIAL_UI, DEFAULT_STOPS).detail).toBe("Next stop: Forge AI's Attack step");
  });

  it('says when no stop is set', () => {
    const g = scenarioById('duel').build();
    const upkeep = { ...g, turn: { ...g.turn, step: 'upkeep' as const } };
    expect(primaryAction(upkeep, INITIAL_UI, { yourTurn: [], opponentsTurn: [], perOpponent: {} }).detail).toBe(
      'No stops set: you act again when something is on the stack',
    );
  });
});
