import { describe, expect, it } from 'vitest';
import type { Block, CardId, Decision } from '../model/types';
import { blockClick, blockTargets, type PendingBlock } from './blockClick';

type D = Extract<Decision, { kind: 'declareBlockers' }>;

const d: D = {
  kind: 'declareBlockers',
  candidates: ['b1', 'b2'],
  attackers: ['a1', 'a2'],
  draft: [],
};

/** The engine's options (blockOptions): a1 is a flyer only b2 (reach) may block; a2 any. */
const live: D = {
  ...d,
  options: [
    { attackerId: 'a1', blockers: ['b2'], ifFreed: [], min: 1 },
    { attackerId: 'a2', blockers: ['b1', 'b2'], ifFreed: [], min: 1 },
  ],
};

/** Plays clicks in order, applying each block intent to the draft as the engine would. */
function clicks(dec: D, ids: CardId[]): { draft: Block[]; pending: PendingBlock; refused: Array<{ blockerId: CardId; attackerId: CardId }> } {
  let draft = [...dec.draft];
  let pending: PendingBlock = {};
  const refused: Array<{ blockerId: CardId; attackerId: CardId }> = [];
  for (const id of ids) {
    const r = blockClick({ ...dec, draft }, pending, id);
    for (const i of r.intents) {
      if (i.type === 'assignBlock') draft = [...draft, { blockerId: i.blockerId, attackerId: i.attackerId }];
      if (i.type === 'removeBlock')
        draft = draft.filter((b) => !(b.blockerId === i.blockerId && (i.attackerId === undefined || b.attackerId === i.attackerId)));
    }
    if (r.refused) refused.push(r.refused);
    pending = r.pending;
  }
  return { draft, pending, refused };
}

describe('blockClick (ruling D5: either order)', () => {
  it('blocker then attacker assigns the block', () => {
    const first = blockClick(d, {}, 'b1');
    expect(first.intents).toEqual([]);
    expect(first.pending).toEqual({ pendingBlocker: 'b1', pendingAttacker: undefined });
    const second = blockClick(d, first.pending, 'a2');
    expect(second.intents).toEqual([{ type: 'assignBlock', blockerId: 'b1', attackerId: 'a2' }]);
    expect(second.pending).toEqual({ pendingBlocker: undefined, pendingAttacker: undefined });
  });

  it('attacker then blocker assigns the same block', () => {
    const first = blockClick(d, {}, 'a2');
    expect(first.pending).toEqual({ pendingBlocker: undefined, pendingAttacker: 'a2' });
    const second = blockClick(d, first.pending, 'b1');
    expect(second.intents).toEqual([{ type: 'assignBlock', blockerId: 'b1', attackerId: 'a2' }]);
  });

  it('builds several blockers on one attacker, in either order', () => {
    expect(clicks(d, ['b1', 'a1', 'a1', 'b2']).draft).toEqual([
      { blockerId: 'b1', attackerId: 'a1' },
      { blockerId: 'b2', attackerId: 'a1' },
    ]);
  });

  it('clicking the pending card again clears it', () => {
    expect(blockClick(d, { pendingBlocker: 'b1' }, 'b1').pending.pendingBlocker).toBeUndefined();
    expect(blockClick(d, { pendingAttacker: 'a1' }, 'a1').pending.pendingAttacker).toBeUndefined();
  });

  it('a second blocker or attacker click replaces the pending one of its kind', () => {
    expect(blockClick(d, { pendingBlocker: 'b1' }, 'b2').pending).toEqual({ pendingBlocker: 'b2', pendingAttacker: undefined });
    expect(blockClick(d, { pendingAttacker: 'a1' }, 'a2').pending).toEqual({ pendingBlocker: undefined, pendingAttacker: 'a2' });
  });

  it('clicking a blocker that already blocks removes its block', () => {
    const withDraft = { ...d, draft: [{ blockerId: 'b1', attackerId: 'a1' }] };
    expect(blockClick(withDraft, {}, 'b1').intents).toEqual([{ type: 'removeBlock', blockerId: 'b1' }]);
    expect(clicks(withDraft, ['b1']).draft).toEqual([]);
  });

  it('pairing a blocker with the attacker it blocks removes that block, in either order', () => {
    const withDraft = { ...d, draft: [{ blockerId: 'b1', attackerId: 'a1' }] };
    expect(clicks(withDraft, ['a1', 'b1']).draft).toEqual([]);
  });

  it('reassigns: a blocker paired with another attacker leaves its old one', () => {
    const withDraft = { ...live, draft: [{ blockerId: 'b2', attackerId: 'a1' }] };
    const opts = withDraft.options!.map((o) => (o.attackerId === 'a2' ? { ...o, blockers: ['b1'], ifFreed: ['b2'] } : o));
    const r = blockClick({ ...withDraft, options: opts }, { pendingAttacker: 'a2' }, 'b2');
    expect(r.intents).toEqual([
      { type: 'removeBlock', blockerId: 'b2', attackerId: 'a1' },
      { type: 'assignBlock', blockerId: 'b2', attackerId: 'a2' },
    ]);
  });

  it('a blocker that may block several attackers adds the block instead of moving', () => {
    const withDraft = { ...live, draft: [{ blockerId: 'b2', attackerId: 'a1' }] };
    expect(blockClick(withDraft, { pendingAttacker: 'a2' }, 'b2').intents).toEqual([{ type: 'assignBlock', blockerId: 'b2', attackerId: 'a2' }]);
  });

  it('refuses a pair the engine does not allow and keeps the first click', () => {
    const r = blockClick(live, { pendingAttacker: 'a1' }, 'b1');
    expect(r.intents).toEqual([]);
    expect(r.refused).toEqual({ blockerId: 'b1', attackerId: 'a1' });
    expect(r.pending).toEqual({ pendingAttacker: 'a1' });
    expect(clicks(live, ['b1', 'a1']).refused).toEqual([{ blockerId: 'b1', attackerId: 'a1' }]);
  });

  it('ignores cards that are neither blockers nor attackers', () => {
    expect(blockClick(d, { pendingBlocker: 'b1' }, 'x')).toEqual({ intents: [], pending: { pendingBlocker: 'b1' } });
  });
});

describe('blockTargets (highlights are the engine answers for the first click)', () => {
  it('lights every candidate and attacker before the first click', () => {
    expect(blockTargets(live, {})).toEqual({ blockers: ['b1', 'b2'], attackers: ['a1', 'a2'] });
  });

  it('after an attacker, lights the creatures that may block it', () => {
    expect(blockTargets(live, { pendingAttacker: 'a1' })).toEqual({ blockers: ['b2'], attackers: ['a1', 'a2'] });
  });

  it('after a blocker, lights the attackers it may block', () => {
    expect(blockTargets(live, { pendingBlocker: 'b1' })).toEqual({ blockers: ['b1', 'b2'], attackers: ['a2'] });
  });

  it('without engine options (mock scenarios), any pair', () => {
    expect(blockTargets(d, { pendingAttacker: 'a1' })).toEqual({ blockers: ['b1', 'b2'], attackers: ['a1', 'a2'] });
  });
});
