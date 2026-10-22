/**
 * Prompts ↔ the choice tray. Bridge prompts (13 methods, 5 shapes: choose, confirm, order,
 * distribute, text) become ChoicePrompts; tray answers become reply values (indices, never client
 * objects). Forge inputs that are only buttons (mulligan, the London mulligan's bottom cards,
 * confirmations) become tray prompts whose answers are button presses and card clicks.
 */
import type { PromptAnswer } from '../model/intents';
import type { CardId, CardView, ChoiceOption, ChoicePrompt, DistributeRecipient, GameView, TargetRef } from '../model/types';
import { bottomPrompt, mulliganPrompt, tossTitle, type MulliganFacts, type TossChooser } from '../state/gameStart';
import type { PromptChoice, PromptMessage } from './protocol';
import { engineText, unlessChoice, unlessEffect } from './engineText';
import { colourOptions, isSurveil, numberList, pickedNumber, rangeOfNumberPrompt, surveilWords } from './trayWords';
import { londonLeft, type InputState } from './session';
import { t } from '../i18n';
import { cardName, nameOfCard } from '../model/selectors';

/** View-model id of a wire prompt. */
export const promptViewId = (id: number) => `prompt:${id}`;
/** Ids of tray prompts built from a Forge input: `input:<kind>:<key>`. */
export const INPUT_PROMPT_PREFIX = 'input:';
export type InputPromptKind = 'mulligan' | 'bottom' | 'buttons' | 'ok' | 'cancel' | 'select';
/** Cards or players to pick from a list (library searches, who starts): `input:select:<option ids>|<message>`. */
export const SELECT_PROMPT_PREFIX = `${INPUT_PROMPT_PREFIX}select:`;
const KEY_PREFIX = { card: 'c', player: 'p', stackItem: 's' } as const;
/** Option id of a card, player or stack item in a select prompt: `c12`, `p1`, `s7`. */
export const targetKey = (t: TargetRef) => `${KEY_PREFIX[t.kind]}${t.id}`;
export const targetOfKey = (key: string): TargetRef | undefined => {
  if (!/^[cps]-?\d+$/.test(key)) return undefined;
  const id = key.slice(1);
  return key[0] === 'c' ? { kind: 'card', id } : key[0] === 'p' ? { kind: 'player', id } : { kind: 'stackItem', id };
};

export function inputPromptKind(id: string): InputPromptKind | undefined {
  if (!id.startsWith(INPUT_PROMPT_PREFIX)) return undefined;
  return id.slice(INPUT_PROMPT_PREFIX.length).split(':')[0] as InputPromptKind;
}

/** Name a card: a text prompt with this many options or more is a name list, fewer a list to pick from. */
const NAME_LIST_MIN = 13;

function option(c: PromptChoice, cards: Record<string, CardView>, players?: readonly string[]): ChoiceOption {
  const o: ChoiceOption = { id: String(c.i), label: engineText(c.label) || c.label };
  const ref = c.ref;
  if (ref?.type === 'card' && cards[String(ref.id)]) o.cardId = String(ref.id);
  if (ref?.type === 'player' && (!players || players.includes(String(ref.id)))) o.playerId = String(ref.id);
  return o;
}

/** A single line longer than this is split at an early "Card name: " into title and instruction. */
const LONG_LINE = 80;

/**
 * An engine message as tray words, never the same line twice: "Cultivate (12)\nSelect up to 2…" → title
 * "Cultivate" (no engine card id), instruction the other lines; one line → the title alone, unless it is a
 * long "Card name: rule text" line (the card names the tray). An engine title is kept as the title.
 */
export function promptWords(message: string | null | undefined, title: string | undefined, fallback: string) {
  const lines = engineText(message ?? '').split('\n').filter(Boolean);
  const head = engineText(title ?? '');
  if (head) return { title: head, instruction: lines.join('\n') === head ? '' : lines.join('\n') };
  if (lines.length > 1) return { title: lines[0]!, instruction: lines.slice(1).join('\n') };
  const line = lines[0] ?? '';
  const colon = line.indexOf(': ');
  if (line.length > LONG_LINE && colon > 0 && colon < 60) return { title: line.slice(0, colon), instruction: line.slice(colon + 2) };
  return { title: line || fallback, instruction: '' };
}

function words(p: { message?: string | null; title?: string }, fallback: string) {
  return promptWords(p.message, p.title, fallback);
}

const cardOf = (ref: { type: string; id: number } | undefined, cards: Record<string, CardView>): CardId | undefined =>
  ref?.type === 'card' && cards[String(ref.id)] ? String(ref.id) : undefined;

const isWhole = (s: string) => /^-?\d+$/.test(s.trim());

/** `players`: the game's player ids; a choice naming another player id keeps its label only. */
export function promptToChoice(p: PromptMessage, cards: Record<string, CardView>, players?: readonly string[]): ChoicePrompt {
  const id = promptViewId(p.id);
  const opt = (c: PromptChoice) => option(c, cards, players);
  const sourceCardId = cardOf('card' in p ? p.card : undefined, cards);
  switch (p.shape) {
    case 'choose': {
      let w = words(p, p.method === 'getAbilityToPlay' ? t('prompt.chooseAbility') : t('prompt.choose'));
      let options = p.choices.filter((c) => !c.disabled).map((c) => opt(c));
      // "You lose 3 life unless you sacrifice…" / "…unless you discard…" (Torment of Hailfire): the costs to pick from.
      const unless = p.method === 'getAbilityToPlay' ? undefined : unlessEffect(options.map((o) => o.label));
      if (unless) {
        options = options.map((o) => ({ ...o, label: unlessChoice(o.label) ?? o.label }));
        if (w.title === t('prompt.choose') && !w.instruction) w = { title: t('prompt.payOr', { unless }), instruction: '' };
      }
      const base = { id, ...w, sourceCardId, confirmLabel: p.max === 0 ? t('common.ok') : t('common.confirm') };
      if (p.method === 'getAbilityToPlay') {
        return { ...base, shape: 'chooseN', options, min: 0, max: 1, abilityMenu: true };
      }
      // "Choose a number" lists numbers: the number field, answered by the matching index.
      if (p.min === 1 && p.max === 1 && options.length > 2 && options.every((o) => isWhole(o.label))) {
        const n = options.map((o) => Number(o.label));
        return { ...base, shape: 'input', kind: 'number', min: Math.min(...n), max: Math.max(...n), defaultValue: options[0]!.label };
      }
      // getInteger's list (oneOrNone, X): the number field too; the engine's "Other…" entry is the field's open end.
      const nums = p.method === 'getChoices' ? numberList(p.choices, p.min, p.max) : undefined;
      if (nums) {
        return { ...base, shape: 'input', kind: 'number', min: nums.min, ...(nums.other === undefined ? { max: nums.last } : {}), defaultValue: String(nums.min) };
      }
      return { ...base, shape: 'chooseN', options: colourOptions(options) ?? options, min: p.min, max: p.max };
    }
    case 'confirm': {
      const w = words(p, t('common.confirm'));
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
      const w = words(p, t('prompt.putInOrder'));
      const base = { id, ...w, sourceCardId, confirmLabel: t('common.confirm'), shape: 'order' as const };
      if (p.piles) {
        // scry: only the looked-at cards, each to the top or the bottom of the library (the scry layout)
        const items = p.choices.map((c) => opt(c));
        const lists = [];
        if (p.toTop !== false) lists.push({ id: 'top', label: t('prompt.topOfLibrary'), hint: t('prompt.leftmostDrawn'), items });
        if (p.toBottom !== false) {
          const one = lists.length === 0;
          lists.push({
            id: 'bottom',
            label: t('prompt.bottomOfLibrary'),
            hint: one ? t('prompt.lastBottom') : t('prompt.rightmostBottom'),
            items: one ? items : [],
          });
        }
        return { ...base, lists };
      }
      if (p.permutation || p.method === 'manipulateCardList') {
        return { ...base, lists: [{ id: 'all', label: t('prompt.order'), hint: t('prompt.firstOnTop'), items: p.choices.map((c) => opt(c)) }] };
      }
      const inDest = p.choices.filter((c) => c.inDest).map((c) => opt(c));
      const out = p.choices.filter((c) => !c.inDest).map((c) => opt(c));
      if (p.method === 'order' && isSurveil(p.message)) {
        const sv = surveilWords(p.choices.length);
        return {
          ...base,
          title: sv.title,
          instruction: sv.instruction,
          lists: [
            { id: 'source', ...sv.source, items: out },
            { id: 'dest', ...sv.dest, items: inDest },
          ],
        };
      }
      if (p.method === 'order' && (p.remainingMax ?? 0) === 0) {
        return { ...base, lists: [{ id: 'dest', label: p.destLabel || t('prompt.order'), hint: t('prompt.firstToLast'), items: [...inDest, ...out] }] };
      }
      return {
        ...base,
        lists: [
          { id: 'source', label: p.method === 'sideboard' ? t('prompt.sideboard') : t('prompt.notChosen'), hint: '', items: out },
          { id: 'dest', label: p.destLabel || t('prompt.chosen'), hint: t('prompt.inThisOrder'), items: inDest },
        ],
      };
    }
    case 'distribute': {
      const label = p.amountLabel || t('prompt.amount');
      const recipients = p.choices.map((c): DistributeRecipient => {
        const r: DistributeRecipient = opt(c);
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
              // an infect attacker: a player's lethal is the poison still to take (Prompt.damageToKill), not their life
              infect: (cards[sourceCardId]?.keywords ?? []).some((k) => k.name.toLowerCase() === 'infect'),
              ...(defender ? { trampleId: String(defender.i) } : {}),
            }
          : undefined;
      const source = sourceCardId ? cards[sourceCardId] : undefined;
      const name = source && cardName(source);
      return {
        id,
        shape: 'distribute',
        title: combat ? t('prompt.assignDamage', { name: name ?? t('prompt.assignCombat') }) : t('prompt.divideTitle', { amount: p.amount, label }),
        instruction: t('prompt.divide', { amount: p.amount, label }),
        sourceCardId,
        confirmLabel: t('prompt.assign'),
        total: p.amount,
        recipients,
        ...(combat ? { combat } : {}),
      };
    }
    case 'text': {
      const w = words(p, t('prompt.answer'));
      const base = { id, ...w, sourceCardId, confirmLabel: t('common.confirm') };
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
      const range = p.numeric ? rangeOfNumberPrompt(p.message) : undefined;
      return {
        ...base,
        shape: 'input',
        kind: p.numeric ? 'number' : 'text',
        ...(range ?? {}),
        ...(p.initial != null ? { defaultValue: p.initial } : {}),
      };
    }
  }
}

/** The tray's answer as the reply value the bridge expects (forge.fork.web.seat.Prompt); undefined = nothing to send. */
export function replyValue(p: PromptMessage, a: PromptAnswer): unknown {
  switch (p.shape) {
    case 'choose':
      if (a.shape === 'chooseN') return a.optionIds.map(Number).filter((n) => Number.isInteger(n));
      if (a.shape === 'input') {
        const nums = p.method === 'getChoices' ? numberList(p.choices, p.min, p.max) : undefined;
        if (nums) {
          const j = pickedNumber(nums, Number(a.value));
          return j === undefined ? undefined : [j];
        }
        const i = p.choices.find((c) => c.label.trim() === a.value.trim())?.i;
        return i === undefined ? undefined : [i];
      }
      return undefined;
    case 'confirm':
      return a.shape === 'yesNo' ? a.yes : undefined;
    case 'order': {
      if (a.shape !== 'order') return undefined;
      const list = (id: string) => (a.lists.find((l) => l.id === id)?.itemIds ?? []).map(Number);
      if (p.piles) return { top: list('top'), bottom: list('bottom') };
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

/**
 * The engine lets you back out of a prompt that asks a number with "none" allowed (`getInteger`: an empty answer is its
 * null; for an X it cancels the spell). Its reply: nothing chosen. Undefined for any other prompt.
 */
export function cancelValue(p: PromptMessage): unknown {
  return p.shape === 'choose' && p.method === 'getChoices' && numberList(p.choices, p.min, p.max) ? [] : undefined;
}

/**
 * Who chooses the starting player, from PlayerControllerHuman.chooseStartingPlayer's message
 * (lblYouHaveWonTheCoinToss / lblYouLostTheLastGame, English): undefined for any other message.
 */
export function tossChooser(message: string): TossChooser | undefined {
  const first = message.trim().split('\n')[0]!.trim();
  if (/, you have won the coin toss\.$/.test(first)) return 'wonToss';
  if (/, you lost the last game\.$/.test(first)) return 'lostLastGame';
  return undefined;
}

/** Cards a London mulligan draws (the maximum hand size). */
const OPENING_HAND = 7;

/**
 * What the keep / mulligan question shows. The engine (LondonMulligan.mulliganDraw) draws 7 and asks which cards go to
 * the bottom BEFORE asking keep or mulligan, so the hand shown has them gone already: 6 after one paid mulligan. The next
 * mulligan draws 7 again and puts one more on the bottom than that (`7 - hand + 1`); the first one costs a card, except in
 * a game of more than 2 players (MulliganService: free first mulligan), which draws 7 and puts none back.
 */
export function mulliganFacts(handSize: number, mulliganed: boolean, players: number): MulliganFacts {
  const free = players > 2;
  return {
    handSize,
    toBottom: 0,
    freeNext: free && !mulliganed,
    draw: OPENING_HAND,
    nextBottom: mulliganed ? Math.max(0, OPENING_HAND - handSize) + 1 : free ? 0 : 1,
  };
}

/** Opening hand: Keep / Mulligan buttons. */
const isMulligan = (i: InputState) => i.ok.label === 'Keep' && i.cancel.label === 'Mulligan';
/** Cards the London mulligan puts on the bottom, as its first message asked; undefined for another input. */
function londonCount(input: InputState): number | undefined {
  const left = londonLeft(input.message);
  return left === undefined ? undefined : (input.london ?? left + input.highlighted.filter((h) => h.type === 'card').length);
}

/**
 * After a free mulligan Forge still asks to put 0 cards on the bottom (InputLondonMulligan): nothing
 * to decide, so the screen answers it without a prompt (playtest 1). Judged on the input's first
 * message (InputState.london): a paid one also reads "Return 0", nothing chosen, as it ends.
 */
export const freeMulliganKeep = (input: InputState): boolean => londonCount(input) === 0;

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
    return mulliganPrompt(mulliganFacts(hand.length, you?.mulligan?.state === 'mulligan', view.players.length), `${INPUT_PROMPT_PREFIX}mulligan:${hand.join(',')}`);
  }
  const n = londonCount(input);
  // n = 0, a free mulligan: no prompt (freeMulliganKeep, answered by the screen).
  if (n !== undefined) {
    const hand = you?.hand ?? [];
    return n === 0
      ? undefined
      : bottomPrompt(hand, n, (id) => nameOfCard(view, id) ?? t('prompt.card'), `${INPUT_PROMPT_PREFIX}bottom:${n}:${hand.join(',')}`);
  }
  const base = { ...promptWords(msg, undefined, t('prompt.yourDecision')), sourceCardId };
  const key = `${input.ok.label}|${input.cancel.label}|${msg}`;
  const toss = tossChooser(msg);
  const opponent = view.players.find((p) => !p.isYou && !p.hasLost);
  if (toss && opponent && input.ok.enabled && input.cancel.enabled) {
    // Two players: Play (OK) or Draw (Cancel), worded as who plays first.
    return {
      ...base,
      title: tossTitle(toss),
      instruction: '',
      id: `${INPUT_PROMPT_PREFIX}buttons:${key}`,
      shape: 'yesNo',
      confirmLabel: t('prompt.playFirst'),
      yesLabel: t('prompt.playFirst'),
      noLabel: t('prompt.letStart', { player: `{player:${opponent.id}}` }),
    };
  }
  if (input.ok.enabled && input.cancel.enabled) {
    return {
      ...base,
      id: `${INPUT_PROMPT_PREFIX}buttons:${key}`,
      shape: 'yesNo',
      confirmLabel: input.ok.label || t('common.ok'),
      yesLabel: input.ok.label || t('common.ok'),
      noLabel: input.cancel.label || t('common.cancel'),
    };
  }
  if (input.ok.enabled || input.cancel.enabled) {
    const ok = input.ok.enabled;
    const label = (ok ? input.ok.label : input.cancel.label) || t('common.ok');
    return { ...base, id: `${INPUT_PROMPT_PREFIX}${ok ? 'ok' : 'cancel'}:${key}`, shape: 'chooseN', options: [], min: 0, max: 0, confirmLabel: label };
  }
  return undefined;
}
