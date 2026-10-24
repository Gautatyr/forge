import { describe, expect, it } from 'vitest';
import type { ChooseNPrompt } from '../../model/types';
import {
  chosenIn,
  dropFromGroup,
  groupOptions,
  initialDraft,
  keyAction,
  listHint,
  moveLabel,
  stepGroup,
  trayConfirm,
} from './trayLogic';

const names: Record<string, string> = { s1: 'Swamp', s2: 'Swamp', s3: 'Swamp', m1: 'Mountain', x1: '' };
const nameOf = (id: string) => names[id];
const search = (over: Partial<ChooseNPrompt> = {}): ChooseNPrompt => ({
  id: 'search',
  shape: 'chooseN',
  title: 'Search your library',
  instruction: '',
  confirmLabel: 'Confirm',
  min: 0,
  max: 2,
  options: [
    { id: 'c1', label: 'Swamp', cardId: 's1' },
    { id: 'c2', label: 'Mountain', cardId: 'm1' },
    { id: 'c3', label: 'Swamp', cardId: 's2' },
    { id: 'c4', label: 'Swamp', cardId: 's3' },
  ],
  ...over,
});

describe('identical cards grouped with a count (playtest 1 #11)', () => {
  it('groups by name, in the order of the first of each, keeping every option id', () => {
    const g = groupOptions(search().options, nameOf);
    expect(g.map((x) => [x.option.label, x.members])).toEqual([
      ['Swamp', ['c1', 'c3', 'c4']],
      ['Mountain', ['c2']],
    ]);
  });

  it('keeps one entry per option unless every option is a card with a known name', () => {
    expect(groupOptions([{ id: 'a', label: 'Red' }, { id: 'b', label: 'Red' }], nameOf)).toHaveLength(2);
    expect(groupOptions([{ id: 'a', label: 'x', cardId: 's1' }, { id: 'b', label: 'x', cardId: 'x1' }], nameOf)).toHaveLength(2);
    expect(groupOptions([], nameOf)).toEqual([]);
  });

  it('a click chooses one more of the group, up to the prompt maximum, and the answer lists the chosen options', () => {
    const p = search({ max: 3 });
    const members = ['c1', 'c3', 'c4'];
    let d = initialDraft(p);
    d = stepGroup(p, d, members);
    d = stepGroup(p, d, members);
    expect(d.selected).toEqual(['c1', 'c3']);
    expect(chosenIn(d, members)).toBe(2);
    expect(trayConfirm(p, d)).toMatchObject({ enabled: true, answer: { shape: 'chooseN', optionIds: ['c1', 'c3'] } });
    // all three, then one more click takes one away
    d = stepGroup(p, d, members);
    expect(d.selected).toEqual(['c1', 'c3', 'c4']);
    expect(stepGroup(p, d, members).selected).toEqual(['c1', 'c3']);
  });

  it('at the maximum a click on a group that has chosen cards takes one away; one that has none does nothing', () => {
    const p = search({ max: 2 });
    const swamps = ['c1', 'c3', 'c4'];
    let d = initialDraft(p);
    d = stepGroup(p, stepGroup(p, d, swamps), swamps);
    expect(stepGroup(p, d, swamps).selected).toEqual(['c1']);
    expect(stepGroup(p, d, ['c2']).selected).toEqual(['c1', 'c3']);
  });

  it('a prompt that wants one card toggles its group', () => {
    const p = search({ max: 1, min: 1 });
    const swamps = ['c1', 'c3', 'c4'];
    const on = stepGroup(p, initialDraft(p), swamps);
    expect(on.selected).toEqual(['c1']);
    expect(stepGroup(p, on, swamps).selected).toEqual([]);
  });

  it('the minus button drops the last chosen one', () => {
    const d = { ...initialDraft(search()), selected: ['c1', 'c2', 'c3'] };
    expect(dropFromGroup(d, ['c1', 'c3', 'c4']).selected).toEqual(['c1', 'c2']);
    expect(dropFromGroup(initialDraft(search()), ['c1']).selected).toEqual([]);
  });

  it('a digit key steps the group it shows', () => {
    const p = search({ max: 3 });
    const g = groupOptions(p.options, nameOf);
    const members = new Map(g.map((x) => [x.option.id, x.members]));
    const k = (key: string, d = initialDraft(p)) => keyAction(p, d, g.map((x) => x.option), { key, alt: false, inInput: false }, members);
    const one = k('1');
    expect(one).toMatchObject({ kind: 'draft', draft: { selected: ['c1'] } });
    const two = one?.kind === 'draft' ? k('1', one.draft) : undefined;
    expect(two).toMatchObject({ kind: 'draft', draft: { selected: ['c1', 'c3'] } });
    expect(k('2')).toMatchObject({ kind: 'draft', draft: { selected: ['c2'] } });
  });
});

describe('two-list move buttons (pass 2 #1)', () => {
  it('names the destination: its own word, else its label in lower case', () => {
    expect(moveLabel({ label: 'Graveyard', moveTo: 'graveyard' })).toBe('To graveyard');
    expect(moveLabel({ label: 'Keep on top', moveTo: 'top' })).toBe('To top');
    expect(moveLabel({ label: 'Not chosen' })).toBe('To not chosen');
    expect(moveLabel({ label: 'Sideboard' })).toBe('To sideboard');
  });
});

describe('listHint (the compact list runs top to bottom)', () => {
  it('rewords the left-to-right pile hints, leaves the others', () => {
    expect(listHint('Leftmost is drawn first')).toBe('The top card is drawn first');
    expect(listHint('Rightmost goes to the very bottom')).toBe('Last goes to the very bottom');
    expect(listHint('Order does not matter')).toBe('Order does not matter');
    expect(listHint('')).toBe('');
  });
});
