/** Auto-pass, auto-yield and "Always yield to this" in a live game (issue #125): prefs, frames to the bridge, the view. */
import { describe, expect, it } from 'vitest';
import type { WireObject } from '../wire/generated/wire';
import { DEFAULT_PREFS, parsePrefs } from '../state/prefs';
import { autoPassFrame, autoYieldFrame, intentToFrames } from './commands';
import { LiveSession } from './session';
import { abilityKey, NO_LOCAL, toGameView } from './toView';

/** Two players (you = 0); on the stack, the opponent's trigger (7) and spell (8), your own trigger (9). */
function session(): LiveSession {
  const objects: WireObject[] = [
    { type: 'game', id: 1, props: { Players: [0, 1], Turn: 5, Phase: 'MAIN2', PlayerTurn: 1, Stack: [9, 8, 7] } },
    { type: 'player', id: 0, props: { Name: 'Hugo', Life: 20, Battlefield: [10], HasPriority: true } },
    { type: 'player', id: 1, props: { Name: 'AI', IsAI: true, Life: 20, Battlefield: [20] } },
    { type: 'card', id: 10, props: { Owner: 0, Controller: 0, Zone: 'Battlefield', CurrentState: 'Original' } },
    { type: 'cardState', id: 10, state: 'Original', props: { Name: 'Impact Tremors', Type: 'Enchantment' } },
    { type: 'card', id: 20, props: { Owner: 1, Controller: 1, Zone: 'Battlefield', CurrentState: 'Original' } },
    { type: 'cardState', id: 20, state: 'Original', props: { Name: 'Dogged Pursuit', Type: 'Enchantment' } },
    {
      type: 'stackItem',
      id: 7,
      props: { SourceCard: 20, ActivatingPlayer: 1, Ability: true, SourceTrigger: 3, Key: 'Dogged Pursuit (21): At the beginning of each end step, each opponent loses 1 life.', Description: 'Each opponent loses 1 life.' },
    },
    { type: 'stackItem', id: 8, props: { SourceCard: 20, ActivatingPlayer: 1, Ability: false, Key: 'Lightning Bolt (22): Lightning Bolt deals 3 damage to any target.', Description: 'Bolt' } },
    { type: 'stackItem', id: 9, props: { SourceCard: 10, ActivatingPlayer: 0, Ability: true, SourceTrigger: 4, Key: 'Impact Tremors (11): Whenever a creature you control enters, deal 1 damage to each opponent.', Description: 'Tremors' } },
  ];
  const s = new LiveSession();
  s.apply({ t: 'snapshot', game: 1, seq: 0, label: 't', viewer: { seat: 0, player: 0 }, objects, log: [] });
  return s;
}

const TRIGGER_KEY = 'At the beginning of each end step, each opponent loses 1 life.';

describe('auto-pass and auto-yield prefs', () => {
  it('are off by default and when the stored value is not a boolean', () => {
    expect(DEFAULT_PREFS).toMatchObject({ autoPass: false, autoYield: false });
    expect(parsePrefs('{}')).toMatchObject({ autoPass: false, autoYield: false });
    expect(parsePrefs(JSON.stringify({ autoPass: 1, autoYield: 'on' }))).toMatchObject({ autoPass: false, autoYield: false });
    expect(parsePrefs('not json')).toMatchObject({ autoPass: false, autoYield: false });
  });

  it('a stored choice survives a reload', () => {
    expect(parsePrefs(JSON.stringify({ autoPass: true, autoYield: true }))).toMatchObject({ autoPass: true, autoYield: true });
  });

  it('are sent to the bridge as their own messages', () => {
    expect(autoPassFrame(true)).toEqual({ t: 'setAutoPass', on: true });
    expect(autoYieldFrame(false)).toEqual({ t: 'setAutoYield', on: false });
  });
});

describe('the view', () => {
  it('reads the settings and the abilities the bridge reports', () => {
    const s = session();
    expect(toGameView(s, undefined, NO_LOCAL)).toMatchObject({ autoPass: false, autoYield: false, autoYieldTo: [] });
    s.apply({ t: 'yields', autoYieldTo: [TRIGGER_KEY] });
    expect(toGameView(s, undefined, { ...NO_LOCAL, autoPass: true, autoYield: true })).toMatchObject({
      autoPass: true,
      autoYield: true,
      autoYieldTo: [TRIGGER_KEY],
    });
  });

  it('keys abilities, never spells, by the engine key without the card id', () => {
    const g = toGameView(session());
    const byId = Object.fromEntries(g.stack.map((it) => [it.id, it.yieldKey]));
    expect(byId).toEqual({ '7': TRIGGER_KEY, '8': undefined, '9': 'Whenever a creature you control enters, deal 1 damage to each opponent.' });
    expect(abilityKey('no card id')).toBe('no card id');
  });

  it('a new snapshot drops the reported abilities until the greeting sends them again', () => {
    const s = session();
    s.apply({ t: 'yields', autoYieldTo: [TRIGGER_KEY] });
    s.apply({ t: 'snapshot', game: 2, seq: 0, label: 't', viewer: { seat: 0, player: 0 }, objects: [], log: [] });
    expect(s.yields).toEqual([]);
  });
});

describe('Always yield to this', () => {
  it('names the stack item to the bridge, which reads the ability off it', () => {
    const s = session();
    const g = toGameView(s);
    expect(intentToFrames({ type: 'toggleAutoYieldTo', key: TRIGGER_KEY }, s, g)).toEqual([
      { t: 'action', method: 'sendYieldUpdate', update: { kind: 'AutoYieldTo', stackItem: 7, active: true } },
    ]);
  });

  it('asks to stop yielding to an ability that is already chosen', () => {
    const s = session();
    s.apply({ t: 'yields', autoYieldTo: [TRIGGER_KEY] });
    const g = toGameView(s);
    expect(intentToFrames({ type: 'toggleAutoYieldTo', key: TRIGGER_KEY }, s, g)).toEqual([
      { t: 'action', method: 'sendYieldUpdate', update: { kind: 'AutoYieldTo', stackItem: 7, active: false } },
    ]);
  });

  it('sends nothing for an ability that is no longer on the stack', () => {
    const s = session();
    expect(intentToFrames({ type: 'toggleAutoYieldTo', key: 'gone' }, s, toGameView(s))).toEqual([]);
  });

  it('the switches themselves are prefs: no frame from the intent (useLive sends the pref)', () => {
    const s = session();
    const g = toGameView(s);
    expect(intentToFrames({ type: 'setAutoPass', on: true }, s, g)).toEqual([]);
    expect(intentToFrames({ type: 'setAutoYield', on: true }, s, g)).toEqual([]);
  });
});
