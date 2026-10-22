import { describe, expect, it } from 'vitest';
import { buildScenario } from './seedGame';

describe('mock game seeded from prefs (PR #102 follow-up)', () => {
  it('starts with the stored Auto-pay pref', () => {
    expect(buildScenario('priority', true).autoPay).toBe(true);
    expect(buildScenario('priority', false).autoPay).toBe(false);
  });
});
