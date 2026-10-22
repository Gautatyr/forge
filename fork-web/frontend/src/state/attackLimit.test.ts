import { describe, expect, it } from 'vitest';
import { applyIntent } from '../mock/engine';
import { scenarioById } from '../mock/scenarios';
import type { Decision } from '../model/types';
import { ATTACK_INVALID, attackInvalidReason, canAttackAll, overAttackCap } from './attackLimit';
import { DEFAULT_STOPS } from './prefs';
import { primaryAction } from './primaryAction';
import { INITIAL_UI } from './ui';

type D = Extract<Decision, { kind: 'declareAttackers' }>;
const atk = (id: string) => ({ attackerId: id, defenderId: 'p2' });
const base: D = { kind: 'declareAttackers', candidates: ['a', 'b'], defenders: ['p2'], defenderCards: [], draft: [] };

describe('attack cap (the most creatures the engine lets attack together)', () => {
  it('offers Attack all when nothing caps attackers or the cap covers every candidate', () => {
    expect(canAttackAll(base)).toBe(true);
    expect(canAttackAll({ ...base, max: 2 })).toBe(true);
  });
  it('does not offer Attack all above the cap', () => {
    expect(canAttackAll({ ...base, max: 1 })).toBe(false);
  });
  it('knows when the draft is over the cap', () => {
    expect(overAttackCap({ ...base, max: 1, draft: [atk('a')] })).toBe(false);
    expect(overAttackCap({ ...base, max: 1, draft: [atk('a'), atk('b')] })).toBe(true);
    expect(overAttackCap({ ...base, draft: [atk('a'), atk('b')] })).toBe(false);
  });
});

describe('attackInvalidReason', () => {
  it('matches the engine message', () => {
    expect(ATTACK_INVALID.test('Attack declaration invalid')).toBe(true);
    expect(ATTACK_INVALID.test('Something else')).toBe(false);
  });
  it('names the cap when the draft is over it', () => {
    expect(attackInvalidReason({ ...base, max: 1, draft: [atk('a'), atk('b')] })).toBe('Attack not allowed. At most 1 creature can attack together.');
  });
  it('otherwise says what a refusal means', () => {
    expect(attackInvalidReason({ ...base, draft: [atk('a')] })).toMatch(/required to attack|restriction/);
  });
});

describe('primary button over the cap', () => {
  it('is disabled and says why', () => {
    let g = scenarioById('duel').build();
    g = applyIntent(g, { type: 'primary' });
    g = applyIntent(g, { type: 'attackWithAll', defenderId: 'ai' });
    const d = g.decision as D;
    expect(d.draft.length).toBeGreaterThan(1);
    expect(primaryAction({ ...g, decision: { ...d, max: 1 } }, INITIAL_UI, DEFAULT_STOPS)).toMatchObject({
      enabled: false,
      detail: 'At most 1 creature can attack together.',
    });
    expect(primaryAction(g, INITIAL_UI, DEFAULT_STOPS).enabled).toBe(true);
  });
});
