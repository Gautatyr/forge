import { describe, expect, it } from 'vitest';
import { scenarioById } from '../mock/scenarios';
import type { GameView } from '../model/types';
import { DEFAULT_PREFS } from '../state/prefs';
import { INITIAL_UI } from '../state/ui';
import { commandEntries, groupPermanents } from './battlefieldGroups';

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

describe('commander in the command zone (design pass 4, P3)', () => {
  it('leaves your own commander out of your support row: the hand shows it', () => {
    const g = scenarioById('hand9').build();
    expect(g.players[0]!.command).toHaveLength(1);
    expect(commandEntries(g.players[0]!, g)).toEqual([]);
  });

  it('keeps an opponent’s commander in their support row, with its tax', () => {
    const g = scenarioById('hand9').build();
    const theo = g.players.find((p) => p.id === 'theo')!;
    expect(commandEntries(theo, g).map((e) => [e.card.name, e.caption])).toEqual([
      ['Talrand, Sky Summoner', { label: 'Command zone', detail: 'tax +4' }],
    ]);
  });
});
