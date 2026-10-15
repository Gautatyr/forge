import { describe, expect, it } from 'vitest';
import { scenarioById } from '../mock/scenarios';
import { PRIORITY_STEPS, STEP_RUNS } from '../model/phases';
import { fitLevel, nextPlayer, waitingOn, type FitWidths } from './turnStrip';

describe('turn strip steps', () => {
  it('drops Untap and Cleanup and renames Begin to Start', () => {
    expect(PRIORITY_STEPS.map((s) => s.label)).toEqual([
      'Upkeep',
      'Draw',
      'Main 1',
      'Start',
      'Attack',
      'Block',
      'Damage',
      'End',
      'Main 2',
      'End step',
    ]);
  });

  it('groups the steps under the Beginning and Combat captions', () => {
    expect(STEP_RUNS.map((r) => [r.group ?? null, r.steps.map((s) => s.id)])).toEqual([
      ['beginning', ['upkeep', 'draw']],
      [null, ['main1']],
      ['combat', ['beginCombat', 'declareAttackers', 'declareBlockers', 'combatDamage', 'endCombat']],
      [null, ['main2']],
      [null, ['end']],
    ]);
  });
});

describe('whose turn and who is waited for', () => {
  it('next player follows turn order and skips players who lost', () => {
    const g = scenarioById('priority').build();
    expect(nextPlayer(g)?.id).toBe('mira');
    const b = scenarioById('blockers').build();
    expect(nextPlayer(b)?.id).toBe('theo');
    const lost = { ...b, players: b.players.map((p) => (p.id === 'theo' ? { ...p, hasLost: true } : p)) };
    expect(nextPlayer(lost)?.id).toBe('ana');
  });

  it('waits for you whenever the decision is yours, else for the deciding player', () => {
    expect(waitingOn(scenarioById('priority').build())).toBe('you');
    expect(waitingOn(scenarioById('blockers').build())).toBe('you');
    expect(waitingOn(scenarioById('scry').build())).toBe('you');
    const g = scenarioById('priority').build();
    expect(waitingOn({ ...g, decision: { kind: 'waiting', forPlayerId: 'theo', what: 'Theo is thinking' } })).toBe('theo');
  });
});

describe('top bar fit (1366 px and French)', () => {
  const w: FitWidths = { available: 1000, left: 200, track: 600, tools: 180, toolWords: 120, gaps: 20 };

  it('keeps everything when it fits', () => {
    expect(fitLevel(w)).toBe(0);
  });
  it('drops the tool words first', () => {
    expect(fitLevel({ ...w, available: 950 })).toBe(1);
    expect(fitLevel({ ...w, available: 880 })).toBe(1);
  });
  it('then folds the combat steps', () => {
    expect(fitLevel({ ...w, available: 879 })).toBe(2);
    expect(fitLevel({ ...w, available: 500 })).toBe(2);
  });
});
