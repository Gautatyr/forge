/**
 * Messages on the live WebSocket beyond the generated state stream (hello / snapshot / delta).
 *
 * The prompt/reply and call shapes follow docs/fork/architecture/spike-report.md, "How the 13
 * prompts would be bridged"; issue #8 implements the server side. Everything here is what this
 * client expects; keep it in one file so aligning with the server is one edit.
 */
import type { ClientMethod, ServerMessage, ServerMethod } from '../wire/generated/wire';

/** A reference inside a call or a prompt choice. Plain numbers in card lists are card ids. */
export interface WireRef {
  type: 'card' | 'player' | 'stackItem';
  id: number;
}

/**
 * A no-reply GUI call (`IGuiGame` method), args encoded by the generic encoder: references become
 * ids (or `WireRef` for mixed collections), collections become arrays, enums their names. Card ids
 * are this viewer's wire ids (aliases included). Calls this client reads: `showPromptMessage`,
 * `updateButtons`, `setSelectables`, `clearSelectables`, `setSelectableTargets`, `setHighlighted`,
 * `awaitNextInput` (the input ended), `message`, `showErrorDialog`, `finishGame`. Others are ignored.
 */
export interface CallMessage {
  t: 'call';
  method: ServerMethod;
  args: unknown[];
}

export interface PromptChoice {
  /** Index the reply refers to. */
  i: number;
  /** Rendered on the server (FSerializableFunction display or toString()). */
  label: string;
  ref?: WireRef;
}

/** One of the 13 answer-needing methods; the server blocks the game thread until `reply` or timeout. */
export interface PromptMessage {
  t: 'prompt';
  id: number;
  method: ServerMethod;
  /** Title or message of the dialog. */
  title: string;
  /** Longer text when the method has both a title and a message. */
  message?: string;
  /** Items to choose / order / distribute to, and button labels of option dialogs. */
  choices: PromptChoice[];
  /** order / manipulateCardList / sideboard: items already in the destination list; `i` continues after `choices`. */
  dest?: PromptChoice[];
  min?: number;
  max?: number;
  /** assignCombatDamage / assignGenericAmount: amount to distribute. */
  amount?: number;
  /** Card the prompt is about (confirm, order, assignCombatDamage…). */
  card?: number;
  /** showInputDialog: initial text. */
  initial?: string;
}

/** The server dropped a prompt (timeout, game over): the client stops showing it. Optional. */
export interface PromptClosedMessage {
  t: 'promptClosed';
  id: number;
}

export type ServerFrame = ServerMessage | CallMessage | PromptMessage | PromptClosedMessage;

/**
 * Reply value by prompt method:
 * - getChoices, chooseEntitiesForEffect: index list
 * - chooseSingleEntityForEffect, getAbilityToPlay, showOptionDialog: one index, -1 = none
 * - confirm, showConfirmDialog: boolean
 * - order, manipulateCardList, sideboard: the destination list, in order, as indices into choices ++ dest
 * - assignCombatDamage, assignGenericAmount: { "<index>": amount }
 * - showInputDialog: string
 */
export type ReplyValue = number | number[] | boolean | string | Record<string, number>;

export interface ReplyMessage {
  t: 'reply';
  id: number;
  value: ReplyValue;
}

/**
 * A player action (`IGameController` method), named by `t` like the existing `requestResync`.
 * Args are positional wire ids: selectCard [cardId], selectPlayer [playerId], selectStackItem
 * [stackItemId], useMana [colour byte], reorderHand [cardId, index], nextGameDecision [name],
 * drawOfferAction [name]; the others take none. ITriggerEvent and "other cards" args are omitted.
 */
export interface CommandMessage {
  t: ClientMethod;
  args?: (number | string)[];
}

export type ClientFrame = ReplyMessage | CommandMessage;
