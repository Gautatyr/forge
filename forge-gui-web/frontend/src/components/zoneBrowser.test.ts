import { describe, expect, it } from 'vitest';
import { scenarioById } from '../mock/scenarios';
import { zoneBrowserCards, zoneTitle } from './zoneBrowser';

const names = (g: ReturnType<typeof game>, ids: string[]) => ids.map((id) => g.cards[id]!.name);
const game = () => scenarioById('priority').build();

describe('large zone view (playtest 1)', () => {
  it('lists the zone newest first, like the side panel', () => {
    const g = game();
    const you = g.players.find((p) => p.isYou)!;
    expect(names(g, zoneBrowserCards(g, you.id, 'graveyard', ''))).toEqual(names(g, [...you.graveyard].reverse()));
    expect(you.graveyard.length).toBeGreaterThanOrEqual(3);
  });

  it('filters by name or type line, case-insensitive, keeping that order', () => {
    const g = game();
    const you = g.players.find((p) => p.isYou)!;
    expect(names(g, zoneBrowserCards(g, you.id, 'graveyard', 'wrath'))).toEqual(['Wrath of God']);
    expect(names(g, zoneBrowserCards(g, you.id, 'graveyard', '  CREATURE '))).toEqual(['Llanowar Elves']);
    expect(zoneBrowserCards(g, you.id, 'graveyard', 'no such card')).toEqual([]);
  });

  it('names whose zone it is', () => {
    const g = game();
    expect(zoneTitle(g, g.youId, 'graveyard')).toBe('Your graveyard');
    expect(zoneTitle(g, 'theo', 'exile')).toBe("Theo's exile");
  });
});
