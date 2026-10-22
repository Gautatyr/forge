import { player } from '../model/selectors';
import { pickedDefenderCard } from './focus';
import type { CardId, GameView, PlayerId, StackItem, StackItemId, TargetRef } from '../model/types';
import { blockTargets, underBlocked } from './blockClick';
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
  actionKind?: 'target' | 'attack' | 'block' | 'blockTarget' | 'mana' | 'defender';
  /** Chosen by you in the current decision (target, pending blocker…). */
  selected: boolean;
  /** Not usable for the current decision: drawn faded. */
  dimmed: boolean;
  attacking?: { defender: string; draft: boolean };
  /** A planeswalker or battle attacked: the names of its attackers (issue #65). */
  attackedBy: string[];
  blocking?: { attacker: string; draft: boolean };
  /** An attacker that needs more blockers than it has (menace): the fewest the engine accepts. */
  needsBlockers?: number;
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

/** A stack item targeted by the spotlight item (a counterspell's spell, a Stifle's ability): its row is ringed. */
export function stackTargetSpot(game: GameView, ui: UiState, id: StackItemId): TargetSpot | undefined {
  return spotFor(game, ui, (t) => t.kind === 'stackItem' && t.id === id);
}

export function cardStatus(game: GameView, ui: UiState, id: CardId): CardStatus {
  const c = game.cards[id];
  const d = game.decision;
  const s: CardStatus = {
    actionable: false,
    selected: false,
    dimmed: false,
    attackedBy: [],
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
    // A pick for a cost or an effect (a discard, a sacrifice) is no target: the plain actionable ring, as an in-place
    // choice (issue #81); the card being cast or activated reads as chosen only while you pick its targets.
    const pick = d.purpose === 'pick';
    const source = !pick && id === d.sourceCardId;
    s.actionable = legal;
    // Convoke and improvise taps are no targets either.
    s.actionKind = legal && !pick && !d.tapToPay ? 'target' : undefined;
    s.selected = chosen || source;
    s.dimmed = !legal && !source && c.zone === 'battlefield';
  }

  // Combat: committed attacks/blocks and the draft being built.
  const attacks = [...(game.combat?.attacks ?? []).map((a) => ({ ...a, draft: false }))];
  const blocks = [...(game.combat?.blocks ?? []).map((b) => ({ ...b, draft: false }))];
  if (d.kind === 'declareAttackers') attacks.push(...d.draft.map((a) => ({ ...a, draft: true })));
  if (d.kind === 'declareBlockers') blocks.push(...d.draft.map((b) => ({ ...b, draft: true })));
  const atk = attacks.find((a) => a.attackerId === id);
  if (atk) s.attacking = { defender: (atk.defenderCardId && game.cards[atk.defenderCardId]?.name) || player(game, atk.defenderId).name, draft: atk.draft };
  // Live, the engine's combat also holds the draft: each attacker once.
  const attackers = new Set(attacks.filter((a) => a.defenderCardId === id).map((a) => a.attackerId));
  s.attackedBy = [...attackers].map((a) => game.cards[a]?.name ?? '?');
  const blk = blocks.find((b) => b.blockerId === id);
  if (blk) s.blocking = { attacker: game.cards[blk.attackerId]?.name ?? '?', draft: blk.draft };

  if (d.kind === 'declareAttackers') {
    const cand = d.candidates.includes(id);
    // A planeswalker or battle you may attack: picking it aims new attackers at it (issue #65).
    const defender = d.defenderCards.includes(id);
    s.actionable = cand || defender;
    s.actionKind = cand ? 'attack' : defender ? 'defender' : undefined;
    s.selected = defender && pickedDefenderCard(game, ui) === id;
    s.dimmed = !cand && !defender && c.zone === 'battlefield' && c.controllerId === game.youId && !atk;
  }
  if (d.kind === 'declareBlockers') {
    // After a first click, only the partners the engine allows for it are lit (issue #48).
    const lit = blockTargets(d, ui);
    const cand = lit.blockers.includes(id);
    const incoming = lit.attackers.includes(id);
    s.actionable = cand || incoming;
    s.actionKind = cand ? 'block' : incoming ? 'blockTarget' : undefined;
    s.selected = ui.pendingBlocker === id || ui.pendingAttacker === id;
    s.dimmed = !cand && !incoming && c.zone === 'battlefield' && c.controllerId === game.youId;
    s.needsBlockers = underBlocked(d, id);
  }

  for (const item of game.stack) {
    if (item.targets.some((t) => t.kind === 'card' && t.id === id)) s.targetedBy.push(game.cards[item.sourceCardId]?.name ?? 'a spell');
  }
  s.targetSpot = spotFor(game, ui, (t) => t.kind === 'card' && t.id === id);
  return s;
}
