import type { CardId, PlayerId, TargetRef } from './types';

/**
 * What the player asks the game to do. The mock engine answers these with
 * fake logic; the real bridge maps each one to the engine's player→game
 * messages (selectCard, selectPlayer, selectButtonOk, selectButtonCancel,
 * sendYieldUpdate, undoLastAction, concede…).
 */
export type PromptAnswer =
  | { shape: 'chooseN'; optionIds: string[] }
  | { shape: 'yesNo'; yes: boolean }
  | { shape: 'order'; lists: { id: string; itemIds: string[] }[] }
  | { shape: 'distribute'; amounts: Record<string, number> }
  | { shape: 'input'; value: string };

export type Intent =
  /** Click a playable card: land, spell or ability. */
  | { type: 'play'; cardId: CardId }
  /** Toggle a target while the decision is chooseTargets. */
  | { type: 'toggleTarget'; target: TargetRef }
  /** Main action button: pass, confirm targets, attackers, blockers. */
  | { type: 'primary' }
  /** Cancel a half-cast spell or clear an attack/block draft. */
  | { type: 'cancel' }
  | { type: 'toggleAttacker'; cardId: CardId; defenderId: PlayerId }
  | { type: 'attackWithAll'; defenderId: PlayerId }
  | { type: 'setAttackDefender'; cardId: CardId; defenderId: PlayerId }
  | { type: 'assignBlock'; blockerId: CardId; attackerId: CardId }
  | { type: 'removeBlock'; blockerId: CardId }
  | { type: 'answer'; promptId: string; answer: PromptAnswer }
  | { type: 'passUntilYourTurn' }
  | { type: 'cancelPassUntilYourTurn' }
  | { type: 'setAutoPass'; on: boolean }
  | { type: 'setAutoYield'; on: boolean }
  | { type: 'toggleAutoYieldTo'; key: string }
  | { type: 'undo' };
