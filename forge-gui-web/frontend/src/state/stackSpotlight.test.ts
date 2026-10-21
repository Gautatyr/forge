import { describe, expect, it } from 'vitest';
import { applyIntent, type MockGame } from '../mock/engine';
import { scenarioById } from '../mock/scenarios';
import type { GameView } from '../model/types';
import { cardStatus, playerTargetSpot, spotlightItem, stackTargetSpot } from './cardStatus';
import { INITIAL_UI, type UiState } from './ui';

/** Every card that shows a target ring or badge, with the ring kind. */
function lit(g: GameView, ui: UiState) {
  return Object.keys(g.cards)
    .map((id) => ({ id, spot: cardStatus(g, ui, id).targetSpot }))
    .filter((x) => x.spot !== undefined);
}

describe('target highlights follow the stack (mockup review 1)', () => {
  const g = scenarioById('stack6').build();
  const top = g.stack.at(-1)!;

  it('the scenario has a 6-item stack with card and player targets', () => {
    expect(g.stack.length).toBeGreaterThanOrEqual(5);
    expect(g.stack.some((s) => s.targets.some((t) => t.kind === 'player'))).toBe(true);
    expect(g.stack.filter((s) => s.targets.some((t) => t.kind === 'card')).length).toBeGreaterThanOrEqual(3);
  });

  it('lights only the targets of the top item by default', () => {
    expect(spotlightItem(g, INITIAL_UI)?.id).toBe(top.id);
    const cards = lit(g, INITIAL_UI);
    const topCards = top.targets.filter((t) => t.kind === 'card').map((t) => t.id);
    expect(cards.map((c) => c.id).sort()).toEqual([...topCards].sort());
    expect(cards.every((c) => c.spot === 'top')).toBe(true);
    for (const p of g.players) {
      const targeted = top.targets.some((t) => t.kind === 'player' && t.id === p.id);
      expect(playerTargetSpot(g, INITIAL_UI, p.id) !== undefined).toBe(targeted);
    }
  });

  it('lights only the hovered item while another item is hovered', () => {
    const lower = g.stack.find((s) => s !== top && s.targets.some((t) => t.kind === 'card'))!;
    const ui = { ...INITIAL_UI, hoveredStackItem: lower.id };
    expect(spotlightItem(g, ui)?.id).toBe(lower.id);
    const cards = lit(g, ui);
    const lowerCards = lower.targets.filter((t) => t.kind === 'card').map((t) => t.id);
    expect(cards.map((c) => c.id).sort()).toEqual([...lowerCards].sort());
    expect(cards.every((c) => c.spot === 'hover')).toBe(true);
  });

  it('still names every stack item that targets a card (hover text)', () => {
    const counts = new Map<string, number>();
    for (const s of g.stack) for (const t of s.targets) if (t.kind === 'card') counts.set(t.id, (counts.get(t.id) ?? 0) + 1);
    for (const [id, n] of counts) expect(cardStatus(g, INITIAL_UI, id).targetedBy.length).toBe(n);
  });

  it('lights nothing by default while you choose targets', () => {
    const p = scenarioById('priority').build();
    const path = p.players[0]!.hand.find((id) => p.cards[id]!.name === 'Path to Exile')!;
    const t = applyIntent(p, { type: 'play', cardId: path });
    expect(t.decision.kind).toBe('chooseTargets');
    expect(spotlightItem(t, INITIAL_UI)).toBeUndefined();
    expect(lit(t, INITIAL_UI)).toEqual([]);
  });

  it('resolves every item of the big stack', () => {
    let s: MockGame = scenarioById('stack6').build();
    for (let i = 0; i < 10 && s.stack.length > 0; i++) s = applyIntent(s, { type: 'primary' });
    expect(s.stack.length).toBe(0);
  });
});

describe('a stack item targeted by the spotlight item (counterspells, Stifle)', () => {
  const base = scenarioById('stack6').build();
  const [bottom, second] = base.stack;
  const top = base.stack.at(-1)!;
  // The top item counters the bottom one.
  const g: GameView = {
    ...base,
    stack: base.stack.map((s) => (s === top ? { ...s, targets: [{ kind: 'stackItem', id: bottom!.id }] } : s)),
  };

  it('rings the targeted row (dotted) while the top item is in the spotlight', () => {
    expect(stackTargetSpot(g, INITIAL_UI, bottom!.id)).toBe('top');
    expect(stackTargetSpot(g, INITIAL_UI, second!.id)).toBeUndefined();
    expect(stackTargetSpot(g, INITIAL_UI, top.id)).toBeUndefined();
  });

  it('rings it strong while the targeting item is hovered, and not when another item is', () => {
    expect(stackTargetSpot(g, { ...INITIAL_UI, hoveredStackItem: top.id }, bottom!.id)).toBe('hover');
    expect(stackTargetSpot(g, { ...INITIAL_UI, hoveredStackItem: second!.id }, bottom!.id)).toBeUndefined();
  });
});
