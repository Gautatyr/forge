import type { Intent } from '../model/intents';
import type { CardId, Decision, GameView } from '../model/types';

export interface PendingBlock {
  pendingBlocker?: CardId;
  pendingAttacker?: CardId;
}

type DeclareBlockers = Extract<Decision, { kind: 'declareBlockers' }>;

const option = (d: DeclareBlockers, attackerId: CardId) => d.options?.find((o) => o.attackerId === attackerId);
const blocks = (d: DeclareBlockers, b: CardId, a: CardId) => d.draft.some((x) => x.blockerId === b && x.attackerId === a);
/** The engine lets `b` block `a` now (live: blockOptions; mock: any pair). */
const may = (d: DeclareBlockers, b: CardId, a: CardId) => !d.options || !!option(d, a)?.blockers.includes(b);
/** `b` blocks another attacker and could block `a` once taken off it. */
const mayIfFreed = (d: DeclareBlockers, b: CardId, a: CardId) => !!option(d, a)?.ifFreed.includes(b);

/** The pair a click completes: remove it if it is a block already, else assign it (moving the blocker if it must). */
function pair(d: DeclareBlockers, b: CardId, a: CardId): Intent[] | undefined {
  if (blocks(d, b, a)) return [{ type: 'removeBlock', blockerId: b, attackerId: a }];
  if (may(d, b, a)) return [{ type: 'assignBlock', blockerId: b, attackerId: a }];
  if (mayIfFreed(d, b, a)) {
    const off = d.draft.filter((x) => x.blockerId === b).map((x): Intent => ({ type: 'removeBlock', blockerId: b, attackerId: x.attackerId }));
    return [...off, { type: 'assignBlock', blockerId: b, attackerId: a }];
  }
  return undefined;
}

/**
 * One click while declaring blockers. Blocks can be built in either order (ruling D5): blocker then attacker, or
 * attacker then blocker; the first click waits in `pending` until its partner is clicked. A blocker clicked first is
 * only selected, even when it already blocks: the pair it then completes is removed, added or moved, and a second click
 * on it deselects. A pair the engine does not allow is `refused` and the first click stays pending.
 */
export function blockClick(
  d: DeclareBlockers,
  pending: PendingBlock,
  id: CardId,
): { intents: Intent[]; pending: PendingBlock; refused?: { blockerId: CardId; attackerId: CardId } } {
  const cleared = { pendingBlocker: undefined, pendingAttacker: undefined };
  const complete = (b: CardId, a: CardId) => {
    const intents = pair(d, b, a);
    return intents ? { intents, pending: cleared } : { intents: [], pending, refused: { blockerId: b, attackerId: a } };
  };
  if (d.candidates.includes(id)) {
    if (pending.pendingAttacker) return complete(id, pending.pendingAttacker);
    if (pending.pendingBlocker === id) return { intents: [], pending: cleared };
    return { intents: [], pending: { pendingBlocker: id, pendingAttacker: undefined } };
  }
  if (d.attackers.includes(id)) {
    if (pending.pendingBlocker) return complete(pending.pendingBlocker, id);
    return { intents: [], pending: { pendingBlocker: undefined, pendingAttacker: pending.pendingAttacker === id ? undefined : id } };
  }
  return { intents: [], pending };
}

/**
 * What may be clicked now (the lit cards): before the first click every candidate and attacker; after an attacker,
 * the creatures that may block it (and the attackers, to switch); after a blocker, the attackers it may block (and
 * the candidates, to switch).
 */
export function blockTargets(d: DeclareBlockers, pending: PendingBlock): { blockers: CardId[]; attackers: CardId[] } {
  const a = pending.pendingAttacker;
  const b = pending.pendingBlocker;
  return {
    blockers: a ? d.candidates.filter((c) => pair(d, c, a)) : d.candidates,
    attackers: b ? d.attackers.filter((x) => pair(d, b, x)) : d.attackers,
  };
}

/** Fewest blockers the engine accepts on this attacker (menace), while fewer are assigned; else undefined. */
export function underBlocked(d: DeclareBlockers, attackerId: CardId): number | undefined {
  const min = option(d, attackerId)?.min ?? 1;
  return min > 1 && d.draft.filter((b) => b.attackerId === attackerId).length < min ? min : undefined;
}

/** "X can't block Y." for a pair the engine refused; a face-down creature has no name to show. */
export function refusedText(game: GameView, r: { blockerId: CardId; attackerId: CardId }): string {
  const name = (id: CardId) => {
    const c = game.cards[id];
    return c?.name || (c?.faceDown ? 'a face-down creature' : 'that creature');
  };
  const text = `${name(r.blockerId)} can't block ${name(r.attackerId)}.`;
  return text[0]!.toUpperCase() + text.slice(1);
}
