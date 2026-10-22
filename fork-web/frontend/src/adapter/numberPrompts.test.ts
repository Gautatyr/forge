/**
 * Issue #29 (playtest 2 #5): an X asked as a list "0 … 9, Other…" is the number field; the engine's "Other…" follow-up is
 * answered for you; Cancel backs out; the payment shows the X and the activated ability.
 */
import { describe, expect, it } from 'vitest';
import type { CallMessage, WireObject } from '../wire/generated/wire';
import { autoAnswer, intentToFrames } from './commands';
import { cancelValue, promptToChoice, replyValue } from './prompts';
import type { PromptMessage } from './protocol';
import { LiveSession } from './session';
import { toGameView } from './toView';
import { numberList } from './trayWords';

const YOU = { type: 'player', id: 0 } as const;
const card = (id: number) => ({ type: 'card', id }) as const;
const cardObjs = (id: number, zone: string, name: string, type: string): WireObject[] => [
  { type: 'card', id, props: { Owner: 0, Controller: 0, Zone: zone, CurrentState: 'Original' } } as WireObject,
  { type: 'cardState', id, state: 'Original', props: { Name: name, Type: type } } as WireObject,
];

function session(): LiveSession {
  const objects: WireObject[] = [
    { type: 'game', id: 1, props: { Players: [0, 1], Turn: 4, Phase: 'MAIN1', PlayerTurn: 0, GameType: 'Constructed' } },
    { type: 'player', id: 0, props: { Name: 'Hugo', Life: 20, Battlefield: [61] } },
    { type: 'player', id: 1, props: { Name: 'AI', IsAI: true, Life: 20 } },
    ...cardObjs(60, 'Stack', 'Rolling Thunder', 'Sorcery'),
    ...cardObjs(61, 'Battlefield', 'Basilisk Collar', 'Artifact - Equipment'),
  ];
  const s = new LiveSession();
  s.apply({ t: 'snapshot', game: 1, seq: 0, label: 't', viewer: { seat: 0, player: 0 }, objects, log: [] });
  return s;
}

const labels = (...l: string[]) => l.map((label, i) => ({ i, label }));
const upTo = (n: number) => Array.from({ length: n + 1 }, (_, i) => String(i));
const xPrompt = (id: number, ...l: string[]): PromptMessage => ({
  t: 'prompt',
  id,
  method: 'getChoices',
  shape: 'choose',
  message: 'Choose X for Rolling Thunder',
  min: 0,
  max: 1,
  choices: labels(...l),
});
const OTHER_LIST = xPrompt(9, ...upTo(9), 'Other...');
const textPrompt = (id: number, message: string): PromptMessage => ({ t: 'prompt', id, method: 'showInputDialog', shape: 'text', message, numeric: true });

describe('X asked as a list of numbers', () => {
  it('reads "0 … 9, Other…" as an open number field and a plain list as a bounded one', () => {
    expect(promptToChoice(OTHER_LIST, {})).toMatchObject({ shape: 'input', kind: 'number', min: 0, defaultValue: '0', title: 'Choose X for Rolling Thunder' });
    expect('max' in promptToChoice(OTHER_LIST, {})).toBe(false);
    expect(promptToChoice(xPrompt(9, ...upTo(5)), {})).toMatchObject({ shape: 'input', kind: 'number', min: 0, max: 5 });
    // the list of options the tray already knew (exactly one wanted): unchanged
    expect(promptToChoice({ ...(xPrompt(9, ...upTo(5)) as Extract<PromptMessage, { shape: 'choose' }>), min: 1 }, {})).toMatchObject({ shape: 'input', kind: 'number', min: 0, max: 5 });
  });

  it('leaves other lists as they are', () => {
    expect(numberList(labels('1', '2', 'Other...'), 0, 2)).toBeUndefined();
    expect(numberList(labels('Red', 'Blue'), 0, 1)).toBeUndefined();
    expect(promptToChoice(xPrompt(9, 'Yes', 'No'), {})).toMatchObject({ shape: 'chooseN' });
  });

  it('answers a listed number by its index and a number past the list by "Other…"', () => {
    expect(replyValue(OTHER_LIST, { shape: 'input', value: '4' })).toEqual([4]);
    expect(replyValue(OTHER_LIST, { shape: 'input', value: '12' })).toEqual([10]);
    expect(replyValue(xPrompt(9, ...upTo(5)), { shape: 'input', value: '9' })).toBeUndefined();
  });

  it('can be cancelled with an empty answer (the engine reads it as null)', () => {
    expect(cancelValue(OTHER_LIST)).toEqual([]);
    expect(cancelValue({ ...OTHER_LIST, method: 'chooseSingleEntityForEffect' } as PromptMessage)).toBeUndefined();
    const s = session();
    s.apply(OTHER_LIST);
    const g = toGameView(s);
    expect(g.decision).toMatchObject({ kind: 'choice', cancellable: true });
    expect(intentToFrames({ type: 'cancel' }, s, g)).toEqual([{ t: 'reply', id: 9, value: [] }]);
  });

  it('types a number past the list into the engine follow-up, once and only when it is in range', () => {
    const s = session();
    s.apply(OTHER_LIST);
    const g = toGameView(s);
    expect(intentToFrames({ type: 'answer', promptId: 'prompt:9', answer: { shape: 'input', value: '12' } }, s, g)).toEqual([
      { t: 'reply', id: 9, value: [10] },
    ]);
    s.answered(9);
    s.apply({ t: 'promptClosed', id: 9 } as never);
    expect(autoAnswer(s)).toBeUndefined();
    s.apply(textPrompt(10, 'Enter a number between 0 and 14:'));
    expect(autoAnswer(s)).toEqual({ key: 'number|10', frames: [{ t: 'reply', id: 10, value: '12' }] });
    // out of the engine's range: shown to you, not answered
    s.apply({ t: 'promptClosed', id: 10 } as never);
    s.apply(textPrompt(11, 'Enter a number between 0 and 10:'));
    expect(autoAnswer(s)).toBeUndefined();
    // an X has no maximum: what the engine really says (HumanSeatScryTest.anXAboveNineIsAListWithOtherThenANumberPrompt)
    s.apply({ t: 'promptClosed', id: 11 } as never);
    s.apply(textPrompt(13, 'Enter a number greater than or equal to 0:'));
    expect(autoAnswer(s)).toEqual({ key: 'number|13', frames: [{ t: 'reply', id: 13, value: '12' }] });
    expect(promptToChoice(textPrompt(13, 'Enter a number greater than or equal to 0:'), {})).toMatchObject({ kind: 'number', min: 0 });
    expect(promptToChoice(textPrompt(11, 'Enter a number between 0 and 10:'), {})).toMatchObject({ shape: 'input', kind: 'number', min: 0, max: 10 });
    expect(promptToChoice(textPrompt(12, 'Enter a number between 0 and 1,200:'), {})).toMatchObject({ min: 0, max: 1200 });
  });
});

describe('the payment after X and for an ability', () => {
  const pay = (s: LiveSession, cardRef: ReturnType<typeof card>, info?: CallMessage['input']) => {
    s.apply({ t: 'call', method: 'showPromptMessage', args: [YOU, 'Pay Mana Cost: {4}{R}', cardRef], ...(info ? { input: info } : {}) });
    s.apply({ t: 'call', method: 'updateButtons', args: [YOU, 'Auto', 'Cancel', false, true, false] });
  };
  const announce = (s: LiveSession, value: string) => {
    s.apply(xPrompt(9, ...upTo(5)));
    intentToFrames({ type: 'answer', promptId: 'prompt:9', answer: { shape: 'input', value } }, s, toGameView(s));
    s.apply({ t: 'promptClosed', id: 9 } as never);
  };

  it('shows the X you announced for that card, until the payment is over', () => {
    const s = session();
    announce(s, '4');
    pay(s, card(60));
    expect(toGameView(s).decision).toMatchObject({ kind: 'payMana', x: 4 });
    // the spell is on the stack: its X is spent
    s.apply({ t: 'call', method: 'showPromptMessage', args: [YOU, 'Priority: Hugo', card(-1)] });
    pay(s, card(60));
    expect(toGameView(s).decision).not.toHaveProperty('x');
  });

  it('shows no X for another card', () => {
    const s = session();
    announce(s, '4');
    pay(s, card(61));
    expect(toGameView(s).decision).not.toHaveProperty('x');
  });

  it('names the activated ability being paid for', () => {
    const s = session();
    pay(s, card(61), { kind: 'pay', payFor: 'Equip {2}' });
    expect(toGameView(s).decision).toMatchObject({ kind: 'payMana', ability: 'Equip {2}' });
    const t = session();
    pay(t, card(60), { kind: 'pay' });
    expect(toGameView(t).decision).not.toHaveProperty('ability');
  });
});
