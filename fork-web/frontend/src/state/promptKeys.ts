import type { Intent } from '../model/intents';
import type { GameView, TargetRef } from '../model/types';
import { you } from '../model/selectors';
import type { UiState } from './ui';

/** The part of a DOM element the key handlers read (duck-typed so the logic runs without a DOM). */
export interface KeyTarget {
  tagName: string;
  type?: string;
  matches?(selector: string): boolean;
}

const isToggle = (el: KeyTarget) => el.tagName === 'INPUT' && (el.type === 'checkbox' || el.type === 'radio');

/**
 * Focus is in a field that takes the keys itself (filter box, select). A switch only does when it has keyboard focus
 * (`:focus-visible`): after a pointer click it keeps focus, but Space must still pass priority (issue #126).
 */
export function takesKeys(el: KeyTarget | null | undefined): boolean {
  if (!el) return false;
  if (isToggle(el)) return el.matches?.(':focus-visible') ?? true;
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT';
}

/** After a click, a switch that got focus from the pointer gives it up (a keyboard-focused one keeps it). */
export function dropsFocusAfterClick(active: KeyTarget | null | undefined): boolean {
  return !!active && isToggle(active) && !takesKeys(active);
}

/**
 * Digits 1–9 in a card pick (a discard, an imprint, a cost): the Nth card of your hand in hand order, when it is
 * one of the legal cards. Board picks keep ignoring digits: their order is not on screen (#121).
 */
export function pickDigitTarget(game: GameView, key: string): TargetRef | undefined {
  const d = game.decision;
  if (d.kind !== 'chooseTargets' || d.purpose !== 'pick' || !/^[1-9]$/.test(key)) return undefined;
  const id = you(game).hand[Number(key) - 1];
  return id !== undefined && d.legal.some((l) => l.kind === 'card' && l.id === id) ? { kind: 'card', id } : undefined;
}

/**
 * A prompt's keys (Space, N, Y, digits 1–9) answer the prompt only while nothing sits over it: an inspector or an
 * overlay (shortcuts, display, dev) owns the keyboard until Esc closes it. Shared by the tray and the screen.
 */
export function promptKeysLive(ui: Pick<UiState, 'inspectId' | 'overlay'>): boolean {
  return !ui.inspectId && !ui.overlay;
}

/**
 * The screen's Space handler. Space is always swallowed (`preventDefault` first, so the browser never clicks a focused
 * button behind an overlay or the inspector); it sends the primary action only while the prompt keys are live, and never
 * an answer that gives something up (U8): that has its own key. A refused answer says why (`note`).
 */
export function handleSpace(
  e: { preventDefault(): void },
  ui: Pick<UiState, 'inspectId' | 'overlay'>,
  action: { enabled: boolean; intent?: Intent; guard?: unknown; refusal?: string },
  send: (intent: Intent) => void,
  note?: (text: string) => void,
): void {
  e.preventDefault();
  if (!promptKeysLive(ui)) return;
  // The engine would refuse this answer: say why instead of doing nothing (issue #129).
  if (action.refusal) return note?.(action.refusal);
  if (action.enabled && action.intent && !action.guard) send(action.intent);
}

export type EscapeStep = 'inspect' | 'overlay' | 'log' | 'mana' | 'pending' | 'zone' | 'peek' | 'cancel';

/**
 * What Esc does, innermost first: close whatever is open, else cancel the prompt. A combat draft is cleared (the
 * Cancel button's Esc, issue #130) only after any open view, so Esc on a pile you are looking at never wipes it.
 */
export function escapeStep(
  d: GameView['decision'],
  ui: Partial<Pick<UiState, 'inspectId' | 'overlay' | 'logOpen' | 'pendingBlocker' | 'pendingAttacker' | 'zoneView' | 'trayPeek'>>,
  manaChoiceOpen: boolean,
): EscapeStep | undefined {
  if (ui.inspectId) return 'inspect';
  if (ui.overlay) return 'overlay';
  if (ui.logOpen) return 'log';
  if (manaChoiceOpen) return 'mana';
  if (ui.pendingBlocker || ui.pendingAttacker) return 'pending';
  if (d.kind === 'chooseTargets' || d.kind === 'payMana' || (d.kind === 'choice' && d.cancellable)) return 'cancel';
  if (ui.zoneView) return 'zone';
  if ((d.kind === 'declareAttackers' || d.kind === 'declareBlockers') && d.draft.length > 0) return 'cancel';
  if (ui.trayPeek) return 'peek';
  return undefined;
}
