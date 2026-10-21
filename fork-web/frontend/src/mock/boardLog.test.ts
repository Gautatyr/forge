import { describe, expect, it } from 'vitest';
import type { Intent } from '../model/intents';
import { applyIntent, type MockGame } from './engine';
import { scenarioById } from './scenarios';

const run = (g: MockGame, ...intents: Intent[]) => intents.reduce(applyIntent, g);
const newEntries = (before: MockGame, after: MockGame) => after.log.slice(before.log.length);

describe('mock log for Recent (design pass 4, P6)', () => {
  it('stamps every entry with the player whose turn it was', () => {
    const g = scenarioById('priority').build();
    // commanderTable logs turn 8: Ana's turn (seats you, Mira, Theo, Ana; turn 9 is yours).
    expect(g.log.filter((e) => e.turn === 8).map((e) => e.turnPlayerId)).toEqual(['ana', 'ana', 'ana']);
    expect(g.log.filter((e) => e.turn === 9).map((e) => e.turnPlayerId)).toEqual(['you', 'you']);
    const after = run(g, { type: 'primary' });
    expect(newEntries(g, after).length).toBeGreaterThan(0);
    expect(newEntries(g, after).every((e) => e.turnPlayerId === 'you')).toBe(true);
  });

  it('marks the line where you lose a permanent', () => {
    // Mira's Lightning Bolt on your Eidolon resolves when you pass.
    const g = scenarioById('priority').build();
    const after = run(g, { type: 'primary' });
    const lines = newEntries(g, after);
    const dies = lines.find((e) => e.text.endsWith(' dies.'));
    expect(dies?.youLost).toBe('permanent');
    expect(lines.filter((e) => e !== dies).every((e) => e.youLost === undefined)).toBe(true);
  });

  it('marks the line where you lose life', () => {
    // Board scenario: Mira's Lightning Bolt aimed at you is on top of the stack.
    const g = scenarioById('board').build();
    const before = g.players[0]!.life;
    const after = run(g, { type: 'primary' });
    expect(after.players[0]!.life).toBe(before - 3);
    const lost = newEntries(g, after).filter((e) => e.youLost);
    expect(lost.map((e) => e.youLost)).toEqual(['life']);
  });

  it('does not mark an opponent losing life', () => {
    const g = scenarioById('board').build();
    const top = g.stack[g.stack.length - 1]!;
    const aimed: MockGame = { ...g, stack: [...g.stack.slice(0, -1), { ...top, targets: [{ kind: 'player', id: 'theo' }] }] };
    const after = run(aimed, { type: 'primary' });
    expect(after.players.find((p) => p.id === 'theo')!.life).toBe(g.players.find((p) => p.id === 'theo')!.life - 3);
    expect(newEntries(aimed, after).some((e) => e.youLost)).toBe(false);
  });

  it('drops a flashback card from the cast list once it is cast', () => {
    const g = scenarioById('hand9').build();
    const peace = g.players[0]!.graveyard.find((id) => g.cards[id]!.name === "Moment's Peace")!;
    expect(g.players[0]!.otherZoneCasts).toEqual([{ cardId: peace, via: 'flashback' }]);
    const after = run(g, { type: 'play', cardId: peace }, { type: 'payAuto' });
    expect(after.cards[peace]!.zone).toBe('stack');
    expect(after.players[0]!.otherZoneCasts).toEqual([]);
  });
});
