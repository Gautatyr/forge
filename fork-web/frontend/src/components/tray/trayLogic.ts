/**
 * Pure rules of the choice tray and the ability menu (design pass 4 §2.2, P2):
 * drafts, the confirm button, counters, filtering, keys, choosing in place and
 * menu placement. Components stay thin around these.
 */
import type { PromptAnswer } from '../../model/intents';
import type { CardId, ChoiceOption, ChoicePrompt, ChooseNPrompt, GameView, PlayerId, YesNoPrompt } from '../../model/types';
import { answerFromDraft, draftFor } from '../../state/primaryAction';
import type { ChoiceDraft } from '../../state/ui';
import { distributeConfirm, inputConfirm, inputStart, startAmounts } from './numberLogic';
import { t } from '../../i18n';

/** Lists longer than this get a filter box. */
export const FILTER_FROM = 12;

export const isReveal = (p: ChoicePrompt): boolean => p.shape === 'chooseN' && p.max === 0;
export const isAbilityMenu = (p: ChoicePrompt): boolean => p.shape === 'chooseN' && !!p.abilityMenu;

/** A fresh draft; a yes/no starts on the engine's default so Space and the main button answer it. */
export function initialDraft(p: ChoicePrompt): ChoiceDraft {
  const d = draftFor(p, undefined);
  if (p.shape === 'yesNo') return { ...d, selected: [p.defaultAnswer ?? 'yes'] };
  if (p.shape === 'distribute') return { ...d, amounts: startAmounts(p) };
  if (p.shape === 'input') return { ...d, selected: [inputStart(p)] };
  return d;
}

/** The draft for this prompt: the stored one when it belongs to it, else a fresh one. */
export function trayDraft(p: ChoicePrompt, d: ChoiceDraft | undefined): ChoiceDraft {
  return d && d.promptId === p.id ? d : initialDraft(p);
}

export function toggleOption(p: ChooseNPrompt, d: ChoiceDraft, id: string): ChoiceDraft {
  const has = d.selected.includes(id);
  if (has) return { ...d, selected: d.selected.filter((x) => x !== id) };
  if (p.max === 1) return { ...d, selected: [id] };
  if (d.selected.length >= p.max) return d;
  return { ...d, selected: [...d.selected, id] };
}

/** Identical cards offered together (17 Swamps of a library search): the first one stands for all, `members` are every option id. */
export interface OptionGroup {
  option: ChoiceOption;
  members: string[];
}

/**
 * Card options grouped by card name, in the order of their first member. Only when every option is a card with a known
 * name (a tray of card tiles); any other list stays one option per entry.
 */
export function groupOptions(options: ChoiceOption[], nameOf: (cardId: CardId) => string | undefined): OptionGroup[] {
  const single = options.map((option): OptionGroup => ({ option, members: [option.id] }));
  if (options.length === 0 || !options.every((o) => o.cardId && nameOf(o.cardId))) return single;
  const out: OptionGroup[] = [];
  const byName = new Map<string, OptionGroup>();
  for (const option of options) {
    const name = nameOf(option.cardId!)!;
    const g = byName.get(name);
    if (g) g.members.push(option.id);
    else {
      const n = { option, members: [option.id] };
      byName.set(name, n);
      out.push(n);
    }
  }
  return out;
}

/** How many of a group's cards are chosen. */
export const chosenIn = (d: ChoiceDraft, members: string[]): number => members.filter((id) => d.selected.includes(id)).length;

/** One fewer chosen in the group: the last chosen one goes. */
export function dropFromGroup(d: ChoiceDraft, members: string[]): ChoiceDraft {
  const last = members.filter((id) => d.selected.includes(id)).at(-1);
  return last === undefined ? d : { ...d, selected: d.selected.filter((x) => x !== last) };
}

/**
 * A click (or key) on a group: one more of its cards chosen. When no more can be (all of them, or the prompt's maximum is
 * reached) it takes one away, so a click always does something; a prompt that wants one card toggles the group.
 */
export function stepGroup(p: ChooseNPrompt, d: ChoiceDraft, members: string[]): ChoiceDraft {
  if (p.max === 1 && chosenIn(d, members) > 0) return dropFromGroup(d, members);
  const free = members.find((id) => !d.selected.includes(id));
  if (free !== undefined) {
    const next = toggleOption(p, d, free);
    if (next !== d) return next;
  }
  return dropFromGroup(d, members);
}

/** What a two-list move button says: "To graveyard". */
export const moveLabel = (list: { label: string; moveTo?: string }): string => t('tray.to', { where: list.moveTo ?? list.label.toLowerCase() });

export function counterText(p: ChooseNPrompt, n: number): string {
  if (p.quiet) return '';
  if (p.progress) return t('tray.progress', { n, max: p.max });
  if (p.min === p.max) return t('tray.exactly', { count: p.max });
  if (p.min === 0) return t('tray.upTo', { n, max: p.max });
  return t('tray.between', { n, min: p.min, max: p.max });
}

export interface Confirm {
  enabled: boolean;
  /** Button text; when disabled it says why ("Choose 1 more"). */
  label: string;
  answer?: PromptAnswer;
}

/** The tray's confirm. Same answer and enablement as the main button (`answerFromDraft`). */
export function trayConfirm(p: ChoicePrompt, d: ChoiceDraft): Confirm {
  if (p.shape === 'distribute') return distributeConfirm(p, d.amounts ?? startAmounts(p));
  if (p.shape === 'input') return inputConfirm(p, d.selected[0] ?? inputStart(p));
  const answer = answerFromDraft(p, d);
  if (p.shape === 'chooseN' && !isReveal(p)) {
    const n = d.selected.length;
    if (n < p.min) return { enabled: false, label: p.quiet ? p.confirmLabel : t('tray.chooseMore', { count: p.min - n }) };
    return { enabled: answer !== undefined, label: p.progress || p.quiet ? p.confirmLabel : `${p.confirmLabel} (${n})`, answer };
  }
  return { enabled: answer !== undefined, label: p.confirmLabel, answer };
}

/** Options shown for a filter query: all in engine order, or the matches by name or type line, sorted by name. */
export function visibleOptions(
  options: ChoiceOption[],
  query: string,
  typeLineOf: (cardId: CardId) => string | undefined,
): ChoiceOption[] {
  const q = query.trim().toLowerCase();
  if (!q) return options;
  return options
    .filter((o) => o.label.toLowerCase().includes(q) || (o.cardId ? typeLineOf(o.cardId) ?? '' : '').toLowerCase().includes(q))
    .sort((a, b) => a.label.localeCompare(b.label));
}

/** Move the item at `index` of a list by `by` places; the same draft when it would leave the list. */
export function moveItem(d: ChoiceDraft, listId: string, index: number, by: number): ChoiceDraft {
  const list = [...(d.lists[listId] ?? [])];
  const j = index + by;
  if (index < 0 || index >= list.length || j < 0 || j >= list.length) return d;
  [list[index], list[j]] = [list[j]!, list[index]!];
  return { ...d, lists: { ...d.lists, [listId]: list } };
}

/**
 * The scrollTop that brings a row (viewport coordinates) into a scrolled view with the
 * least movement, `margin` px clear of the edges; a row taller than the view shows its top.
 */
export function revealScrollTop(
  view: { top: number; height: number; scrollTop: number },
  row: { top: number; bottom: number },
  margin: number,
): number {
  const above = row.top - margin - view.top;
  const below = row.bottom + margin - (view.top + view.height);
  if (above < 0) return Math.max(0, view.scrollTop + above);
  if (below > 0) return view.scrollTop + Math.min(below, above);
  return view.scrollTop;
}

/** Move an item to the end of another list (two-list order). */
export function moveBetween(d: ChoiceDraft, itemId: string, from: string, to: string): ChoiceDraft {
  return {
    ...d,
    lists: {
      ...d.lists,
      [from]: (d.lists[from] ?? []).filter((x) => x !== itemId),
      [to]: [...(d.lists[to] ?? []), itemId],
    },
  };
}

export interface InPlaceRefs {
  /** Card id → option id. */
  cards: Map<CardId, string>;
  /** Player id → option id. */
  players: Map<PlayerId, string>;
}

/**
 * When every option is a card on the battlefield, a card in your hand or a
 * player, the choice is made in place on the board: which card or player maps
 * to which option. Undefined when the tray must show the options itself.
 */
export function inPlaceRefs(game: GameView, p: ChoicePrompt): InPlaceRefs | undefined {
  if (p.shape !== 'chooseN' || isReveal(p) || isAbilityMenu(p) || p.options.length === 0) return undefined;
  const refs: InPlaceRefs = { cards: new Map(), players: new Map() };
  for (const o of p.options) {
    if (o.playerId && game.players.some((x) => x.id === o.playerId)) {
      refs.players.set(o.playerId, o.id);
      continue;
    }
    const c = o.cardId ? game.cards[o.cardId] : undefined;
    const here = c && (c.zone === 'battlefield' || (c.zone === 'hand' && c.ownerId === game.youId));
    if (!c || !here) return undefined;
    refs.cards.set(c.id, o.id);
  }
  return refs;
}

/** The keys that answer a yes/no at once: Y / N unless the prompt names its own (the mulligan: M only). */
export function yesNoKeys(p: YesNoPrompt): { yes?: string; no?: string } {
  return p.keys ?? { yes: 'Y', no: 'N' };
}

export type KeyAction =
  | { kind: 'answer'; answer: PromptAnswer }
  | { kind: 'draft'; draft: ChoiceDraft }
  | { kind: 'peek' };

export interface KeyInput {
  key: string;
  alt: boolean;
  /** Focus is in a text field (the filter box). */
  inInput: boolean;
}

/**
 * What a key does while a prompt is open; undefined leaves it to the screen's
 * own shortcuts. `visible` is the options in the order the tray shows them.
 */
export function keyAction(
  p: ChoicePrompt,
  d: ChoiceDraft,
  visible: ChoiceOption[],
  e: KeyInput,
  /** Option id of a group's first card → every option id of the group (identical cards shown as one tile). */
  groups?: ReadonlyMap<string, string[]>,
): KeyAction | undefined {
  if (e.inInput || e.alt) return undefined;
  const k = e.key.toLowerCase();
  const digit = /^[1-9]$/.test(k) ? Number(k) - 1 : -1;

  if (p.shape === 'chooseN' && p.abilityMenu) {
    const row = p.options[digit];
    if (row) return { kind: 'answer', answer: { shape: 'chooseN', optionIds: [row.id] } };
    if (e.key === 'Escape') return { kind: 'answer', answer: { shape: 'chooseN', optionIds: [] } };
    return undefined;
  }
  if (p.shape === 'yesNo') {
    const keys = yesNoKeys(p);
    if (keys.yes && k === keys.yes.toLowerCase()) return { kind: 'answer', answer: { shape: 'yesNo', yes: true } };
    if (keys.no && k === keys.no.toLowerCase()) return { kind: 'answer', answer: { shape: 'yesNo', yes: false } };
  }
  if (k === ' ') {
    const c = trayConfirm(p, d);
    return c.enabled && c.answer ? { kind: 'answer', answer: c.answer } : undefined;
  }
  if (k === 'v') return { kind: 'peek' };
  if (p.shape === 'chooseN' && !isReveal(p)) {
    const o = visible[digit];
    const members = o ? groups?.get(o.id) : undefined;
    if (o) return { kind: 'draft', draft: members && members.length > 1 ? stepGroup(p, d, members) : toggleOption(p, d, o.id) };
  }
  return undefined;
}

export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * Where the ability menu goes: right of the card, else left of it, else above
 * (or below) it; always inside the viewport with a `gap` margin.
 */
export function anchorMenu(a: Rect, menu: { w: number; h: number }, view: { w: number; h: number }, gap: number) {
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(v, hi));
  const top = clamp(a.top, gap, view.h - gap - menu.h);
  if (a.right + gap + menu.w <= view.w - gap) return { left: a.right + gap, top };
  if (a.left - gap - menu.w >= gap) return { left: a.left - gap - menu.w, top };
  const left = clamp(a.left, gap, view.w - gap - menu.w);
  const above = a.top - gap - menu.h;
  return { left, top: above >= gap ? above : clamp(a.bottom + gap, gap, view.h - gap - menu.h) };
}
