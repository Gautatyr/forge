/**
 * Prompts ↔ the choice tray. Bridge prompts (13 methods, 5 shapes: choose, confirm, order,
 * distribute, text) become ChoicePrompts; tray answers become reply values (indices, never client
 * objects). Forge inputs that are only buttons (mulligan, the London mulligan's bottom cards,
 * confirmations) become tray prompts whose answers are button presses and card clicks.
 */
import type { PromptAnswer } from '../model/intents';
import type { CardId, CardView, ChoiceOption, ChoicePrompt, DistributeRecipient, GameView } from '../model/types';
import { bottomPrompt, mulliganPrompt } from '../state/gameStart';
import type { PromptChoice, PromptMessage } from './protocol';
import type { InputState } from './session';

/** View-model id of a wire prompt. */
export const promptViewId = (id: number) => `prompt:${id}`;
/** Ids of tray prompts built from a Forge input: `input:<kind>:<key>`. */
export const INPUT_PROMPT_PREFIX = 'input:';
export type InputPromptKind = 'mulligan' | 'bottom' | 'buttons' | 'ok' | 'cancel';

export function inputPromptKind(id: string): InputPromptKind | undefined {
  if (!id.startsWith(INPUT_PROMPT_PREFIX)) return undefined;
  return id.slice(INPUT_PROMPT_PREFIX.length).split(':')[0] as InputPromptKind;
}

/** Name a card: a text prompt with this many options or more is a name list, fewer a list to pick from. */
const NAME_LIST_MIN = 13;

function option(c: PromptChoice, cards: Record<string, CardView>): ChoiceOption {
  const o: ChoiceOption = { id: String(c.i), label: c.label };
  const ref = c.ref;
  if (ref?.type === 'card' && cards[String(ref.id)]) o.cardId = String(ref.id);
  if (ref?.type === 'player') o.playerId = String(ref.id);
  return o;
}

/** "Title\nmore" → title "Title", instruction the whole text. */
function words(p: { message?: string | null; title?: string }, fallback: string) {
  const message = (p.message ?? '').trim();
  const title = p.title?.trim() || message.split('\n')[0] || fallback;
  return { title, instruction: message || title };
}

const cardOf = (ref: { type: string; id: number } | undefined, cards: Record<string, CardView>): CardId | undefined =>
  ref?.type === 'card' && cards[String(ref.id)] ? String(ref.id) : undefined;

const isWhole = (s: string) => /^-?\d+$/.test(s.trim());

export function promptToChoice(p: PromptMessage, cards: Record<string, CardView>): ChoicePrompt {
  const id = promptViewId(p.id);
  const sourceCardId = cardOf('card' in p ? p.card : undefined, cards);
  switch (p.shape) {
    case 'choose': {
      const w = words(p, p.method === 'getAbilityToPlay' ? 'Choose an ability' : 'Choose');
      const options = p.choices.filter((c) => !c.disabled).map((c) => option(c, cards));
      const base = { id, ...w, sourceCardId, confirmLabel: p.max === 0 ? 'OK' : 'Confirm' };
      if (p.method === 'getAbilityToPlay') {
        return { ...base, shape: 'chooseN', options, min: 0, max: 1, abilityMenu: true };
      }
      // "Choose a number" lists numbers: the number field, answered by the matching index.
      if (p.min === 1 && p.max === 1 && options.length > 2 && options.every((o) => isWhole(o.label))) {
        const n = options.map((o) => Number(o.label));
        return { ...base, shape: 'input', kind: 'number', min: Math.min(...n), max: Math.max(...n), defaultValue: options[0]!.label };
      }
      return { ...base, shape: 'chooseN', options, min: p.min, max: p.max };
    }
    case 'confirm': {
      const w = words(p, 'Confirm');
      return {
        id,
        ...w,
        sourceCardId,
        cardId: sourceCardId,
        confirmLabel: p.yes,
        shape: 'yesNo',
        yesLabel: p.yes,
        noLabel: p.no,
        defaultAnswer: p.default ? 'yes' : 'no',
      };
    }
    case 'order': {
      const w = words(p, 'Put in order');
      const base = { id, ...w, sourceCardId, confirmLabel: 'Confirm', shape: 'order' as const };
      if (p.permutation || p.method === 'manipulateCardList') {
        return { ...base, lists: [{ id: 'all', label: 'Order', hint: 'First is on top', items: p.choices.map((c) => option(c, cards)) }] };
      }
      const inDest = p.choices.filter((c) => c.inDest).map((c) => option(c, cards));
      const out = p.choices.filter((c) => !c.inDest).map((c) => option(c, cards));
      if (p.method === 'order' && (p.remainingMax ?? 0) === 0) {
        return { ...base, lists: [{ id: 'dest', label: p.destLabel || 'Order', hint: 'First to last', items: [...inDest, ...out] }] };
      }
      return {
        ...base,
        lists: [
          { id: 'source', label: p.method === 'sideboard' ? 'Sideboard' : 'Not chosen', hint: '', items: out },
          { id: 'dest', label: p.destLabel || 'Chosen', hint: 'In this order', items: inDest },
        ],
      };
    }
    case 'distribute': {
      const label = p.amountLabel || 'amount';
      const recipients = p.choices.map((c): DistributeRecipient => {
        const r: DistributeRecipient = option(c, cards);
        if (p.atLeastOne) r.min = 1;
        if (c.lethal !== undefined) r.lethal = c.lethal;
        return r;
      });
      const defender = p.choices.find((c) => c.defender);
      const combat =
        p.method === 'assignCombatDamage' && sourceCardId
          ? {
              attackerId: sourceCardId,
              deathtouch: p.choices.some((c) => c.ref?.type === 'card' && c.lethal === 1),
              ...(defender ? { trampleId: String(defender.i) } : {}),
            }
          : undefined;
      const name = sourceCardId ? cards[sourceCardId]?.name : undefined;
      return {
        id,
        shape: 'distribute',
        title: combat ? `Assign ${name ?? 'combat'} damage` : `Divide ${p.amount} ${label}`,
        instruction: `Divide ${p.amount} ${label} among these.`,
        sourceCardId,
        confirmLabel: 'Assign',
        total: p.amount,
        recipients,
        ...(combat ? { combat } : {}),
      };
    }
    case 'text': {
      const w = words(p, 'Answer');
      const base = { id, ...w, sourceCardId, confirmLabel: 'Confirm' };
      const opts = p.options ?? [];
      if (opts.length >= NAME_LIST_MIN) {
        return {
          ...base,
          shape: 'input',
          kind: 'cardName',
          cardNames: opts.map((name) => ({ name, manaCost: '', typeLine: '' })),
          ...(p.initial ? { defaultValue: p.initial } : {}),
        };
      }
      if (opts.length > 0) {
        return { ...base, shape: 'chooseN', min: 1, max: 1, options: opts.map((label, i) => ({ id: String(i), label })) };
      }
      return {
        ...base,
        shape: 'input',
        kind: p.numeric ? 'number' : 'text',
        ...(p.initial != null ? { defaultValue: p.initial } : {}),
      };
    }
  }
}

/** The tray's answer as the reply value the bridge expects (forge.web.seat.Prompt); undefined = nothing to send. */
export function replyValue(p: PromptMessage, a: PromptAnswer): unknown {
  switch (p.shape) {
    case 'choose':
      if (a.shape === 'chooseN') return a.optionIds.map(Number).filter((n) => Number.isInteger(n));
      if (a.shape === 'input') {
        const i = p.choices.find((c) => c.label.trim() === a.value.trim())?.i;
        return i === undefined ? undefined : [i];
      }
      return undefined;
    case 'confirm':
      return a.shape === 'yesNo' ? a.yes : undefined;
    case 'order': {
      if (a.shape !== 'order') return undefined;
      const list = (id: string) => (a.lists.find((l) => l.id === id)?.itemIds ?? []).map(Number);
      if (p.permutation || p.method === 'manipulateCardList') return list('all');
      if (p.method === 'sideboard') return list('dest');
      return { order: list('dest'), remember: false };
    }
    case 'distribute':
      return a.shape === 'distribute' ? p.choices.map((c) => a.amounts[String(c.i)] ?? 0) : undefined;
    case 'text':
      if (a.shape === 'input') return a.value;
      if (a.shape === 'chooseN') {
        const i = Number(a.optionIds[0]);
        return p.options?.[i];
      }
      return undefined;
  }
}

/** Opening hand: Keep / Mulligan buttons. */
const isMulligan = (i: InputState) => i.ok.label === 'Keep' && i.cancel.label === 'Mulligan';
/** London mulligan: "Return N card(s) to the bottom of your library", OK / Auto. */
const LONDON = /^Return (\d+) card\(s\) to the bottom/;

/**
 * A Forge input that only asks for buttons (and, for the London mulligan, cards of your hand) as a
 * tray prompt. Undefined when the input is not one (priority, payment, targets, combat).
 */
export function inputToChoice(input: InputState, view: Pick<GameView, 'players' | 'cards'>): ChoicePrompt | undefined {
  const you = view.players.find((p) => p.isYou);
  const msg = input.message.trim();
  const sourceCardId = input.cardId !== undefined && view.cards[String(input.cardId)] ? String(input.cardId) : undefined;
  if (isMulligan(input)) {
    const hand = you?.hand ?? [];
    return mulliganPrompt({ handSize: hand.length, toBottom: 0, freeNext: false }, `${INPUT_PROMPT_PREFIX}mulligan:${hand.join(',')}`);
  }
  const london = LONDON.exec(msg);
  if (london) {
    const chosen = input.highlighted.filter((h) => h.type === 'card').length;
    const n = Number(london[1]) + chosen;
    const hand = you?.hand ?? [];
    if (n === 0) {
      // A free mulligan: nothing goes to the bottom; the engine then asks Keep / Mulligan again.
      return {
        id: `${INPUT_PROMPT_PREFIX}ok:keep:${hand.join(',')}`,
        shape: 'chooseN',
        title: `New hand · ${hand.length} cards`,
        instruction: 'Nothing to put on the bottom: this mulligan is free.',
        confirmLabel: 'OK',
        options: [],
        min: 0,
        max: 0,
      };
    }
    return bottomPrompt(hand, n, (id) => view.cards[id]?.name ?? 'Card', `${INPUT_PROMPT_PREFIX}bottom:${n}:${hand.join(',')}`);
  }
  const lines = msg.split('\n');
  const base = {
    title: lines[0] || 'Your decision',
    instruction: msg || 'Your decision',
    sourceCardId,
  };
  const key = `${input.ok.label}|${input.cancel.label}|${msg}`;
  if (input.ok.enabled && input.cancel.enabled) {
    return {
      ...base,
      id: `${INPUT_PROMPT_PREFIX}buttons:${key}`,
      shape: 'yesNo',
      confirmLabel: input.ok.label || 'OK',
      yesLabel: input.ok.label || 'OK',
      noLabel: input.cancel.label || 'Cancel',
    };
  }
  if (input.ok.enabled || input.cancel.enabled) {
    const ok = input.ok.enabled;
    const label = (ok ? input.ok.label : input.cancel.label) || 'OK';
    return { ...base, id: `${INPUT_PROMPT_PREFIX}${ok ? 'ok' : 'cancel'}:${key}`, shape: 'chooseN', options: [], min: 0, max: 0, confirmLabel: label };
  }
  return undefined;
}
