import { describe, expect, it } from 'vitest';
import type { PromptMessage } from '../../adapter/protocol';
import { inputToChoice, promptToChoice } from '../../adapter/prompts';
import { NO_INPUT, type InputState } from '../../adapter/session';
import type { ChooseNPrompt, YesNoPrompt } from '../../model/types';
import { guardHint, guardHintFromFilter, initialDraft, keyAction, toggleOption, trayConfirm } from './trayLogic';

/**
 * U8 (Space-default safety): Space never sends an answer that gives something up. Which answer does is engine data:
 * the bridge's `giveUp` on a yes/no, an empty answer to an optional pick. Never the prompt's words.
 */

const key = (k: string) => ({ key: k, alt: false, inInput: false });
const view = { players: [{ id: '0', isYou: true, hand: [] }], cards: {} } as never;

/** The measured case: InputConfirm "Cancel Search? Up to 1 more card(s) can be selected.", Yes the engine's default. */
const cancelSearch: InputState = {
  ...NO_INPUT,
  ownerId: 0,
  message: 'Cancel Search? Up to 1 more card(s) can be selected.',
  ok: { label: 'Yes', enabled: true },
  cancel: { label: 'No', enabled: true },
  info: { kind: 'confirm', giveUp: 'yes' },
};

const search = (over: Partial<ChooseNPrompt> = {}): ChooseNPrompt => ({
  id: 'prompt:7',
  shape: 'chooseN',
  title: 'Select a card from your library',
  instruction: '',
  confirmLabel: 'Confirm',
  min: 0,
  max: 1,
  options: [
    { id: '0', label: 'Forest' },
    { id: '1', label: 'Island' },
  ],
  ...over,
});

describe('yes / no whose default gives something up', () => {
  it('"Cancel Search?": Space does nothing; Y cancels, N keeps searching', () => {
    const p = inputToChoice(cancelSearch, view) as YesNoPrompt;
    expect(p).toMatchObject({ shape: 'yesNo', giveUp: 'yes' });
    const d = initialDraft(p);
    expect(keyAction(p, d, [], key(' '))).toEqual({ kind: 'none' });
    expect(trayConfirm(p, d).guard).toEqual({ key: 'y', label: 'Y' });
    expect(keyAction(p, d, [], key('y'))).toEqual({ kind: 'answer', answer: { shape: 'yesNo', yes: true } });
    expect(keyAction(p, d, [], key('n'))).toEqual({ kind: 'answer', answer: { shape: 'yesNo', yes: false } });
  });

  it('the same words without the engine flag stay a plain question: classified by data, not text', () => {
    const p = inputToChoice({ ...cancelSearch, info: { kind: 'confirm' } }, view) as YesNoPrompt;
    expect(p.giveUp).toBeUndefined();
    expect(keyAction(p, initialDraft(p), [], key(' '))).toEqual({ kind: 'answer', answer: { shape: 'yesNo', yes: true } });
  });

  it('a bridge confirm prompt carries its giveUp too', () => {
    const msg: PromptMessage = { t: 'prompt', id: 3, method: 'confirm', shape: 'confirm', message: 'Cancel Choose?', yes: 'Yes', no: 'No', default: true, giveUp: 'yes' };
    const p = promptToChoice(msg, {}) as YesNoPrompt;
    expect(p.giveUp).toBe('yes');
    expect(keyAction(p, initialDraft(p), [], key(' '))).toEqual({ kind: 'none' });
  });

  it('Space still answers a default that gives nothing up', () => {
    const p: YesNoPrompt = { id: 'y', shape: 'yesNo', title: 'Use the ability?', instruction: '', confirmLabel: 'Yes', yesLabel: 'Yes', noLabel: 'No', giveUp: 'no' };
    expect(trayConfirm(p, initialDraft(p)).guard).toBeUndefined();
    expect(keyAction(p, initialDraft(p), [], key(' '))).toEqual({ kind: 'answer', answer: { shape: 'yesNo', yes: true } });
  });
});

describe('choose N: choosing none of an optional pick declines it', () => {
  it('the search tray: Space does nothing with nothing chosen; N chooses none; Space confirms a pick', () => {
    const p = search();
    const d = initialDraft(p);
    expect(trayConfirm(p, d)).toMatchObject({ enabled: true, guard: { key: 'n', label: 'N' } });
    expect(keyAction(p, d, p.options, key(' '))).toEqual({ kind: 'none' });
    expect(keyAction(p, d, p.options, key('n'))).toEqual({ kind: 'answer', answer: { shape: 'chooseN', optionIds: [] } });
    const one = toggleOption(p, d, '0');
    expect(trayConfirm(p, one).guard).toBeUndefined();
    expect(keyAction(p, one, p.options, key(' '))).toEqual({ kind: 'answer', answer: { shape: 'chooseN', optionIds: ['0'] } });
    // N only chooses none: with a pick made it does nothing.
    expect(keyAction(p, one, p.options, key('n'))).toBeUndefined();
  });

  it('the filter box takes N as text: no key acts there, and the hint says to leave it first (Esc)', () => {
    const p = search();
    const d = initialDraft(p);
    const typing = { key: 'n', alt: false, inInput: true };
    expect(keyAction(p, d, p.options, typing)).toBeUndefined();
    expect(keyAction(p, d, p.options, { ...typing, key: 'Escape' })).toBeUndefined();
    const guard = trayConfirm(p, d).guard!;
    expect(guardHint(guard)).toBe('Space won’t send this: press N');
    expect(guardHintFromFilter(guard)).toBe('Space won’t send this: Esc leaves the filter, then press N');
  });

  it('a reveal (nothing to pick) and a mandatory pick keep Space', () => {
    const reveal = search({ max: 0, options: [] });
    expect(keyAction(reveal, initialDraft(reveal), [], key(' '))).toEqual({ kind: 'answer', answer: { shape: 'chooseN', optionIds: [] } });
    const mandatory = search({ min: 1 });
    expect(trayConfirm(mandatory, initialDraft(mandatory)).guard).toBeUndefined();
  });

  it('the ability menu: its empty answer cancels the activation, so Space never sends it (Esc does)', () => {
    const p = search({ abilityMenu: true });
    expect(trayConfirm(p, initialDraft(p)).guard).toEqual({ key: 'escape', label: 'Esc' });
    expect(keyAction(p, initialDraft(p), p.options, key('Escape'))).toEqual({ kind: 'answer', answer: { shape: 'chooseN', optionIds: [] } });
  });
});
