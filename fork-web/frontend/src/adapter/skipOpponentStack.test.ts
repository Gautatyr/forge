/** "Skip spells between opponents" (ruling 2026-10-24) and removing an "Always yield to this" by key (PR #144 review). */
import { describe, expect, it } from 'vitest';
import type { GameView } from '../model/types';
import { applyIntent } from '../mock/engine';
import { buildScenario } from '../state/seedGame';
import { DEFAULT_PREFS, parsePrefs } from '../state/prefs';
import { intentToFrames, skipOpponentStackFrame } from './commands';
import type { LiveSession } from './session';

const s = {} as LiveSession;
const view = { decision: { kind: 'priority' } } as GameView;

describe('skip spells between opponents', () => {
  it('is off by default and when the stored value is not a boolean', () => {
    expect(DEFAULT_PREFS.skipOpponentStack).toBe(false);
    expect(parsePrefs('{}').skipOpponentStack).toBe(false);
    expect(parsePrefs(JSON.stringify({ skipOpponentStack: 'yes' })).skipOpponentStack).toBe(false);
    expect(parsePrefs('not json').skipOpponentStack).toBe(false);
  });

  it('a stored choice survives a reload, and "Reset to defaults" of the stops does not touch it', () => {
    expect(parsePrefs(JSON.stringify({ skipOpponentStack: true })).skipOpponentStack).toBe(true);
  });

  it('is sent to the bridge as its own message', () => {
    expect(skipOpponentStackFrame(true)).toEqual({ t: 'setSkipOpponentStack', on: true });
    expect(skipOpponentStackFrame(false)).toEqual({ t: 'setSkipOpponentStack', on: false });
  });
});

describe('removing an always-yield by key', () => {
  it('asks the bridge to remove the ability by its key, with no stack item', () => {
    expect(intentToFrames({ type: 'removeAutoYieldTo', key: 'Each opponent loses 1 life.' }, s, view)).toEqual([
      { t: 'action', method: 'sendYieldUpdate', update: { kind: 'AutoYieldTo', key: 'Each opponent loses 1 life.', active: false } },
    ]);
  });

  it('the mock drops just that key', () => {
    const g = buildScenario('priority', false);
    g.autoYieldTo = ['A', 'B'];
    expect(applyIntent(g, { type: 'removeAutoYieldTo', key: 'A' }).autoYieldTo).toEqual(['B']);
  });
});
