import type { CardId, ManaColour, PlayerId, TargetRef } from './types';

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
  /** Click a playable card in hand or another zone: land or spell. */
  | { type: 'play'; cardId: CardId; hold?: boolean }
  /** Click a permanent of yours that is not tapped for mana: activate its ability (the engine asks which when there are several). */
  | { type: 'activate'; cardId: CardId; hold?: boolean }
  /**
   * Tap a mana source for one kind of mana (`colour` may be omitted when it adds
   * one kind). With priority the mana goes to your pool; while paying it pays.
   */
  | { type: 'tapForMana'; cardId: CardId; colour?: ManaColour }
  /** While paying: spend one floating mana of this kind. */
  | { type: 'spendPool'; colour: ManaColour }
  /** While paying: pay the rest automatically (floating mana first, then untapped sources). */
  | { type: 'payAuto' }
  /** While paying: pay 2 life for one Phyrexian mana symbol. */
  | { type: 'payLife' }
  /** While paying: undo the last tap or pool spend (Z). */
  | { type: 'undoTap' }
  /** Toggle a target while the decision is chooseTargets. */
  | { type: 'toggleTarget'; target: TargetRef }
  /** Main action button: pass, confirm targets, attackers, blockers. */
  | { type: 'primary' }
  /** Cancel a half-cast spell (targets or payment: its sources untap) or clear an attack/block draft. */
  | { type: 'cancel' }
  /** `defenderCardId`: the planeswalker or battle attacked, of the defending player `defenderId`. */
  | { type: 'toggleAttacker'; cardId: CardId; defenderId: PlayerId; defenderCardId?: CardId }
  | { type: 'attackWithAll'; defenderId: PlayerId; defenderCardId?: CardId }
  | { type: 'setAttackDefender'; cardId: CardId; defenderId: PlayerId; defenderCardId?: CardId }
  | { type: 'assignBlock'; blockerId: CardId; attackerId: CardId }
  /** Without attackerId: every block of that blocker. */
  | { type: 'removeBlock'; blockerId: CardId; attackerId?: CardId }
  | { type: 'answer'; promptId: string; answer: PromptAnswer }
  | { type: 'passUntilYourTurn' }
  | { type: 'cancelPassUntilYourTurn' }
  | { type: 'setAutoPass'; on: boolean }
  | { type: 'setAutoYield'; on: boolean }
  | { type: 'setAutoPay'; on: boolean }
  | { type: 'toggleAutoYieldTo'; key: string }
  | { type: 'undo' }
  /** Concede this game: you are out, the others keep playing (design pass 4 §2.6). */
  | { type: 'concede' }
  /** Leave the match for Forge's lobby; ends the game if it is still running. */
  | { type: 'leaveMatch' }
  /** The game is over and the match has more games: start the next one. */
  | { type: 'nextGame' };
