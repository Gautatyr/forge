import { describe, expect, it } from 'vitest';
import { GameBuilder } from '../../mock/builder';
import type { ChooseNPrompt, OrderPrompt, YesNoPrompt } from '../../model/types';
import {
  anchorMenu,
  counterText,
  inPlaceRefs,
  initialDraft,
  keyAction,
  moveItem,
  revealScrollTop,
  toggleOption,
  trayConfirm,
  visibleOptions,
} from './trayLogic';

const chooseN = (over: Partial<ChooseNPrompt> = {}): ChooseNPrompt => ({
  id: 'p1',
  shape: 'chooseN',
  title: 'Choose up to 2 basic land cards',
  instruction: '',
  confirmLabel: 'Confirm',
  min: 0,
  max: 2,
  options: [
    { id: 'a', label: 'Forest' },
    { id: 'b', label: 'Plains' },
    { id: 'c', label: 'Island' },
  ],
  ...over,
});

const yesNo = (over: Partial<YesNoPrompt> = {}): YesNoPrompt => ({
  id: 'y1',
  shape: 'yesNo',
  title: "Use Sigil of the Empty Throne's ability?",
  instruction: '',
  confirmLabel: 'Yes',
  yesLabel: 'Yes',
  noLabel: 'No',
  ...over,
});

const order: OrderPrompt = {
  id: 'o1',
  shape: 'order',
  title: 'Order your triggers',
  instruction: '',
  confirmLabel: 'Put on the stack',
  lists: [{ id: 'stack', label: 'Resolves first', hint: '', items: ['x', 'y', 'z'].map((id) => ({ id, label: id })) }],
};

const key = (k: string, mods: { alt?: boolean; inInput?: boolean } = {}) => ({ key: k, alt: false, inInput: false, ...mods });

describe('choose N: counter and confirm (§2.2)', () => {
  it('counts "up to" choices and labels the confirm with the count', () => {
    const p = chooseN();
    const d = toggleOption(p, initialDraft(p), 'a');
    expect(counterText(p, d.selected.length)).toBe('1 chosen · up to 2');
    const c = trayConfirm(p, d);
    expect(c.enabled).toBe(true);
    expect(c.label).toBe('Confirm (1)');
    expect(c.answer).toEqual({ shape: 'chooseN', optionIds: ['a'] });
  });

  it('says "Choose exactly N" when the number is fixed, and why confirm is disabled', () => {
    const p = chooseN({ min: 2, max: 2 });
    expect(counterText(p, 0)).toBe('Choose exactly 2');
    const d = toggleOption(p, initialDraft(p), 'a');
    const c = trayConfirm(p, d);
    expect(c.enabled).toBe(false);
    expect(c.label).toBe('Choose 1 more');
    expect(c.answer).toBeUndefined();
  });

  it('shows no counter and a plain confirm for a quiet prompt (who plays first)', () => {
    const p = { ...chooseN({ min: 1, max: 1 }), quiet: true };
    expect(counterText(p, 0)).toBe('');
    expect(trayConfirm(p, initialDraft(p))).toMatchObject({ enabled: false, label: 'Confirm' });
    expect(trayConfirm(p, toggleOption(p, initialDraft(p), 'a'))).toMatchObject({ enabled: true, label: 'Confirm' });
  });

  it('shows a range when min and max differ and min > 0', () => {
    expect(counterText(chooseN({ min: 1, max: 3 }), 2)).toBe('2 chosen · 1–3');
  });

  it('toggles, replaces the choice when max is 1, and never exceeds max', () => {
    const one = chooseN({ min: 1, max: 1 });
    let d = toggleOption(one, initialDraft(one), 'a');
    d = toggleOption(one, d, 'b');
    expect(d.selected).toEqual(['b']);
    d = toggleOption(one, d, 'b');
    expect(d.selected).toEqual([]);

    const two = chooseN();
    let e = toggleOption(two, initialDraft(two), 'a');
    e = toggleOption(two, e, 'b');
    e = toggleOption(two, e, 'c');
    expect(e.selected).toEqual(['a', 'b']);
  });

  it('a reveal (max 0) confirms with the prompt label and an empty answer', () => {
    const p = chooseN({ max: 0, confirmLabel: 'OK' });
    const c = trayConfirm(p, initialDraft(p));
    expect(c).toEqual({ enabled: true, label: 'OK', answer: { shape: 'chooseN', optionIds: [] } });
  });
});

describe('choose N: filter (§2.2, lists over 12)', () => {
  it('matches name or type line, case-insensitive, sorted by name', () => {
    const opts = [
      { id: '1', label: 'Temple Garden', cardId: 'tg' },
      { id: '2', label: 'Forest', cardId: 'f' },
      { id: '3', label: 'Command Tower', cardId: 'ct' },
    ];
    const types: Record<string, string> = { tg: 'Land — Forest Plains', f: 'Basic Land — Forest', ct: 'Land' };
    const typeOf = (id: string) => types[id];
    expect(visibleOptions(opts, '', typeOf).map((o) => o.id)).toEqual(['1', '2', '3']);
    expect(visibleOptions(opts, 'forest', typeOf).map((o) => o.label)).toEqual(['Forest', 'Temple Garden']);
    expect(visibleOptions(opts, '  TOWER ', typeOf).map((o) => o.label)).toEqual(['Command Tower']);
  });
});

describe('yes / no (§2.2)', () => {
  it("starts on the engine's default so Space and the main button answer it", () => {
    expect(trayConfirm(yesNo(), initialDraft(yesNo())).answer).toEqual({ shape: 'yesNo', yes: true });
    const p = yesNo({ defaultAnswer: 'no' });
    expect(trayConfirm(p, initialDraft(p)).answer).toEqual({ shape: 'yesNo', yes: false });
  });

  it('Y and N answer at once; Space gives the default', () => {
    const p = yesNo({ defaultAnswer: 'no' });
    const d = initialDraft(p);
    expect(keyAction(p, d, [], key('y'))).toEqual({ kind: 'answer', answer: { shape: 'yesNo', yes: true } });
    expect(keyAction(p, d, [], key('N'))).toEqual({ kind: 'answer', answer: { shape: 'yesNo', yes: false } });
    expect(keyAction(p, d, [], key(' '))).toEqual({ kind: 'answer', answer: { shape: 'yesNo', yes: false } });
  });
});

describe('keys', () => {
  it('1–9 toggle the visible options; V folds the tray; Space confirms only when enabled', () => {
    const p = chooseN({ min: 1, max: 1 });
    const d = initialDraft(p);
    const visible = [p.options[2]!, p.options[0]!];
    const r = keyAction(p, d, visible, key('1'));
    expect(r).toEqual({ kind: 'draft', draft: { ...d, selected: ['c'] } });
    expect(keyAction(p, d, visible, key('3'))).toBeUndefined();
    expect(keyAction(p, d, visible, key('v'))).toEqual({ kind: 'peek' });
    expect(keyAction(p, d, visible, key(' '))).toBeUndefined();
    const chosen = toggleOption(p, d, 'a');
    expect(keyAction(p, chosen, visible, key(' '))).toEqual({ kind: 'answer', answer: { shape: 'chooseN', optionIds: ['a'] } });
  });

  it('ignores typing in the filter box', () => {
    const p = chooseN();
    expect(keyAction(p, initialDraft(p), p.options, key('1', { inInput: true }))).toBeUndefined();
    expect(keyAction(p, initialDraft(p), p.options, key(' ', { inInput: true }))).toBeUndefined();
  });

  it('ability menu: 1–9 pick a row at once, Esc cancels with an empty answer', () => {
    const p = chooseN({ abilityMenu: true, min: 1, max: 1 });
    const d = initialDraft(p);
    expect(keyAction(p, d, p.options, key('2'))).toEqual({ kind: 'answer', answer: { shape: 'chooseN', optionIds: ['b'] } });
    expect(keyAction(p, d, p.options, key('Escape'))).toEqual({ kind: 'answer', answer: { shape: 'chooseN', optionIds: [] } });
    expect(keyAction(p, d, p.options, key('v'))).toBeUndefined();
  });
});

describe('order (§2.2)', () => {
  it('moves an item up or down within its list, clamped at the ends', () => {
    const d = initialDraft(order);
    expect(moveItem(d, 'stack', 2, -1).lists.stack).toEqual(['x', 'z', 'y']);
    expect(moveItem(d, 'stack', 0, -1)).toBe(d);
    expect(moveItem(d, 'stack', 2, 1)).toBe(d);
  });
});

describe('choosing in place (§2.2)', () => {
  const table = () => {
    const b = new GameBuilder('t', 'commander');
    b.player('you', 'Hugo', 40, { isAi: false }).player('mira', 'Mira', 40);
    const elf = b.card('Llanowar Elves', 'you', 'battlefield');
    const bolt = b.card('Lightning Bolt', 'you', 'hand');
    const lib = b.card('Forest', 'you', 'library');
    const theirs = b.card('Lightning Bolt', 'mira', 'hand');
    return { g: b.done(), elf, bolt, lib, theirs };
  };

  it('picks in place when every option is a battlefield card, your hand card or a player', () => {
    const { g, elf, bolt } = table();
    const p = chooseN({
      options: [
        { id: '1', label: 'Elves', cardId: elf },
        { id: '2', label: 'Bolt', cardId: bolt },
        { id: '3', label: 'Mira', playerId: 'mira' },
      ],
    });
    const refs = inPlaceRefs(g, p)!;
    expect(refs.cards.get(elf)).toBe('1');
    expect(refs.cards.get(bolt)).toBe('2');
    expect(refs.players.get('mira')).toBe('3');
  });

  it('uses the tray when any option is elsewhere, for reveals and for the ability menu', () => {
    const { g, elf, lib, theirs } = table();
    expect(inPlaceRefs(g, chooseN({ options: [{ id: '1', label: 'a', cardId: elf }, { id: '2', label: 'b', cardId: lib }] }))).toBeUndefined();
    expect(inPlaceRefs(g, chooseN({ options: [{ id: '1', label: 'a', cardId: theirs }] }))).toBeUndefined();
    expect(inPlaceRefs(g, chooseN({ options: [{ id: '1', label: 'text' }] }))).toBeUndefined();
    expect(inPlaceRefs(g, chooseN({ max: 0, options: [{ id: '1', label: 'a', cardId: elf }] }))).toBeUndefined();
    expect(inPlaceRefs(g, chooseN({ abilityMenu: true, options: [{ id: '1', label: 'a', cardId: elf }] }))).toBeUndefined();
  });
});

describe('ability menu anchoring (P2)', () => {
  const view = { w: 1920, h: 1080 };
  const menu = { w: 300, h: 120 };

  it('sits right of the card, top-aligned', () => {
    expect(anchorMenu({ left: 100, top: 400, right: 260, bottom: 620 }, menu, view, 8)).toEqual({ left: 268, top: 400 });
  });

  it('flips left when the right side has no room, and stays on screen vertically', () => {
    expect(anchorMenu({ left: 1700, top: 1000, right: 1860, bottom: 1070 }, menu, view, 8)).toEqual({ left: 1392, top: 952 });
  });

  it('falls back above the card when neither side has room', () => {
    const narrow = { w: 500, h: 1080 };
    expect(anchorMenu({ left: 100, top: 800, right: 400, bottom: 1000 }, menu, narrow, 8)).toEqual({ left: 100, top: 672 });
  });
});

describe('revealScrollTop', () => {
  const view = { top: 346, height: 177, scrollTop: 0 };
  it('keeps the scroll when the row is fully visible', () => {
    expect(revealScrollTop(view, { top: 420, bottom: 460 }, 4)).toBe(0);
  });
  it('scrolls down just enough to show a row below the view, plus the margin', () => {
    // Row 4 at 1366x768 before the fix: bottom 546 vs view bottom 523.
    expect(revealScrollTop(view, { top: 506, bottom: 546 }, 4)).toBe(27);
  });
  it('scrolls up just enough to show a row above the view, plus the margin', () => {
    expect(revealScrollTop({ ...view, scrollTop: 30 }, { top: 340, bottom: 380 }, 4)).toBe(20);
  });
  it('never scrolls above 0', () => {
    expect(revealScrollTop({ ...view, scrollTop: 2 }, { top: 340, bottom: 380 }, 4)).toBe(0);
  });
  it('shows the top of a row taller than the view', () => {
    expect(revealScrollTop(view, { top: 400, bottom: 700 }, 0)).toBe(54);
  });
});
