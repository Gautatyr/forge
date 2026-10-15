import { player } from '../model/selectors';
import type { CardId, GameView, StackItemId } from '../model/types';
import type { UiState } from './ui';

/** Everything a card needs to draw its state overlays. Derived, never stored. */
export interface CardStatus {
  /** You may play it now (hand, command zone, flashback…). */
  playable: boolean;
  /** Can be clicked as part of the current decision (target, attacker, blocker, incoming attacker). */
  actionable: boolean;
  /** Icon for the actionable state. */
  actionKind?: 'play' | 'target' | 'attack' | 'block' | 'blockTarget';
  /** Chosen by you in the current decision (target, pending blocker…). */
  selected: boolean;
  /** Not usable for the current decision: drawn faded. */
  dimmed: boolean;
  attacking?: { defender: string; draft: boolean };
  blocking?: { attacker: string; draft: boolean };
  /** Names of stack items targeting this card. */
  targetedBy: string[];
  /** Hovering a stack item that targets this card. */
  targetHighlight: boolean;
}

export function cardStatus(game: GameView, ui: UiState, id: CardId): CardStatus {
  const c = game.cards[id];
  const d = game.decision;
  const s: CardStatus = {
    playable: false,
    actionable: false,
    selected: false,
    dimmed: false,
    targetedBy: [],
    targetHighlight: false,
  };
  if (!c) return s;

  if (d.kind === 'priority' && d.playable.includes(id)) {
    s.playable = true;
    s.actionable = true;
    s.actionKind = 'play';
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
    if (item.targets.some((t) => t.kind === 'card' && t.id === id)) {
      s.targetedBy.push(game.cards[item.sourceCardId]?.name ?? 'a spell');
      if (ui.hoveredStackItem === item.id) s.targetHighlight = true;
    }
  }
  return s;
}

export function stackItemTargets(game: GameView, itemId: StackItemId | undefined) {
  return game.stack.find((s) => s.id === itemId)?.targets ?? [];
}
