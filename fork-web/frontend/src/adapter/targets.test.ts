/**
 * Issue #53 part 2 / #45: every target kind a Forge targeting input offers is choosable from the page, and its
 * clicks map to the input's own actions (stack items: selectStackItem). Also the floating-pool click while paying.
 */
import { describe, expect, it } from 'vitest';
import { canCancel, primaryAction, promptText } from '../state/primaryAction';
import { DEFAULT_PREFS } from '../state/prefs';
import { INITIAL_UI } from '../state/ui';
import type { WireObject } from '../wire/generated/wire';
import { intentToFrames } from './commands';
import { LiveSession } from './session';
import { toGameView } from './toView';

const YOU = { type: 'player', id: 0 } as const;
const card = (id: number) => ({ type: 'card', id }) as const;
const item = (id: number) => ({ type: 'stackItem', id }) as const;
const act = (method: string, fields: object = {}) => ({ t: 'action', method, ...fields });

const cardObjs = (id: number, owner: number, zone: string, name: string, type: string): WireObject[] => [
  { type: 'card', id, props: { Owner: owner, Controller: owner, Zone: zone, CurrentState: 'Original' } } as WireObject,
  { type: 'cardState', id, state: 'Original', props: { Name: name, Type: type } } as WireObject,
];

/**
 * You (0) hold Counterspell (60) and priority; the opponent's Lightning Bolt (50) is on the stack (item 7) under
 * their Llanowar Elves ability (item 8); a creature card (70) is in their graveyard, one (80) in your exile, and a
 * planeswalker (90) on their battlefield.
 */
function session(): LiveSession {
  const objects: WireObject[] = [
    { type: 'game', id: 1, props: { Players: [0, 1], Turn: 4, Phase: 'MAIN1', PlayerTurn: 1, GameType: 'Constructed', Stack: [8, 7] } },
    { type: 'player', id: 0, props: { Name: 'Hugo', Life: 20, Hand: [60], Exile: [80], Mana: { '4': 1 } } },
    { type: 'player', id: 1, props: { Name: 'AI', IsAI: true, Life: 20, Battlefield: [55, 90], Graveyard: [70] } },
    ...cardObjs(60, 0, 'Hand', 'Counterspell', 'Instant'),
    ...cardObjs(50, 1, 'Stack', 'Lightning Bolt', 'Instant'),
    ...cardObjs(55, 1, 'Battlefield', 'Llanowar Elves', 'Creature - Elf Druid'),
    ...cardObjs(70, 1, 'Graveyard', 'Grizzly Bears', 'Creature - Bear'),
    ...cardObjs(80, 0, 'Exile', 'Ornithopter', 'Artifact Creature - Thopter'),
    ...cardObjs(90, 1, 'Battlefield', 'Jace Beleren', 'Legendary Planeswalker - Jace'),
    { type: 'stackItem', id: 7, props: { SourceCard: 50, ActivatingPlayer: 1, Description: 'Lightning Bolt deals 3 damage to Hugo', TargetPlayers: [0] } },
    { type: 'stackItem', id: 8, props: { SourceCard: 55, ActivatingPlayer: 1, Ability: true, Description: 'Llanowar Elves - Add {G}' } },
  ];
  const s = new LiveSession();
  s.apply({ t: 'snapshot', game: 1, seq: 0, label: 't', viewer: { seat: 0, player: 0 }, objects, log: [] });
  return s;
}

/** InputSelectStackItems for Counterspell being cast (its ref is -1 while it is cast: the clicked card names it). */
function counterspell(s: LiveSession, refs = [item(7), item(8)]) {
  s.apply({ t: 'call', method: 'updateButtons', args: [YOU, 'OK', 'End Turn', true, true, true] });
  s.apply({ t: 'call', method: 'showPromptMessage', args: [YOU, 'Priority: Hugo', null] });
  s.clicked(60);
  s.apply({ t: 'call', method: 'setSelectableTargets', args: [refs] });
  s.apply({ t: 'call', method: 'showPromptMessage', args: [YOU, 'Select a target on the stack (1 more)', card(-1)] });
  s.apply({ t: 'call', method: 'updateButtons', args: [YOU, 'OK', 'Cancel', false, true, true] });
}

describe('stack items as targets', () => {
  it('offers the stack items the input names as legal targets, on the board', () => {
    const s = session();
    counterspell(s);
    expect(toGameView(s).decision).toEqual({
      kind: 'chooseTargets',
      sourceCardId: '60',
      instruction: 'Select a target on the stack (1 more)',
      legal: [
        { kind: 'stackItem', id: '7' },
        { kind: 'stackItem', id: '8' },
      ],
      chosen: [],
      min: 1,
      max: 1,
    });
  });

  it('picks a stack item with selectStackItem, and shows it chosen once the engine highlights it', () => {
    const s = session();
    counterspell(s);
    const g = toGameView(s);
    expect(intentToFrames({ type: 'toggleTarget', target: { kind: 'stackItem', id: '7' } }, s, g)).toEqual([act('selectStackItem', { stackItem: 7 })]);
    s.apply({ t: 'call', method: 'setHighlighted', args: [[item(7)], true] });
    expect(toGameView(s).decision).toMatchObject({ kind: 'chooseTargets', chosen: [{ kind: 'stackItem', id: '7' }] });
  });

  it('leaves out stack items that are no longer on the stack', () => {
    const s = session();
    counterspell(s, [item(7), item(99)]);
    expect(toGameView(s).decision).toMatchObject({ kind: 'chooseTargets', legal: [{ kind: 'stackItem', id: '7' }] });
  });

  it('keeps stack items on the board when no spell names the input (after a reconnect), with Cancel', () => {
    const s = session();
    s.apply({ t: 'call', method: 'setSelectableTargets', args: [[item(7), item(8)]] });
    s.apply({ t: 'call', method: 'showPromptMessage', args: [YOU, 'Select target spell or ability', null] });
    s.apply({ t: 'call', method: 'updateButtons', args: [YOU, 'OK', 'Cancel', false, true, true] });
    const g = toGameView(s);
    expect(g.decision).toMatchObject({
      kind: 'chooseTargets',
      sourceCardId: '',
      legal: [
        { kind: 'stackItem', id: '7' },
        { kind: 'stackItem', id: '8' },
      ],
      min: 1,
      max: 1,
    });
    expect(intentToFrames({ type: 'toggleTarget', target: { kind: 'stackItem', id: '8' } }, s, g)).toEqual([act('selectStackItem', { stackItem: 8 })]);
    expect(intentToFrames({ type: 'cancel' }, s, g)).toEqual([act('selectButtonCancel')]);
  });

  it('offers a further stack item after a pick that left the input open ("up to two"; the engine sends no max)', () => {
    const s = session();
    counterspell(s);
    s.apply({ t: 'call', method: 'setHighlighted', args: [[item(7)], true] });
    s.apply({ t: 'call', method: 'updateButtons', args: [YOU, 'OK', 'Cancel', true, true, true] });
    const g = toGameView(s);
    expect(g.decision).toMatchObject({ kind: 'chooseTargets', chosen: [{ kind: 'stackItem', id: '7' }], min: 1, max: 2 });
    expect(intentToFrames({ type: 'toggleTarget', target: { kind: 'stackItem', id: '8' } }, s, g)).toEqual([act('selectStackItem', { stackItem: 8 })]);
  });

  it('shows what a stack item targets on the stack, including another stack item', () => {
    const s = session();
    s.apply({
      t: 'delta', game: 1, seq: 1, ts: 0, removed: [], log: [], events: [],
      new: [{ type: 'stackItem', id: 9, props: { SourceCard: 60, ActivatingPlayer: 0, Description: 'Counter target spell', TargetStackItems: [7, 42] } }],
      changed: [{ type: 'game', id: 1, props: { Stack: [9, 8, 7] } }],
    });
    s.apply({ t: 'delta', game: 1, seq: 2, ts: 0, removed: [], log: [], events: [], new: [], changed: [{ type: 'card', id: 60, props: { Zone: 'Stack' } }, { type: 'player', id: 0, props: { Hand: [] } }] });
    expect(toGameView(s).stack.at(-1)).toMatchObject({ id: '9', targets: [{ kind: 'stackItem', id: '7' }] });
  });
});

describe('other target kinds a targeting input offers', () => {
  it('keeps players and permanents (a planeswalker) on the board', () => {
    const s = session();
    s.apply({ t: 'call', method: 'setSelectables', args: [[card(55), card(90)], 1, 1] });
    s.apply({ t: 'call', method: 'setSelectableTargets', args: [[{ type: 'player', id: 1 }]] });
    s.apply({ t: 'call', method: 'showPromptMessage', args: [YOU, 'Counterspell - Select any target', card(60)] });
    s.apply({ t: 'call', method: 'updateButtons', args: [YOU, 'OK', 'Cancel', false, true, false] });
    const g = toGameView(s);
    expect(g.decision).toMatchObject({
      kind: 'chooseTargets',
      legal: [
        { kind: 'card', id: '55' },
        { kind: 'card', id: '90' },
        { kind: 'player', id: '1' },
      ],
    });
    expect(intentToFrames({ type: 'toggleTarget', target: { kind: 'card', id: '90' } }, s, g)).toEqual([act('selectCard', { card: 90 })]);
    expect(intentToFrames({ type: 'toggleTarget', target: { kind: 'player', id: '1' } }, s, g)).toEqual([act('selectPlayer', { player: 1 })]);
  });

  it('lists graveyard and exile cards in the tray, answered by selectCard', () => {
    const s = session();
    s.apply({ t: 'call', method: 'setSelectables', args: [[card(70), card(80)], 1, 1] });
    s.apply({ t: 'call', method: 'showPromptMessage', args: [YOU, 'Counterspell - Select target creature card in a graveyard or exile', card(60)] });
    s.apply({ t: 'call', method: 'updateButtons', args: [YOU, 'OK', 'Cancel', false, true, false] });
    const g = toGameView(s);
    expect(g.decision).toMatchObject({
      kind: 'choice',
      prompt: { options: [{ id: 'c70', cardId: '70' }, { id: 'c80', cardId: '80' }], min: 1, max: 1 },
    });
    const id = g.decision.kind === 'choice' ? g.decision.prompt.id : '';
    expect(intentToFrames({ type: 'answer', promptId: id, answer: { shape: 'chooseN', optionIds: ['c70'] } }, s, g)).toEqual([act('selectCard', { card: 70 })]);
  });
});

/**
 * Issue #62: the page reloaded while you cast a spell. The new session never saw the click, and the engine's ref to
 * the spell is -1; its targeting message still names it, "Lightning Bolt (27) - …".
 */
describe('after a reload mid-cast', () => {
  const ask = (s: LiveSession, message: string, cancel = { label: 'Cancel', enabled: true }) => {
    s.apply({ t: 'call', method: 'showPromptMessage', args: [YOU, message, card(-1)] });
    s.apply({ t: 'call', method: 'updateButtons', args: [YOU, 'OK', cancel.label, false, cancel.enabled, false] });
  };
  const bolt = (s: LiveSession) => {
    ask(s, 'Lightning Bolt (27) - Lightning Bolt deals 3 damage to any target.\n\nSelect any target');
    s.apply({ t: 'call', method: 'setSelectables', args: [[card(55)], 1, 1] });
    s.apply({ t: 'call', method: 'setSelectableTargets', args: [[YOU, { type: 'player', id: 1 }]] });
  };

  it('restores the spell from the prompt and keeps card targets on the board, with Cancel', () => {
    const s = session();
    bolt(s);
    const g = toGameView(s);
    expect(g.decision).toEqual({
      kind: 'chooseTargets',
      sourceCardId: '27',
      instruction: 'Select any target',
      legal: [
        { kind: 'card', id: '55' },
        { kind: 'player', id: '0' },
        { kind: 'player', id: '1' },
      ],
      chosen: [],
      min: 1,
      max: 1,
    });
    expect(g.cards['27']).toMatchObject({ name: 'Lightning Bolt', zone: 'stack', ownerId: '0', controllerId: '0' });
    expect(promptText(g)).toBe('Select any target for Lightning Bolt.');
    expect(primaryAction(g, INITIAL_UI, DEFAULT_PREFS.stops)).toMatchObject({ label: 'Choose a target', enabled: false });
    expect(canCancel(g, INITIAL_UI)).toBe(true);
    expect(intentToFrames({ type: 'cancel' }, s, g)).toEqual([act('selectButtonCancel')]);
  });

  it('still names the spell while you pay for it, until you have priority again', () => {
    const s = session();
    bolt(s);
    s.apply({ t: 'call', method: 'awaitNextInput', args: [] });
    s.apply({ t: 'call', method: 'showPromptMessage', args: [YOU, 'Lightning Bolt deals 3 damage to Llanowar Elves.\n\nPay Mana Cost: {R}', card(-1)] });
    s.apply({ t: 'call', method: 'updateButtons', args: [YOU, 'Auto', 'Cancel', true, true, true] });
    let g = toGameView(s);
    expect(g.decision).toMatchObject({ kind: 'payMana', sourceCardId: '27' });
    s.apply({ t: 'call', method: 'showPromptMessage', args: [YOU, 'Priority: Hugo', null] });
    s.apply({ t: 'call', method: 'updateButtons', args: [YOU, 'OK', 'End Turn', true, true, true] });
    g = toGameView(s);
    expect(g.cards['27']).toBeUndefined();
  });

  it('keeps Cancel for targets the tray lists (a graveyard card)', () => {
    const s = session();
    ask(s, 'Raise Dead (27) - Return target creature card from a graveyard to your hand.\n\nSelect target creature card in a graveyard');
    s.apply({ t: 'call', method: 'setSelectables', args: [[card(70)], 1, 1] });
    const g = toGameView(s);
    expect(g.decision).toMatchObject({ kind: 'choice', cancellable: true, prompt: { options: [{ id: 'c70', cardId: '70' }] } });
    expect(canCancel(g, INITIAL_UI)).toBe(true);
    expect(intentToFrames({ type: 'cancel' }, s, g)).toEqual([act('selectButtonCancel')]);
  });

  it('offers no Cancel when the input has none, or uses that button for something else', () => {
    for (const cancel of [{ label: 'Cancel', enabled: false }, { label: 'Select all', enabled: true }]) {
      const s = session();
      ask(s, 'Raise Dead (27) - Return target creature card from a graveyard to your hand.\n\nSelect target creature card in a graveyard', cancel);
      s.apply({ t: 'call', method: 'setSelectables', args: [[card(70)], 1, 1] });
      const g = toGameView(s);
      expect(g.decision.kind).toBe('choice');
      expect(canCancel(g, INITIAL_UI)).toBe(false);
    }
  });

  it('a clicked card still wins over an older named spell', () => {
    const s = session();
    bolt(s);
    s.apply({ t: 'call', method: 'showPromptMessage', args: [YOU, 'Priority: Hugo', null] });
    s.apply({ t: 'call', method: 'updateButtons', args: [YOU, 'OK', 'End Turn', true, true, true] });
    counterspell(s);
    expect(toGameView(s).decision).toMatchObject({ kind: 'chooseTargets', sourceCardId: '60' });
  });
});

describe('floating mana while paying', () => {
  it('offers the pool and spends a clicked symbol with useMana', () => {
    const s = session();
    s.clicked(60);
    s.apply({ t: 'call', method: 'showPromptMessage', args: [YOU, 'Counterspell\n\nPay Mana Cost: {U}{U}', card(-1)] });
    s.apply({ t: 'call', method: 'updateButtons', args: [YOU, 'Auto', 'Cancel', true, true, true] });
    const g = toGameView(s);
    expect(g.players.find((p) => p.isYou)?.manaPool).toEqual({ B: 1 });
    expect(g.decision).toMatchObject({ kind: 'payMana', remaining: '{U}{U}' });
    expect(intentToFrames({ type: 'spendPool', colour: 'B' }, s, g)).toEqual([act('useMana', { color: 4 })]);
    expect(intentToFrames({ type: 'spendPool', colour: 'C' }, s, g)).toEqual([act('useMana', { color: 32 })]);
  });
});
