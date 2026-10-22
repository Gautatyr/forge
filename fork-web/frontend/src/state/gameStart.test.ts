import { describe, expect, it } from 'vitest';
import { applyIntent, type MockGame } from '../mock/engine';
import { scenarioById } from '../mock/scenarios';
import { bottomPrompt, mulliganPrompt, mulliganTag, turnHeading, turnPlayerId } from './gameStart';

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

  it('after a mulligan the hand is already bottomed: the next one draws 7 and says how many go back (pass 2 #3)', () => {
    const p = mulliganPrompt({ handSize: 6, toBottom: 0, freeNext: false, draw: 7, nextBottom: 2 });
    expect(p.title).toBe('Opening hand · 6 cards');
    expect(p.instruction).toBe('Keep these cards, or shuffle and draw 7 new ones, then put 2 on the bottom.');
    expect(p.yesLabel).toBe('Keep 6');
    expect(mulliganPrompt({ handSize: 6, toBottom: 0, freeNext: false, draw: 7, nextBottom: 1 }).instruction).toContain('then put 1 on the bottom.');
    expect(mulliganPrompt({ handSize: 7, toBottom: 0, freeNext: true, draw: 7, nextBottom: 0 }).instruction).toBe(
      'Keep these cards, or shuffle and draw 7 new ones. Your first mulligan is free.',
    );
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

describe('no turn before turn 1 or after the game (top bar, plates, step strip)', () => {
  const play = (g: MockGame, yes: boolean) =>
    applyIntent(g, { type: 'answer', promptId: g.decision.kind === 'choice' ? g.decision.prompt.id : '', answer: { shape: 'yesNo', yes } });

  it('toss and opening hands: no active player, no step, no turn order', () => {
    let g = scenarioById('toss').build();
    expect(g.starting).toBe(true);
    expect(turnPlayerId(g)).toBeUndefined();
    expect(turnHeading(g)).toEqual({ kind: 'start', text: 'Game start' });
    g = play(g, false); // Let Mira start
    expect(g.starting).toBe(true);
    expect(turnPlayerId(g)).toBeUndefined();
    expect(turnHeading(g)).toEqual({ kind: 'start', text: 'Opening hands' });
    g = play(g, true); // Keep 7
    expect(g.starting).toBeUndefined();
    expect(turnPlayerId(g)).toBe('mira');
    expect(turnHeading(g)).toEqual({ kind: 'turn', playerId: 'mira', number: 1, nextId: 'theo' });
  });

  it('the mulligan scenario and the next game of a match start the same way', () => {
    expect(turnHeading(scenarioById('mulligan').build())).toEqual({ kind: 'start', text: 'Opening hands' });
    const next = applyIntent(scenarioById('game-over-next').build(), { type: 'nextGame' });
    expect(turnPlayerId(next)).toBeUndefined();
    expect(turnHeading(next)).toEqual({ kind: 'start', text: 'Opening hands' });
  });

  it('game over: the headline instead of a turn, no step, no "next:"', () => {
    const won = scenarioById('game-over-next').build();
    expect(turnPlayerId(won)).toBeUndefined();
    expect(turnHeading(won)).toEqual({ kind: 'over', playerId: undefined, text: 'You won' });
    const lost = scenarioById('game-over').build();
    expect(turnHeading(lost)).toEqual({ kind: 'over', playerId: 'mira', text: 'Mira won' });
  });

  it('mid-game: whose turn and who is next', () => {
    const g = scenarioById('player-out').build();
    expect(turnPlayerId(g)).toBe('mira');
    expect(turnHeading(g)).toEqual({ kind: 'turn', playerId: 'mira', number: 12, nextId: 'theo' });
  });
});
