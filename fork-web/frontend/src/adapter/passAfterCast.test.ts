/** "Pass priority after casting" (memo U1b): a pref, off by default, sent to the bridge; Shift on a cast holds priority. */
import { describe, expect, it } from 'vitest';
import type { GameView } from '../model/types';
import { DEFAULT_PREFS, parsePrefs } from '../state/prefs';
import { shortcuts } from '../state/keymap';
import { intentToFrames, passAfterCastFrame } from './commands';
import type { LiveSession } from './session';

const s = {} as LiveSession;
const view = { decision: { kind: 'priority' } } as GameView;

describe('pass after casting', () => {
  it('is off by default and when the stored value is not a boolean', () => {
    expect(DEFAULT_PREFS.passAfterCast).toBe(false);
    expect(parsePrefs('{}').passAfterCast).toBe(false);
    expect(parsePrefs(JSON.stringify({ passAfterCast: 'yes' })).passAfterCast).toBe(false);
    expect(parsePrefs('not json').passAfterCast).toBe(false);
  });

  it('a stored choice survives a reload', () => {
    expect(parsePrefs(JSON.stringify({ passAfterCast: true })).passAfterCast).toBe(true);
  });

  it('is sent to the bridge as its own message', () => {
    expect(passAfterCastFrame(true)).toEqual({ t: 'setPassAfterCast', on: true });
    expect(passAfterCastFrame(false)).toEqual({ t: 'setPassAfterCast', on: false });
  });

  it('a cast or activation with hold asks the bridge to keep priority; without, nothing is added', () => {
    expect(intentToFrames({ type: 'play', cardId: '5', hold: true }, s, view)).toEqual([{ t: 'action', method: 'selectCard', card: 5, hold: true }]);
    expect(intentToFrames({ type: 'activate', cardId: '6', hold: true }, s, view)).toEqual([{ t: 'action', method: 'selectCard', card: 6, hold: true }]);
    expect(intentToFrames({ type: 'play', cardId: '5' }, s, view)).toEqual([{ t: 'action', method: 'selectCard', card: 5 }]);
  });

  it('the Keys panel shows the hold modifier', () => {
    expect(shortcuts().some((k) => k.keys === 'Shift + click')).toBe(true);
  });
});
