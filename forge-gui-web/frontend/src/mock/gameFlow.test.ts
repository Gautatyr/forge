import { describe, expect, it } from 'vitest';
import { inPlaceRefs } from '../components/tray/trayLogic';
import type { PromptAnswer } from '../model/intents';
import { opponents, player, you } from '../model/selectors';
import type { ChoicePrompt } from '../model/types';
import { nextPlayer } from '../state/turnStrip';
import { applyIntent, type MockGame } from './engine';
import { scenarioById } from './scenarios';

function prompt(g: MockGame): ChoicePrompt {
  if (g.decision.kind !== 'choice') throw new Error(`no prompt open: ${g.decision.kind}`);
  return g.decision.prompt;
}

const answer = (g: MockGame, a: PromptAnswer) => applyIntent(g, { type: 'answer', promptId: prompt(g).id, answer: a });
const yes = (g: MockGame, v: boolean) => answer(g, { shape: 'yesNo', yes: v });

describe('game start (design pass 4 §2.4)', () => {
  it('toss: "You go first. Play first?" then the opening hand', () => {
    let g = scenarioById('toss').build();
    const toss = prompt(g);
    expect(toss.title).toBe('You go first. Play first?');
    expect(toss.shape === 'yesNo' && [toss.yesLabel, toss.noLabel]).toEqual(['Play first', 'Let {player:mira} start']);
    expect(g.players.every((p) => p.life === 40)).toBe(true);
    g = yes(g, true);
    expect(prompt(g).title).toBe('Opening hand · 7 cards');
    expect(prompt(g).instruction).toContain('Your first mulligan is free.');
  });

  it("opponents' tags show while hands are decided", () => {
    const g = scenarioById('mulligan').build();
    expect(opponents(g).map((p) => p.mulligan)).toEqual([
      { state: 'deciding' },
      { state: 'mulligan', cards: 6 },
      { state: 'kept', cards: 7 },
    ]);
  });

  it('free mulligan, then one that costs a card, then bottoming in place, then play', () => {
    let g = scenarioById('mulligan').build();
    const first = [...you(g).hand];
    g = yes(g, false);
    expect(you(g).hand).toHaveLength(7);
    expect(you(g).hand).not.toEqual(first);
    let p = prompt(g);
    expect(p.shape === 'yesNo' && p.yesLabel).toBe('Keep 7');
    expect(p.instruction).not.toContain('free');

    g = yes(g, false);
    p = prompt(g);
    expect(p.shape === 'yesNo' && p.yesLabel).toBe('Keep · put 1 on the bottom');

    const library = you(g).libraryCount;
    g = yes(g, true);
    p = prompt(g);
    expect(p.title).toBe('Choose 1 card to put on the bottom of your library');
    expect(inPlaceRefs(g, p)?.cards.size).toBe(7);
    const bottom = you(g).hand[2]!;
    g = answer(g, { shape: 'chooseN', optionIds: [bottom] });
    expect(you(g).hand).toHaveLength(6);
    expect(you(g).hand).not.toContain(bottom);
    expect(you(g).libraryCount).toBe(library + 1);
    expect(g.decision.kind).toBe('priority');
    expect(g.players.every((p) => p.mulligan === undefined)).toBe(true);
    expect(g.log.at(-1)?.text).toMatch(/game begins/i);
  });

  it('keeping 7 starts the game at once', () => {
    let g = scenarioById('mulligan').build();
    g = yes(g, true);
    expect(g.decision.kind).toBe('priority');
    expect(you(g).hand).toHaveLength(7);
  });
});

describe('players leaving (design pass 4 §2.6)', () => {
  it('an opponent is out: logged, board gone, their commander damage dropped, next skips them', () => {
    let g = scenarioById('player-out').build();
    const krenko = player(g, 'mira').commanders[0]!;
    expect(player(g, 'theo').hasLost).toBe(false);
    g = applyIntent(g, { type: 'primary' });
    const theo = player(g, 'theo');
    expect(theo.hasLost).toBe(true);
    expect(theo.out).toEqual({ turn: g.turn.number, reason: { kind: 'commanderDamage', amount: 21, commanderName: 'Krenko, Mob Boss' } });
    expect(theo.battlefield).toEqual([]);
    expect(g.log.at(-1)).toMatchObject({ playerId: 'theo', text: `Theo is out: 21 commander damage from {card:${krenko}}.` });
    const talrand = theo.commanders[0]!;
    expect(you(g).commanderDamageTaken.some((x) => x.commanderId === talrand)).toBe(false);
    expect(nextPlayer(g)?.id).toBe('ana');
    expect(g.result).toBeUndefined();
  });

  it('concede in a 4-player game: you are out and the others keep playing', () => {
    let g = scenarioById('priority').build();
    g = applyIntent(g, { type: 'concede' });
    expect(you(g).hasLost).toBe(true);
    expect(you(g).out?.reason).toEqual({ kind: 'conceded' });
    expect(g.result).toBeUndefined();
    expect(g.decision.kind).toBe('waiting');
    expect(g.log.at(-1)?.text).toBe('Hugo concedes.');
    // Conceding twice changes nothing.
    expect(applyIntent(g, { type: 'concede' })).toBe(g);
  });

  it('concede in 1v1 ends the game: the opponent wins', () => {
    let g = scenarioById('duel').build();
    g = applyIntent(g, { type: 'concede' });
    expect(g.result).toEqual({ winnerId: 'ai', reason: 'Last player standing.', ranking: ['ai', 'you'], nextGame: false });
  });

  // Forge removes a loser's objects only while more than 2 players are in the game (Game.onPlayerLost, CR 800.4a).
  it('1v1: the loser keeps their cards, so "View the board" shows the final board', () => {
    const before = scenarioById('duel').build();
    const mine = { battlefield: [...you(before).battlefield], hand: [...you(before).hand] };
    expect(mine.battlefield.length).toBeGreaterThan(0);
    const g = applyIntent(before, { type: 'concede' });
    expect(you(g).battlefield).toEqual(mine.battlefield);
    expect(you(g).hand).toEqual(mine.hand);
    expect(mine.battlefield.every((id) => g.cards[id]?.zone === 'battlefield')).toBe(true);
  });

  it('4-player: players out early leave with their cards; the last one out keeps theirs', () => {
    let g = scenarioById('player-out').build();
    g = applyIntent(g, { type: 'primary' }); // Theo out, 4 in the game: removed
    expect(player(g, 'theo').battlefield).toEqual([]);
    g = applyIntent(g, { type: 'concede' }); // you out, 3 in the game: removed
    expect(you(g).battlefield).toEqual([]);
    const anaField = [...player(g, 'ana').battlefield];
    expect(anaField.length).toBeGreaterThan(0);
    player(g, 'ana').life = 0;
    g = applyIntent(g, { type: 'setAutoPass', on: true }); // Ana out, 2 in the game: the game ends, her board stays
    expect(g.result?.winnerId).toBe('mira');
    expect(player(g, 'ana').battlefield).toEqual(anaField);
  });

  it('game over scenario (you won): the last opponent out keeps their board', () => {
    const g = scenarioById('game-over-next').build();
    expect(player(g, 'mira').battlefield.length).toBeGreaterThan(0);
    expect(player(g, 'theo').battlefield).toEqual([]);
    expect(player(g, 'ana').battlefield).toEqual([]);
  });

  it('the last player standing wins; the ranking runs from the winner back through who went out last', () => {
    let g = scenarioById('player-out').build();
    g = applyIntent(g, { type: 'primary' }); // Theo out
    g = applyIntent(g, { type: 'concede' }); // you out
    expect(g.result).toBeUndefined();
    const ana = player(g, 'ana');
    ana.life = 0;
    g = applyIntent(g, { type: 'setAutoPass', on: true }); // the mock checks who is out after every intent that changes the game
    expect(g.result?.winnerId).toBe('mira');
    expect(g.result?.ranking).toEqual(['mira', 'ana', 'you', 'theo']);
  });

  it('next game opens a new opening hand', () => {
    let g = scenarioById('game-over-next').build();
    expect(g.result?.nextGame).toBe(true);
    g = applyIntent(g, { type: 'nextGame' });
    expect(g.result).toBeUndefined();
    expect(g.id).not.toBe('game-over-next');
    expect(prompt(g).title).toBe('Opening hand · 7 cards');
    expect(g.players.every((p) => !p.hasLost && p.life === 40)).toBe(true);
  });
});
