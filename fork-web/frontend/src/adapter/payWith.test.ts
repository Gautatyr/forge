/**
 * Issues #66 and #70: paying with permanents (convoke, improvise) and with life (Phyrexian mana) from the page. The
 * bridge adds the permanents the input takes to its setSelection; each click taps one for the cost. Auto-pay only taps and
 * spends mana, so life is paid by hand.
 */
import { describe, expect, it } from 'vitest';
import type { WireObject } from '../wire/generated/wire';
import { DEFAULT_STOPS } from '../state/prefs';
import { primaryAction, promptText } from '../state/primaryAction';
import { INITIAL_UI } from '../state/ui';
import { intentToFrames } from './commands';
import { LiveSession } from './session';
import { toGameView } from './toView';

const YOU = { type: 'player', id: 0 } as const;
const card = (id: number) => ({ type: 'card', id }) as const;
const act = (method: string, fields: object = {}) => ({ t: 'action', method, ...fields });

const cardObjs = (id: number, zone: string, name: string, type: string): WireObject[] => [
  { type: 'card', id, props: { Owner: 0, Controller: 0, Zone: zone, CurrentState: 'Original' } } as WireObject,
  { type: 'cardState', id, state: 'Original', props: { Name: name, Type: type } } as WireObject,
];

/** Your turn: Herald of Anguish (60) is being cast; two Ornithopters (61, 62) and Grizzly Bears (63) on your battlefield. */
function session(): LiveSession {
  const objects: WireObject[] = [
    { type: 'game', id: 1, props: { Players: [0, 1], Turn: 4, Phase: 'MAIN1', PlayerTurn: 0, GameType: 'Constructed' } },
    { type: 'player', id: 0, props: { Name: 'Hugo', Life: 20, Battlefield: [61, 62, 63] } },
    { type: 'player', id: 1, props: { Name: 'AI', IsAI: true, Life: 20 } },
    ...cardObjs(60, 'Stack', 'Herald of Anguish', 'Creature - Demon'),
    ...cardObjs(61, 'Battlefield', 'Ornithopter', 'Artifact Creature - Thopter'),
    ...cardObjs(62, 'Battlefield', 'Ornithopter', 'Artifact Creature - Thopter'),
    ...cardObjs(63, 'Battlefield', 'Grizzly Bears', 'Creature - Bear'),
  ];
  const s = new LiveSession();
  s.apply({ t: 'snapshot', game: 1, seq: 0, label: 't', viewer: { seat: 0, player: 0 }, objects, log: [] });
  return s;
}

/** forge.gamemodes.match.Selection as the bridge sends it (setSelection). */
const selection = (cards: object[], chosen: object[] = []) => ({
  t: 'call' as const,
  method: 'setSelection',
  args: [{ kind: 'Selection', cards, min: 0, max: cards.length, targets: [], chosen }],
});

/** InputSelectCardsForConvokeOrImprovise as the bridge sends it: its prompt and buttons, then the artifacts it takes. */
function improvise(s: LiveSession, remaining = '{5}{B}{B}', chosen: object[] = []) {
  const line = '- Herald of Anguish - Creature 5 / 5';
  s.apply({
    t: 'call',
    method: 'showPromptMessage',
    args: [YOU, `${line}\nHerald of Anguish - Creature 5 / 5\nChoose artifact to tap for Improvise.\nRemaining mana cost is ${remaining}`, card(60)],
  });
  s.apply({ t: 'call', method: 'updateButtons', args: [YOU, 'OK', 'Cancel', true, false, true] });
  s.apply(selection([card(61), card(62)], chosen));
}

describe('improvise and convoke', () => {
  it('lights the permanents the input takes and says what is left, once', () => {
    const s = session();
    improvise(s);
    const g = toGameView(s);
    expect(g.decision).toEqual({
      kind: 'chooseTargets',
      sourceCardId: '60',
      instruction: 'Tap artifacts to pay for Improvise — {5}{B}{B} left',
      legal: [
        { kind: 'card', id: '61' },
        { kind: 'card', id: '62' },
      ],
      chosen: [],
      min: 0,
      max: 2,
      tapToPay: true,
    });
    expect(promptText(g)).toBe('Tap artifacts to pay for Improvise — {5}{B}{B} left.');
    expect(primaryAction(g, INITIAL_UI, DEFAULT_STOPS)).toMatchObject({
      label: 'Cast Herald of Anguish',
      detail: 'Nothing tapped yet',
      enabled: true,
    });
    expect(intentToFrames({ type: 'toggleTarget', target: { kind: 'card', id: '61' } }, s, g)).toEqual([act('selectCard', { card: 61 })]);
  });

  it('names what is tapped once picked; OK goes on to the mana payment', () => {
    const s = session();
    improvise(s);
    improvise(s, '{4}{B}{B}', [card(61)]);
    const g = toGameView(s);
    expect(g.decision).toMatchObject({ kind: 'chooseTargets', chosen: [{ kind: 'card', id: '61' }], instruction: 'Tap artifacts to pay for Improvise — {4}{B}{B} left' });
    expect(primaryAction(g, INITIAL_UI, DEFAULT_STOPS)).toMatchObject({ detail: 'Taps: Ornithopter', enabled: true });
    expect(intentToFrames({ type: 'primary' }, s, g)).toEqual([act('selectButtonOk')]);
  });

  it('reads convoke and a cost paid in full', () => {
    const s = session();
    s.apply({ t: 'call', method: 'showPromptMessage', args: [YOU, 'Choose creature to tap for Convoke.\nRemaining mana cost is 0', card(60)] });
    s.apply({ t: 'call', method: 'updateButtons', args: [YOU, 'OK', 'Cancel', true, false, true] });
    s.apply(selection([card(61), card(62), card(63)]));
    expect(toGameView(s).decision).toMatchObject({ kind: 'chooseTargets', instruction: 'Tap creatures to pay for Convoke — nothing left', tapToPay: true });
  });
});

describe('auto-pay and life', () => {
  it('Phyrexian mana: Auto is off, "Pay 2 life" clicks your player', () => {
    const s = session();
    s.apply({ t: 'call', method: 'setWeaklySelectable', args: [[card(63)]] });
    s.apply({
      t: 'call',
      method: 'showPromptMessage',
      args: [YOU, 'Pay Mana Cost: {G/P}\n(Click on your life total to pay life for phyrexian mana.)', card(60)],
    });
    s.apply({ t: 'call', method: 'updateButtons', args: [YOU, 'Auto', 'Cancel', false, true, false] });
    const g = toGameView(s);
    expect(g.decision).toMatchObject({ kind: 'payMana', autoCanPay: false, lifePays: true });
    expect(primaryAction(g, INITIAL_UI, DEFAULT_STOPS)).toMatchObject({
      label: 'Pay automatically',
      enabled: false,
      detail: 'Auto-pay only taps and spends mana: pay by hand',
    });
    expect(intentToFrames({ type: 'payLife' }, s, g)).toEqual([act('selectPlayer', { player: 0 })]);
  });

  it('a source with an extra cost: Auto is off and says why', () => {
    const s = session();
    // Phyrexian Tower (63 here) can pay {B} only by sacrificing a creature: the engine still lights it as a source.
    s.apply({ t: 'call', method: 'setWeaklySelectable', args: [[card(63)]] });
    s.apply({ t: 'call', method: 'showPromptMessage', args: [YOU, 'Pay Mana Cost: {B}', card(60)] });
    s.apply({ t: 'call', method: 'updateButtons', args: [YOU, 'Auto', 'Cancel', false, true, false] });
    const g = toGameView(s);
    expect(g.decision).toMatchObject({ kind: 'payMana', autoCanPay: false, lifePays: false });
    expect(primaryAction(g, INITIAL_UI, DEFAULT_STOPS)).toMatchObject({ detail: 'Auto-pay only taps and spends mana: pay by hand' });
  });
});
