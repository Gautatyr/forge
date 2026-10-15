import { describe, expect, it } from 'vitest';
import { applyIntent } from '../mock/engine';
import { scenarioById } from '../mock/scenarios';
import { primaryAction } from './primaryAction';
import { INITIAL_UI } from './ui';

describe('primary button says what it will do', () => {
  it('offers Resolve while the stack holds items', () => {
    const g = scenarioById('priority').build();
    const a = primaryAction(g, INITIAL_UI);
    expect(a.label).toBe('Resolve');
    expect(a.detail).toContain('Lightning Bolt');
  });

  it('counts attackers, then blockers', () => {
    let g = scenarioById('duel').build();
    g = applyIntent(g, { type: 'primary' }); // to combat
    expect(primaryAction(g, INITIAL_UI).label).toBe('Skip attack');
    g = applyIntent(g, { type: 'attackWithAll', defenderId: 'ai' });
    expect(primaryAction(g, INITIAL_UI).label).toMatch(/^Attack with \d+$/);

    const b = scenarioById('blockers').build();
    expect(primaryAction(b, INITIAL_UI).label).toBe('No blocks');
  });

  it('defaults auto-pass and auto-yield to off (ruling D4)', () => {
    for (const id of ['priority', 'blockers', 'scry', 'search', 'duel', 'hand9', 'hand12']) {
      const g = scenarioById(id).build();
      expect(g.autoPass).toBe(false);
      expect(g.autoYield).toBe(false);
    }
  });
});
