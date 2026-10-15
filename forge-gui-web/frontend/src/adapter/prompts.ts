/**
 * Prompts ↔ the choice tray. Wire prompts (13 methods, 5 shapes) become ChoicePrompts; tray
 * answers become reply values (indices, never client-side objects). Forge inputs that are just two
 * buttons (mulligan, pay mana, confirm) become a yes/no tray answered with selectButtonOk/Cancel.
 */
import type { PromptAnswer } from '../model/intents';
import type { CardView, ChoiceOption, ChoicePrompt } from '../model/types';
import type { PromptChoice, PromptMessage, ReplyValue } from './protocol';
import type { InputState } from './session';

/** View-model id of a wire prompt, and of the synthetic input prompt. */
export const promptViewId = (id: number) => `prompt:${id}`;
export const INPUT_PROMPT_PREFIX = 'input:';

const SINGLE = new Set(['chooseSingleEntityForEffect', 'getAbilityToPlay', 'showOptionDialog']);
const YES_NO = new Set(['confirm', 'showConfirmDialog']);
const ORDER = new Set(['order', 'manipulateCardList', 'sideboard']);
const DISTRIBUTE = new Set(['assignCombatDamage', 'assignGenericAmount']);

function option(c: PromptChoice, cards: Record<string, CardView>): ChoiceOption {
  const cardId = c.ref?.type === 'card' && cards[String(c.ref.id)] ? String(c.ref.id) : undefined;
  return cardId ? { id: String(c.i), label: c.label, cardId } : { id: String(c.i), label: c.label };
}

export function promptToChoice(p: PromptMessage, cards: Record<string, CardView>): ChoicePrompt {
  const base = {
    id: promptViewId(p.id),
    title: p.title,
    instruction: p.message ?? p.title,
    sourceCardId: p.card !== undefined && cards[String(p.card)] ? String(p.card) : undefined,
    confirmLabel: 'Confirm',
  };
  const options = p.choices.map((c) => option(c, cards));
  if (YES_NO.has(p.method)) {
    return { ...base, shape: 'yesNo', yesLabel: p.choices[0]?.label ?? 'Yes', noLabel: p.choices[1]?.label ?? 'No' };
  }
  if (ORDER.has(p.method)) {
    if (p.dest) {
      return {
        ...base,
        shape: 'order',
        lists: [
          { id: 'source', label: 'Available', hint: 'Not chosen', items: options },
          { id: 'dest', label: 'Chosen', hint: 'In this order', items: p.dest.map((c) => option(c, cards)) },
        ],
      };
    }
    return { ...base, shape: 'order', lists: [{ id: 'dest', label: 'Order', hint: 'First to last', items: options }] };
  }
  if (DISTRIBUTE.has(p.method)) {
    return { ...base, shape: 'distribute', total: p.amount ?? 0, recipients: options };
  }
  if (p.method === 'showInputDialog') {
    return { ...base, shape: 'input', kind: 'text' };
  }
  const max = p.max ?? (SINGLE.has(p.method) ? 1 : options.length);
  const min = p.min ?? (SINGLE.has(p.method) ? 1 : 0);
  return { ...base, shape: 'chooseN', options, min, max };
}

/** The tray's answer as the reply value the server expects for this method (see protocol.ts). */
export function replyValue(p: PromptMessage, a: PromptAnswer): ReplyValue | undefined {
  switch (a.shape) {
    case 'chooseN': {
      const idx = a.optionIds.map(Number).filter((n) => Number.isInteger(n));
      return SINGLE.has(p.method) ? (idx[0] ?? -1) : idx;
    }
    case 'yesNo':
      return a.yes;
    case 'order': {
      const dest = a.lists.find((l) => l.id === 'dest') ?? a.lists[0];
      return (dest?.itemIds ?? []).map(Number);
    }
    case 'distribute':
      return Object.fromEntries(Object.entries(a.amounts).map(([k, v]) => [k, v]));
    case 'input':
      return a.value;
  }
}

export function inputToChoice(input: InputState): ChoicePrompt {
  const lines = input.message.trim().split('\n');
  return {
    id: `${INPUT_PROMPT_PREFIX}${input.ok.label}|${input.cancel.label}|${input.message}`,
    title: lines[0] || 'Your decision',
    instruction: input.message.trim(),
    sourceCardId: input.cardId !== undefined ? String(input.cardId) : undefined,
    confirmLabel: 'Confirm',
    shape: 'yesNo',
    yesLabel: input.ok.label || 'OK',
    noLabel: input.cancel.label || 'Cancel',
  };
}
