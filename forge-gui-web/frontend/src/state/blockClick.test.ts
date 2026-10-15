import { describe, expect, it } from 'vitest';
import type { Decision } from '../model/types';
import { blockClick } from './blockClick';

const d: Extract<Decision, { kind: 'declareBlockers' }> = {
  kind: 'declareBlockers',
  candidates: ['b1', 'b2'],
  attackers: ['a1', 'a2'],
  draft: [],
};

describe('blockClick (ruling D5: either order)', () => {
  it('blocker then attacker assigns the block', () => {
    const first = blockClick(d, {}, 'b1');
    expect(first.intent).toBeUndefined();
    expect(first.pending).toEqual({ pendingBlocker: 'b1', pendingAttacker: undefined });
    const second = blockClick(d, first.pending, 'a2');
    expect(second.intent).toEqual({ type: 'assignBlock', blockerId: 'b1', attackerId: 'a2' });
    expect(second.pending).toEqual({ pendingBlocker: undefined, pendingAttacker: undefined });
  });

  it('attacker then blocker assigns the same block', () => {
    const first = blockClick(d, {}, 'a2');
    expect(first.pending).toEqual({ pendingBlocker: undefined, pendingAttacker: 'a2' });
    const second = blockClick(d, first.pending, 'b1');
    expect(second.intent).toEqual({ type: 'assignBlock', blockerId: 'b1', attackerId: 'a2' });
  });

  it('clicking the pending card again clears it', () => {
    expect(blockClick(d, { pendingBlocker: 'b1' }, 'b1').pending.pendingBlocker).toBeUndefined();
    expect(blockClick(d, { pendingAttacker: 'a1' }, 'a1').pending.pendingAttacker).toBeUndefined();
  });

  it('clicking a blocker that already blocks removes the block', () => {
    const withDraft = { ...d, draft: [{ blockerId: 'b1', attackerId: 'a1' }] };
    expect(blockClick(withDraft, {}, 'b1').intent).toEqual({ type: 'removeBlock', blockerId: 'b1' });
  });

  it('ignores cards that are neither blockers nor attackers', () => {
    expect(blockClick(d, { pendingBlocker: 'b1' }, 'x')).toEqual({ pending: { pendingBlocker: 'b1' } });
  });
});
