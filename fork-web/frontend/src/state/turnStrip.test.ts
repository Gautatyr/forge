import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { scenarioById } from '../mock/scenarios';
import { GROUP_CAPTIONS, PRIORITY_STEPS, STEPS, STEP_RUNS } from '../model/phases';
import { AI_CHIP_DELAY_MS, fitLevel, nextPlayer, SettleGate, waitingOn, type FitWidths } from './turnStrip';

describe('turn strip steps (official Comprehensive Rules names, playtest 1)', () => {
  it('drops Untap and Cleanup and uses the CR step and phase names', () => {
    // CR 501.1, 502–504, 505.1 (first / second main phase), 506.1, 507–511, 512–513.
    expect(PRIORITY_STEPS.map((s) => s.longLabel)).toEqual([
      'Upkeep step',
      'Draw step',
      'First main phase',
      'Beginning of combat step',
      'Declare attackers step',
      'Declare blockers step',
      'Combat damage step',
      'End of combat step',
      'Second main phase',
      'End step',
    ]);
  });

  it('shortens a name only by dropping its last word ("step" / "phase")', () => {
    expect(PRIORITY_STEPS.map((s) => s.label)).toEqual([
      'Upkeep',
      'Draw',
      'First main',
      'Beginning of combat',
      'Declare attackers',
      'Declare blockers',
      'Combat damage',
      'End of combat',
      'Second main',
      'End',
    ]);
    for (const s of STEPS) expect(s.longLabel.startsWith(`${s.label} `)).toBe(true);
  });

  it('groups the steps under the Beginning, Combat and Ending phase captions', () => {
    expect(STEP_RUNS.map((r) => [r.group ?? null, r.steps.map((s) => s.id)])).toEqual([
      ['beginning', ['upkeep', 'draw']],
      [null, ['main1']],
      ['combat', ['beginCombat', 'declareAttackers', 'declareBlockers', 'combatDamage', 'endCombat']],
      [null, ['main2']],
      ['ending', ['end']],
    ]);
    expect(GROUP_CAPTIONS).toEqual({ beginning: 'Beginning phase', combat: 'Combat phase', ending: 'Ending phase' });
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
  // track: the strip with full names; trackShort: what short names save.
  const w: FitWidths = { available: 1000, left: 200, track: 600, trackShort: 150, tools: 180, toolWords: 120, gaps: 20 };

  it('keeps everything, full step names included, when it fits', () => {
    expect(fitLevel(w)).toBe(0);
  });
  it('drops the tool words first', () => {
    expect(fitLevel({ ...w, available: 950 })).toBe(1);
    expect(fitLevel({ ...w, available: 880 })).toBe(1);
  });
  it('then shortens the step names', () => {
    expect(fitLevel({ ...w, available: 879 })).toBe(2);
    expect(fitLevel({ ...w, available: 730 })).toBe(2);
  });
  it('then folds the combat steps', () => {
    expect(fitLevel({ ...w, available: 729 })).toBe(3);
    expect(fitLevel({ ...w, available: 500 })).toBe(3);
  });
});

describe('"Waiting for <AI>" chip delay', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const delay = (key: string) => (key === 'you' ? 0 : AI_CHIP_DELAY_MS);
  /** One TopBar render with `key` waited for: read during render, then the effect. */
  const render = (gate: SettleGate, key: string) => {
    const shown = gate.shown(key, delay(key));
    gate.set(key, delay(key));
    return shown;
  };

  it('hides an AI chip for 400 ms on every pass to that AI, not only the first', () => {
    let changes = 0;
    const gate = new SettleGate(() => changes++);
    for (let pass = 0; pass < 3; pass++) {
      expect(render(gate, 'you')).toBe(true);
      expect(gate.shown('you', 0)).toBe(true);

      expect(render(gate, 'theo')).toBe(false);
      vi.advanceTimersByTime(80);
      expect(gate.shown('theo', AI_CHIP_DELAY_MS)).toBe(false);
      vi.advanceTimersByTime(AI_CHIP_DELAY_MS - 81);
      expect(gate.shown('theo', AI_CHIP_DELAY_MS)).toBe(false);
      vi.advanceTimersByTime(1);
      expect(gate.shown('theo', AI_CHIP_DELAY_MS)).toBe(true);
      expect(changes).toBe(pass + 1);
    }
  });

  it('restarts the delay when the wait moves from one AI to another', () => {
    const gate = new SettleGate(() => {});
    render(gate, 'theo');
    vi.advanceTimersByTime(AI_CHIP_DELAY_MS);
    expect(gate.shown('theo', AI_CHIP_DELAY_MS)).toBe(true);
    expect(render(gate, 'mira')).toBe(false);
    vi.advanceTimersByTime(AI_CHIP_DELAY_MS - 1);
    expect(gate.shown('mira', AI_CHIP_DELAY_MS)).toBe(false);
    vi.advanceTimersByTime(1);
    expect(gate.shown('mira', AI_CHIP_DELAY_MS)).toBe(true);
  });

  it('keeps a settled chip shown while the same AI stays waited for', () => {
    const gate = new SettleGate(() => {});
    render(gate, 'theo');
    vi.advanceTimersByTime(AI_CHIP_DELAY_MS);
    expect(render(gate, 'theo')).toBe(true);
    expect(render(gate, 'theo')).toBe(true);
  });

  it('cancels a pending timer when the wait moves away or the bar unmounts', () => {
    let changes = 0;
    const gate = new SettleGate(() => changes++);
    render(gate, 'theo');
    render(gate, 'you');
    vi.advanceTimersByTime(AI_CHIP_DELAY_MS * 2);
    expect(changes).toBe(0);
    render(gate, 'theo');
    gate.dispose();
    vi.advanceTimersByTime(AI_CHIP_DELAY_MS * 2);
    expect(changes).toBe(0);
  });

  it('starts over when set again after dispose (StrictMode re-runs effects)', () => {
    let changes = 0;
    const gate = new SettleGate(() => changes++);
    render(gate, 'theo');
    gate.dispose();
    gate.set('theo', AI_CHIP_DELAY_MS);
    expect(gate.shown('theo', AI_CHIP_DELAY_MS)).toBe(false);
    vi.advanceTimersByTime(AI_CHIP_DELAY_MS);
    expect(gate.shown('theo', AI_CHIP_DELAY_MS)).toBe(true);
    expect(changes).toBe(1);
  });
});
