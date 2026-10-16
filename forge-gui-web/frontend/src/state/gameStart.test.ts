import { describe, expect, it } from 'vitest';
import { bottomPrompt, mulliganPrompt, mulliganTag } from './gameStart';

describe('London mulligan prompt (design pass 4 §2.4)', () => {
  it('offers Keep 7 (Space) and Mulligan (M), and says when the next mulligan is free', () => {
    const p = mulliganPrompt({ handSize: 7, toBottom: 0, freeNext: true });
    expect(p.title).toBe('Opening hand · 7 cards');
    expect(p.instruction).toBe('Keep these cards, or shuffle and draw 7 new ones. Your first mulligan is free.');
    expect(p.yesLabel).toBe('Keep 7');
    expect(p.noLabel).toBe('Mulligan');
    expect(p.defaultAnswer ?? 'yes').toBe('yes');
    expect(p.keys).toEqual({ no: 'M' });
  });

  it('drops the free line when the engine does not say so', () => {
    const p = mulliganPrompt({ handSize: 7, toBottom: 0, freeNext: false });
    expect(p.instruction).toBe('Keep these cards, or shuffle and draw 7 new ones.');
  });

  it('keep says how many cards go to the bottom after a mulligan that costs one', () => {
    expect(mulliganPrompt({ handSize: 7, toBottom: 1, freeNext: false }).yesLabel).toBe('Keep · put 1 on the bottom');
    expect(mulliganPrompt({ handSize: 7, toBottom: 2, freeNext: false }).yesLabel).toBe('Keep · put 2 on the bottom');
  });

  it('bottoming is an in-place choice of exactly N hand cards with a progress counter', () => {
    const p = bottomPrompt(['a', 'b', 'c', 'd', 'e', 'f', 'g'], 1);
    expect(p.title).toBe('Choose 1 card to put on the bottom of your library');
    expect(p.confirmLabel).toBe('Put on bottom');
    expect([p.min, p.max]).toEqual([1, 1]);
    expect(p.progress).toBe(true);
    expect(p.options.map((o) => o.cardId)).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'g']);
    expect(bottomPrompt(['a', 'b'], 2).title).toBe('Choose 2 cards to put on the bottom of your library');
  });
});

describe("opponents' mulligan tags", () => {
  it('reads Deciding…, Kept 7, Mulligan → 6', () => {
    expect(mulliganTag({ state: 'deciding' })).toEqual({ icon: 'hourglass', text: 'Deciding…', count: undefined, title: 'Deciding on their opening hand' });
    expect(mulliganTag({ state: 'kept', cards: 7 })).toMatchObject({ icon: 'check', text: 'Kept ', count: '7' });
    expect(mulliganTag({ state: 'mulligan', cards: 6 })).toMatchObject({ icon: 'flip', text: 'Mulligan ', count: '→ 6' });
  });
});
