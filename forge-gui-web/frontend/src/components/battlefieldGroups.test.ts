import { describe, expect, it } from 'vitest';
import { scenarioById } from '../mock/scenarios';
import type { GameView } from '../model/types';
import { DEFAULT_PREFS } from '../state/prefs';
import { INITIAL_UI } from '../state/ui';
import { battlefieldRows, groupPermanents } from './battlefieldGroups';
import { commandZoneChips } from './commandZone';

/** stack6 with both Goblin Bombardment activations (s4 below, s6 on top) aimed at two of Mira's Goblin tokens. */
function twoGoblinTargets() {
  const g = scenarioById('stack6').build();
  const mira = g.players.find((p) => p.id === 'mira')!;
  const goblins = mira.battlefield.filter((id) => g.cards[id]!.isToken && g.cards[id]!.name.includes('Goblin'));
  expect(goblins.length).toBeGreaterThanOrEqual(3);
  const [a, b] = goblins as [string, string];
  const game: GameView = {
    ...g,
    stack: g.stack.map((s) =>
      s.id === 's4' ? { ...s, targets: [{ kind: 'card', id: a }] } : s.id === 's6' ? { ...s, targets: [{ kind: 'card', id: b }] } : s,
    ),
  };
  return { game, cards: mira.battlefield.map((id) => game.cards[id]!), a, b, goblins };
}

describe('battlefield grouping keeps targeted tokens apart (review of PR 16)', () => {
  it('gives each token a stack item targets its own entry', () => {
    const { game, cards, a, b } = twoGoblinTargets();
    const entries = groupPermanents(cards, game, INITIAL_UI, DEFAULT_PREFS);
    const entryOf = (id: string) => entries.find((e) => e.ids.includes(id))!;
    expect(entryOf(a).ids).toEqual([a]);
    expect(entryOf(b).ids).toEqual([b]);
  });

  it('splits them again when the spotlight moves to the lower item', () => {
    const { game, cards, a, b } = twoGoblinTargets();
    const entries = groupPermanents(cards, game, { ...INITIAL_UI, hoveredStackItem: 's4' }, DEFAULT_PREFS);
    const entryOf = (id: string) => entries.find((e) => e.ids.includes(id))!;
    expect(entryOf(a).ids).toEqual([a]);
    expect(entryOf(b).ids).toEqual([b]);
  });

  it('keeps two tokens apart when one stack item targets both', () => {
    const { game, cards, a, b } = twoGoblinTargets();
    const both: GameView = {
      ...game,
      stack: game.stack.map((s) => (s.id === 's6' ? { ...s, targets: [{ kind: 'card', id: a }, { kind: 'card', id: b }] } : s.id === 's4' ? { ...s, targets: [] } : s)),
    };
    const entries = groupPermanents(cards, both, INITIAL_UI, DEFAULT_PREFS);
    expect(entries.find((e) => e.ids.includes(a))!.ids).toEqual([a]);
    expect(entries.find((e) => e.ids.includes(b))!.ids).toEqual([b]);
  });

  it('still groups the untargeted tokens together', () => {
    const { game, cards, goblins } = twoGoblinTargets();
    const rest = goblins.slice(2);
    const entries = groupPermanents(cards, game, INITIAL_UI, DEFAULT_PREFS);
    expect(entries.find((e) => e.ids.includes(rest[0]!))!.ids.sort()).toEqual([...rest].sort());
  });
});

describe('commander in the command zone (pass 4 P3, playtest 1)', () => {
  const ids = (rows: ReturnType<typeof battlefieldRows>) => [...rows.creatures, ...rows.support].flatMap((e) => e.ids);

  it('never draws a commander in the command zone on a board: yours or an opponent’s', () => {
    const g = scenarioById('hand9').build();
    expect(g.players.filter((p) => p.command.length > 0).map((p) => p.isYou)).toEqual(expect.arrayContaining([true, false]));
    for (const p of g.players) {
      const rows = battlefieldRows(p, g, INITIAL_UI, DEFAULT_PREFS);
      for (const id of p.command) expect(ids(rows)).not.toContain(id);
      expect(ids(rows).sort()).toEqual(p.battlefield.filter((id) => !g.cards[id]!.attachedTo).sort());
    }
  });

  it('gives an opponent a command-zone chip naming the commander and its tax', () => {
    const g = scenarioById('hand9').build();
    const theo = g.players.find((p) => p.id === 'theo')!;
    const talrand = theo.command[0]!;
    expect(commandZoneChips(theo, g)).toEqual([
      { cardId: talrand, tax: 4, title: "Talrand, Sky Summoner is in Theo's command zone. Commander tax +4." },
    ]);
  });

  it('gives you no chip: your commander shows beside your hand', () => {
    const g = scenarioById('hand9').build();
    expect(commandZoneChips(g.players[0]!, g)).toEqual([]);
  });

  it('says when there is no tax yet', () => {
    const g = scenarioById('hand9').build();
    const theo = g.players.find((p) => p.id === 'theo')!;
    const fresh = { ...theo, commanderCasts: {} };
    expect(commandZoneChips(fresh, g)[0]!.title).toBe("Talrand, Sky Summoner is in Theo's command zone. No commander tax yet.");
  });
});
