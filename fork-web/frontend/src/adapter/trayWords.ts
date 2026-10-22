/**
 * Tray words and shapes for engine lists that need more than the engine's own labels (choice tray polish,
 * issue #29): colour lists, surveil and the "pick a number" lists. Kept apart from `prompts.ts`.
 */
import type { ChoiceOption } from '../model/types';
import type { PromptChoice } from './protocol';

/** MagicColor.Color names the engine lists (an enum's toString) with their mana symbol and word. */
const COLOURS: Record<string, { symbol: string; label: string }> = {
  WHITE: { symbol: '{W}', label: 'White' },
  BLUE: { symbol: '{U}', label: 'Blue' },
  BLACK: { symbol: '{B}', label: 'Black' },
  RED: { symbol: '{R}', label: 'Red' },
  GREEN: { symbol: '{G}', label: 'Green' },
  COLORLESS: { symbol: '{C}', label: 'Colorless' },
};

/**
 * A colour list ("WHITE / BLUE / …", Nykthos, Utopia Sprawl) as symbols with normal-case words. Only when every
 * option is a colour name; the option ids (reply indices) do not change. Undefined for any other list.
 */
export function colourOptions(options: ChoiceOption[]): ChoiceOption[] | undefined {
  if (options.length === 0 || !options.every((o) => COLOURS[o.label.trim().toUpperCase()] && !o.cardId && !o.playerId)) return undefined;
  return options.map((o) => {
    const c = COLOURS[o.label.trim().toUpperCase()]!;
    return { ...o, label: c.label, symbol: c.symbol };
  });
}

/** PlayerControllerHuman.arrangeForSurveil's `many(lblSelectCardsToBePutIntoTheGraveyard, …)` (en-US). */
const SURVEIL_MESSAGE = 'Select cards to be put into the graveyard';

export const isSurveil = (message: string | null | undefined): boolean => (message ?? '').trim() === SURVEIL_MESSAGE;

/** The surveil tray: "Surveil N", the cards that stay on top and the ones that go to the graveyard. */
export function surveilWords(count: number) {
  return {
    title: `Surveil ${count}`,
    instruction: 'Click a card to move it to the graveyard. The cards that stay go back on top of your library.',
    source: { label: 'Keep on top', hint: '', moveTo: 'top' },
    dest: { label: 'Graveyard', hint: '', moveTo: 'graveyard' },
  };
}

/**
 * The reply index for a number typed into the field: its own entry, or the "Other…" entry for a number past the list;
 * undefined when the number cannot be answered (below the list, or past it with no "Other…").
 */
export function pickedNumber(list: NumberList, n: number): number | undefined {
  if (!Number.isInteger(n)) return undefined;
  const own = list.index.get(n);
  if (own !== undefined) return own;
  return n > list.last ? list.other : undefined;
}

/** "Enter a number between 0 and 14:" (lblEnterNumberBetweenMinAndMax, en-US), the "Other…" follow-up's range. */
export function rangeOfNumberPrompt(message: string | null | undefined): { min: number; max: number } | undefined {
  const m = /between (-?\d+) and (-?\d+)/.exec(message ?? '');
  return m ? { min: Number(m[1]), max: Number(m[2]) } : undefined;
}

/** A whole-number label of a list ("0", "12"). */
const isWhole = (s: string) => /^-?\d+$/.test(s.trim());

export interface NumberList {
  /** Reply index of each listed number. */
  index: Map<number, number>;
  min: number;
  /** Largest number the list shows (before "Other…"). */
  last: number;
  /** Reply index of the "Other…" entry, which asks for a number outside the list in a second prompt. */
  other?: number;
}

/**
 * `AbstractGuiGame.getInteger`: a list of whole numbers (all of them, or the first ones followed by one "Other…" entry
 * that opens a second numeric prompt), asked with `oneOrNone`: nothing chosen is the engine's cancel. Undefined for any
 * other list.
 */
export function numberList(choices: readonly PromptChoice[], min: number, max: number): NumberList | undefined {
  const live = choices.filter((c) => !c.disabled);
  if (min !== 0 || max !== 1 || live.length < 2) return undefined;
  const last = live[live.length - 1]!;
  const other = !isWhole(last.label) && /^other/i.test(last.label.trim()) ? last : undefined;
  const numbers = other ? live.slice(0, -1) : live;
  if (numbers.length < 2 || !numbers.every((c) => isWhole(c.label))) return undefined;
  const values = numbers.map((c) => Number(c.label));
  return {
    index: new Map(numbers.map((c) => [Number(c.label), c.i])),
    min: Math.min(...values),
    last: Math.max(...values),
    ...(other ? { other: other.i } : {}),
  };
}
