import type { Intent } from '../model/intents';
import type { CardId, Decision } from '../model/types';

export interface PendingBlock {
  pendingBlocker?: CardId;
  pendingAttacker?: CardId;
}

/**
 * One click while declaring blockers. Blocks can be built in either order
 * (ruling D5): blocker then attacker, or attacker then blocker. The first
 * click waits in `pending` until its partner is clicked.
 */
export function blockClick(
  d: Extract<Decision, { kind: 'declareBlockers' }>,
  pending: PendingBlock,
  id: CardId,
): { intent?: Intent; pending: PendingBlock } {
  const cleared = { pendingBlocker: undefined, pendingAttacker: undefined };
  if (d.candidates.includes(id)) {
    if (d.draft.some((b) => b.blockerId === id)) return { intent: { type: 'removeBlock', blockerId: id }, pending: cleared };
    if (pending.pendingAttacker)
      return { intent: { type: 'assignBlock', blockerId: id, attackerId: pending.pendingAttacker }, pending: cleared };
    return { pending: { pendingBlocker: pending.pendingBlocker === id ? undefined : id, pendingAttacker: undefined } };
  }
  if (d.attackers.includes(id)) {
    if (pending.pendingBlocker)
      return { intent: { type: 'assignBlock', blockerId: pending.pendingBlocker, attackerId: id }, pending: cleared };
    return { pending: { pendingBlocker: undefined, pendingAttacker: pending.pendingAttacker === id ? undefined : id } };
  }
  return { pending };
}
