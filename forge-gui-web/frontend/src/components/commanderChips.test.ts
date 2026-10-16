import { describe, expect, it } from 'vitest';
import { GameBuilder } from '../mock/builder';
import { scenarioById } from '../mock/scenarios';
import type { GameView } from '../model/types';
import { commanderChips } from './commanderChips';

const plate = (g: GameView, id: string) => g.players.find((p) => p.id === id)!;

describe('commander damage chips (design pass 4, P5)', () => {
  it('gives one chip per source commander with its controller’s seat and the amount', () => {
    const g = scenarioById('priority').build();
    const chips = commanderChips(g, plate(g, 'you'));
    expect(chips.map((c) => [c.shortName, c.seat, c.amount])).toEqual([
      ['Meren of Clan Nel Toth', 3, 6],
      ['Krenko', 1, 4],
    ]);
  });

  it('writes the hover text with the full name, shape and controller', () => {
    const g = scenarioById('priority').build();
    expect(commanderChips(g, plate(g, 'ana'))[0]!.title).toBe(
      'Krenko, Mob Boss (▲ Mira) has dealt Ana 5 commander damage. 21 eliminates.',
    );
    expect(commanderChips(g, plate(g, 'theo'))[0]!.title).toBe(
      "Sythis, Harvest's Hand (● you) has dealt Theo 3 commander damage. 21 eliminates.",
    );
    expect(commanderChips(g, plate(g, 'you'))[1]!.title).toBe(
      'Krenko, Mob Boss (▲ Mira) has dealt you 4 commander damage. 21 eliminates.',
    );
  });

  it('switches to the burst style from 15 and drops sources at 0', () => {
    const g = scenarioById('priority').build();
    const theo = plate(g, 'theo');
    const [sythis] = theo.commanderDamageTaken.map((x) => x.commanderId) as [string];
    const krenko = Object.values(g.cards).find((c) => c.name === 'Krenko, Mob Boss')!.id;
    const game: GameView = {
      ...g,
      players: g.players.map((p) =>
        p.id === 'theo'
          ? {
              ...p,
              commanderDamageTaken: [
                { commanderId: sythis, amount: 15 },
                { commanderId: krenko, amount: 14 },
                { commanderId: 'gone', amount: 0 },
              ],
            }
          : p,
      ),
    };
    expect(commanderChips(game, plate(game, 'theo')).map((c) => [c.amount, c.danger])).toEqual([
      [15, true],
      [14, false],
    ]);
  });

  it('gives partners two chips', () => {
    const b = new GameBuilder('partners', 'commander');
    b.player('you', 'Hugo', 40, { isAi: false }).player('mira', 'Mira', 40);
    const a = b.card('Krenko, Mob Boss', 'mira', 'battlefield', { commander: true });
    const c = b.card('Goblin Chieftain', 'mira', 'battlefield', { commander: true });
    b.p('you').commanderDamageTaken = [
      { commanderId: a, amount: 2 },
      { commanderId: c, amount: 7 },
    ];
    const g = b.done();
    const chips = commanderChips(g, plate(g, 'you'));
    expect(chips.map((x) => [x.shortName, x.seat, x.amount])).toEqual([
      ['Krenko', 1, 2],
      ['Goblin Chieftain', 1, 7],
    ]);
  });
});
