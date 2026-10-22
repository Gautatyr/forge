import { describe, expect, it } from 'vitest';
import type { CardView } from '../model/types';
import type { PromptChoice, PromptMessage } from './protocol';
import { inputToChoice, promptToChoice, replyValue } from './prompts';
import { NO_INPUT } from './session';

const cards = { '12': { id: '12', name: 'Llanowar Elves' } as CardView };
const base = { t: 'prompt' as const, id: 7 };

describe('mulligan copy from the live hand (pass 2 #3)', () => {
  const mull = { ...NO_INPUT, message: 'Keep?', ok: { label: 'Keep', enabled: true }, cancel: { label: 'Mulligan', enabled: true } };
  const hand = (n: number, players: number, extra: object = {}) =>
    ({
      players: [
        { id: '0', isYou: true, hand: Array.from({ length: n }, (_, i) => String(i)), ...extra },
        ...Array.from({ length: players - 1 }, (_, i) => ({ id: String(i + 1) })),
      ],
      cards,
    }) as never;
  const text = (v: never) => inputToChoice(mull, v)?.instruction;

  it('first hand of 7 in a duel: the mulligan draws 7 and puts 1 back', () => {
    expect(text(hand(7, 2))).toBe('Keep these cards, or shuffle and draw 7 new ones, then put 1 on the bottom.');
  });
  it('first hand with a free mulligan (more than 2 players): draws 7, nothing goes back', () => {
    expect(text(hand(7, 4))).toBe('Keep these cards, or shuffle and draw 7 new ones. Your first mulligan is free.');
  });
  it('a hand of 6 after a mulligan: the engine already bottomed 1, the next draws 7 and puts 2 back', () => {
    expect(text(hand(6, 2, { mulligan: { state: 'mulligan', cards: 6 } }))).toBe(
      'Keep these cards, or shuffle and draw 7 new ones, then put 2 on the bottom.',
    );
  });
  it('after the free mulligan (hand 7 again) the next one costs a card', () => {
    expect(text(hand(7, 4, { mulligan: { state: 'mulligan', cards: 7 } }))).toBe(
      'Keep these cards, or shuffle and draw 7 new ones, then put 1 on the bottom.',
    );
  });
});

describe('colour choice (pass 1 #4)', () => {
  const colours = ['WHITE', 'BLUE', 'BLACK', 'RED', 'GREEN'];
  const choose = (labels: string[], min = 1, max = 1): PromptMessage => ({
    ...base,
    method: 'getChoices',
    shape: 'choose',
    message: 'Choose a color',
    min,
    max,
    choices: labels.map((label, i): PromptChoice => ({ i, label })),
  });

  it('lists colours with their mana symbol and normal case; the reply still names the index', () => {
    const m = choose(colours);
    const p = promptToChoice(m, cards);
    expect(p.shape === 'chooseN' && p.options.map((o) => [o.id, o.label, o.symbol])).toEqual([
      ['0', 'White', '{W}'],
      ['1', 'Blue', '{U}'],
      ['2', 'Black', '{B}'],
      ['3', 'Red', '{R}'],
      ['4', 'Green', '{G}'],
    ]);
    expect(replyValue(m, { shape: 'chooseN', optionIds: ['3'] })).toEqual([3]);
  });

  it('handles colourless and a subset, and leaves other lists alone', () => {
    const p = promptToChoice(choose(['RED', 'COLORLESS']), cards);
    expect(p.shape === 'chooseN' && p.options.map((o) => [o.label, o.symbol])).toEqual([
      ['Red', '{R}'],
      ['Colorless', '{C}'],
    ]);
    const other = promptToChoice(choose(['Red Dragon', 'Blue Whale']), cards);
    expect(other.shape === 'chooseN' && other.options.map((o) => [o.label, o.symbol])).toEqual([
      ['Red Dragon', undefined],
      ['Blue Whale', undefined],
    ]);
  });
});

describe('surveil (pass 2 #1)', () => {
  const surveil: PromptMessage = {
    ...base,
    method: 'order',
    shape: 'order',
    message: 'Select cards to be put into the graveyard',
    destLabel: 'Cards to put in the graveyard',
    choices: [
      { i: 0, label: 'Llanowar Elves', ref: { type: 'card', id: 12 } },
      { i: 1, label: 'Forest' },
    ],
    remainingMin: 0,
    remainingMax: 2,
    rememberOption: false,
  };

  it('is titled Surveil N and the lists and move buttons name their destination', () => {
    const p = promptToChoice(surveil, cards);
    expect(p).toMatchObject({ shape: 'order', title: 'Surveil 2', confirmLabel: 'Confirm' });
    expect(p.shape === 'order' && p.lists.map((l) => [l.id, l.label, l.moveTo])).toEqual([
      ['source', 'Keep on top', 'top'],
      ['dest', 'Graveyard', 'graveyard'],
    ]);
  });

  it('keeps the reply shape', () => {
    expect(replyValue(surveil, { shape: 'order', lists: [{ id: 'source', itemIds: ['1'] }, { id: 'dest', itemIds: ['0'] }] })).toEqual({ order: [0], remember: false });
  });
});
