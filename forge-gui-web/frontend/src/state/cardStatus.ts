import { player } from '../model/selectors';
import type { CardId, GameView, PlayerId, StackItem, TargetRef } from '../model/types';
import type { UiState } from './ui';

/**
 * Everything a card needs to draw its state overlays. Derived, never stored.
 * "Highlights are answers, never hints" (design pass 4): a card is actionable
 * only while the open prompt lets you pick it, never for ordinary priority.
 */
export interface CardStatus {
  /** Can be clicked as part of the current decision (target, attacker, blocker, incoming attacker, mana source while paying). */
  actionable: boolean;
  /** Icon for the actionable state. */
  actionKind?: 'target' | 'attack' | 'block' | 'blockTarget' | 'mana';
  /** Chosen by you in the current decision (target, pending blocker…). */
  selected: boolean;
  /** Not usable for the current decision: drawn faded. */
  dimmed: boolean;
  attacking?: { defender: string; draft: boolean };
  blocking?: { attacker: string; draft: boolean };
  /** Names of every stack item targeting this card (hover text only, never a ring). */
  targetedBy: string[];
  /**
   * Targeted by the stack item in the spotlight: the top item by default
   * ('top'), or the item the pointer is on ('hover'). Only these get a ring.
   */
  targetSpot?: TargetSpot;
}

export type TargetSpot = 'top' | 'hover';

/**
 * The one stack item whose targets are lit (ruling from mockup review 1):
 * the hovered item, else the top (it resolves next). While you choose targets
 * for a new spell the board shows legal targets instead, so only a hover lights.
 */
export function spotlightItem(game: GameView, ui: UiState): StackItem | undefined {
  const hovered = game.stack.find((s) => s.id === ui.hoveredStackItem);
  if (hovered) return hovered;
  if (game.decision.kind === 'chooseTargets') return undefined;
  return game.stack.at(-1);
}

function spotFor(game: GameView, ui: UiState, hit: (t: TargetRef) => boolean): TargetSpot | undefined {
  const item = spotlightItem(game, ui);
  if (!item?.targets.some(hit)) return undefined;
  return item.id === ui.hoveredStackItem ? 'hover' : 'top';
}

export function playerTargetSpot(game: GameView, ui: UiState, id: PlayerId): TargetSpot | undefined {
  return spotFor(game, ui, (t) => t.kind === 'player' && t.id === id);
}

export function cardStatus(game: GameView, ui: UiState, id: CardId): CardStatus {
  const c = game.cards[id];
  const d = game.decision;
  const s: CardStatus = {
    actionable: false,
    selected: false,
    dimmed: false,
    targetedBy: [],
  };
  if (!c) return s;

  if (d.kind === 'payMana') {
    // Sources that can still pay are ringed; your other permanents dim; opponents' boards don't.
    const source = d.sources.some((x) => x.cardId === id);
    s.actionable = source;
    s.actionKind = source ? 'mana' : undefined;
    s.selected = id === d.sourceCardId;
    s.dimmed = !source && !s.selected && c.zone === 'battlefield' && c.controllerId === game.youId;
  }

  if (d.kind === 'chooseTargets') {
    const legal = d.legal.some((t) => t.kind === 'card' && t.id === id);
    const chosen = d.chosen.some((t) => t.kind === 'card' && t.id === id);
    s.actionable = legal;
    s.actionKind = legal ? 'target' : undefined;
    // The card being cast reads as chosen too.
    s.selected = chosen || id === d.sourceCardId;
    s.dimmed = !legal && id !== d.sourceCardId && c.zone === 'battlefield';
  }

  // Combat: committed attacks/blocks and the draft being built.
  const attacks = [...(game.combat?.attacks ?? []).map((a) => ({ ...a, draft: false }))];
  const blocks = [...(game.combat?.blocks ?? []).map((b) => ({ ...b, draft: false }))];
  if (d.kind === 'declareAttackers') attacks.push(...d.draft.map((a) => ({ ...a, draft: true })));
  if (d.kind === 'declareBlockers') blocks.push(...d.draft.map((b) => ({ ...b, draft: true })));
  const atk = attacks.find((a) => a.attackerId === id);
  if (atk) s.attacking = { defender: player(game, atk.defenderId).name, draft: atk.draft };
  const blk = blocks.find((b) => b.blockerId === id);
  if (blk) s.blocking = { attacker: game.cards[blk.attackerId]?.name ?? '?', draft: blk.draft };

  if (d.kind === 'declareAttackers') {
    const cand = d.candidates.includes(id);
    s.actionable = cand;
    s.actionKind = cand ? 'attack' : undefined;
    s.dimmed = !cand && c.zone === 'battlefield' && c.controllerId === game.youId && !atk;
  }
  if (d.kind === 'declareBlockers') {
    const cand = d.candidates.includes(id);
    const incoming = d.attackers.includes(id);
    s.actionable = cand || incoming;
    s.actionKind = cand ? 'block' : incoming ? 'blockTarget' : undefined;
    s.selected = ui.pendingBlocker === id || ui.pendingAttacker === id;
    s.dimmed = !cand && !incoming && c.zone === 'battlefield' && c.controllerId === game.youId;
  }

  for (const item of game.stack) {
    if (item.targets.some((t) => t.kind === 'card' && t.id === id)) s.targetedBy.push(game.cards[item.sourceCardId]?.name ?? 'a spell');
  }
  s.targetSpot = spotFor(game, ui, (t) => t.kind === 'card' && t.id === id);
  return s;
}
