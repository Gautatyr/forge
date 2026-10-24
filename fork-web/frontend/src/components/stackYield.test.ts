import { describe, expect, it } from 'vitest';
import { scenarioById } from '../mock/scenarios';
import type { GameView, StackItem } from '../model/types';
import { isAlwaysYielded, offersAlwaysYield, yieldKeyOf } from './stackYield';

function item(kind: StackItem['kind'], extra: Partial<StackItem> = {}): StackItem {
  return { id: 's1', sourceCardId: 'nope', controllerId: 'p1', kind, text: 'Draw a card.', targets: [], ...extra };
}

function base(): GameView {
  return scenarioById('hand9').build();
}

describe('offersAlwaysYield', () => {
  it('is offered on abilities and triggers, never on a spell', () => {
    expect(offersAlwaysYield(item('ability'))).toBe(true);
    expect(offersAlwaysYield(item('trigger'))).toBe(true);
    expect(offersAlwaysYield(item('spell'))).toBe(false);
  });
});

describe('yieldKeyOf / isAlwaysYielded', () => {
  it('uses the bridge key, else the source card name, else the text', () => {
    const g = base();
    const [id] = Object.keys(g.cards) as [string];
    expect(yieldKeyOf(g, item('ability', { yieldKey: 'Draw a card' }))).toBe('Draw a card');
    expect(yieldKeyOf(g, item('ability', { sourceCardId: id }))).toBe(g.cards[id]!.name);
    expect(yieldKeyOf(g, item('trigger'))).toBe('Draw a card.');
  });

  it('is on only for an ability whose key is in the list', () => {
    const g = { ...base(), autoYieldTo: ['Draw a card'] };
    expect(isAlwaysYielded(g, item('ability', { yieldKey: 'Draw a card' }))).toBe(true);
    expect(isAlwaysYielded(g, item('ability', { yieldKey: 'Other' }))).toBe(false);
  });
});
