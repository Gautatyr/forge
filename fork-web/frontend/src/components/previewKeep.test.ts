import { describe, expect, it } from 'vitest';
import { scenarioById } from '../mock/scenarios';
import { INITIAL_UI } from '../state/ui';
import { hoverLitTargets } from './previewKeep';

describe('what a hovered stack item keeps clear of the over-board preview', () => {
  const g = scenarioById('stack6').build();
  const item = (id: string) => g.stack.find((s) => s.id === id)!;

  it("is the hovered item's card targets", () => {
    const lit = hoverLitTargets(g, { ...INITIAL_UI, hoveredStackItem: 's2' });
    expect(lit).toEqual({ cards: item('s2').targets.map((t) => t.id), players: [] });
    expect(lit.cards).toHaveLength(1);
  });

  it('includes a player target', () => {
    expect(hoverLitTargets(g, { ...INITIAL_UI, hoveredStackItem: 's4' })).toEqual({ cards: [], players: ['theo'] });
  });

  it('is empty for an item without targets, or with no hovered item (the top item is lit by default, not hovered)', () => {
    expect(hoverLitTargets(g, { ...INITIAL_UI, hoveredStackItem: 's3' })).toEqual({ cards: [], players: [] });
    expect(hoverLitTargets(g, INITIAL_UI)).toEqual({ cards: [], players: [] });
  });
});
