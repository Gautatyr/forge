import { describe, expect, it } from 'vitest';
import type { CardView } from '../model/types';
import type { PromptMessage } from './protocol';
import { inputToChoice, promptToChoice, replyValue } from './prompts';
import { NO_INPUT } from './session';

const cards = { '12': { id: '12', name: 'Llanowar Elves' } as CardView };
const choices = [
  { i: 0, label: 'Llanowar Elves', ref: { type: 'card' as const, id: 12 } },
  { i: 1, label: 'Opponent', ref: { type: 'player' as const, id: 1 } },
  { i: 2, label: 'Hidden', ref: { type: 'card' as const, id: 1073741900 } },
];
const prompt = (method: PromptMessage['method'], extra: Partial<PromptMessage> = {}): PromptMessage => ({
  t: 'prompt',
  id: 5,
  method,
  title: 'Choose',
  choices,
  ...extra,
});

describe('prompt → choice tray', () => {
  it('maps the five list methods to chooseN with server bounds or single-pick defaults', () => {
    for (const m of ['getChoices', 'chooseEntitiesForEffect'] as const) {
      expect(promptToChoice(prompt(m, { min: 1, max: 2 }), cards)).toMatchObject({ shape: 'chooseN', min: 1, max: 2 });
    }
    for (const m of ['chooseSingleEntityForEffect', 'getAbilityToPlay', 'showOptionDialog'] as const) {
      expect(promptToChoice(prompt(m), cards)).toMatchObject({ shape: 'chooseN', min: 1, max: 1 });
    }
    const p = promptToChoice(prompt('getChoices'), cards);
    expect(p.id).toBe('prompt:5');
    expect(p.shape === 'chooseN' && p.options).toEqual([
      { id: '0', label: 'Llanowar Elves', cardId: '12' },
      { id: '1', label: 'Opponent' },
      { id: '2', label: 'Hidden' },
    ]);
  });

  it('maps confirm dialogs to yes/no with the server labels', () => {
    expect(promptToChoice(prompt('confirm', { choices: [] }), cards)).toMatchObject({ shape: 'yesNo', yesLabel: 'Yes', noLabel: 'No' });
    expect(
      promptToChoice(prompt('showConfirmDialog', { choices: [{ i: 0, label: 'Play' }, { i: 1, label: 'Draw' }] }), cards),
    ).toMatchObject({ shape: 'yesNo', yesLabel: 'Play', noLabel: 'Draw' });
  });

  it('maps order methods to one list, or two when the prompt has a destination', () => {
    const one = promptToChoice(prompt('order'), cards);
    expect(one.shape === 'order' && one.lists.map((l) => [l.id, l.items.length])).toEqual([['dest', 3]]);
    const two = promptToChoice(prompt('manipulateCardList', { dest: [{ i: 3, label: 'Island' }] }), cards);
    expect(two.shape === 'order' && two.lists.map((l) => [l.id, l.items.map((i) => i.id)])).toEqual([
      ['source', ['0', '1', '2']],
      ['dest', ['3']],
    ]);
    expect(promptToChoice(prompt('sideboard'), cards).shape).toBe('order');
  });

  it('maps damage assignment to distribute and the input dialog to input', () => {
    expect(promptToChoice(prompt('assignCombatDamage', { amount: 5, card: 12 }), cards)).toMatchObject({
      shape: 'distribute',
      total: 5,
      sourceCardId: '12',
    });
    expect(promptToChoice(prompt('assignGenericAmount', { amount: 3 }), cards).shape).toBe('distribute');
    expect(promptToChoice(prompt('showInputDialog'), cards)).toMatchObject({ shape: 'input', kind: 'text' });
  });
});

describe('tray answer → reply value', () => {
  it('sends indices, never objects', () => {
    expect(replyValue(prompt('getChoices'), { shape: 'chooseN', optionIds: ['2', '0'] })).toEqual([2, 0]);
    expect(replyValue(prompt('chooseSingleEntityForEffect'), { shape: 'chooseN', optionIds: ['1'] })).toBe(1);
    expect(replyValue(prompt('getAbilityToPlay'), { shape: 'chooseN', optionIds: [] })).toBe(-1);
    expect(replyValue(prompt('confirm'), { shape: 'yesNo', yes: false })).toBe(false);
    expect(
      replyValue(prompt('manipulateCardList'), {
        shape: 'order',
        lists: [
          { id: 'source', itemIds: ['1'] },
          { id: 'dest', itemIds: ['3', '0'] },
        ],
      }),
    ).toEqual([3, 0]);
    expect(replyValue(prompt('order'), { shape: 'order', lists: [{ id: 'dest', itemIds: ['2', '1', '0'] }] })).toEqual([2, 1, 0]);
    expect(replyValue(prompt('assignCombatDamage'), { shape: 'distribute', amounts: { '0': 3, '1': 2 } })).toEqual({ '0': 3, '1': 2 });
    expect(replyValue(prompt('showInputDialog'), { shape: 'input', value: 'Goblin' })).toBe('Goblin');
  });
});

describe('two-button inputs', () => {
  it('become a yes/no tray with the button labels', () => {
    const p = inputToChoice({
      ...NO_INPUT,
      message: 'Keep this hand?\nYou have 7 cards.',
      ok: { label: 'Keep', enabled: true },
      cancel: { label: 'Mulligan', enabled: true },
    });
    expect(p).toMatchObject({ shape: 'yesNo', title: 'Keep this hand?', yesLabel: 'Keep', noLabel: 'Mulligan' });
    expect(p.id.startsWith('input:')).toBe(true);
  });
});
