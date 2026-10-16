/**
 * Game start and end scenarios (design pass 4 §2.4, §2.6, issue #32): the
 * toss, the London mulligan, players leaving, concede and the result.
 */
import { player } from '../model/selectors';
import { GameBuilder, ref } from './builder';
import { applyIntent, priorityDecision, type MockGame } from './engine';
import { checkOut, finishIfOver, markOut, startOpeningHands, tossPrompt } from './gameFlow';
import type { Scenario } from './scenarios';

interface Ids {
  sythis: string;
  krenko: string;
  talrand: string;
  meren: string;
}

/** You (Sythis), Mira (Krenko), Theo (Talrand), Ana (Meren). `opening`: 40 life, commanders in the command zone, empty boards. */
function table(b: GameBuilder, opening: boolean): Ids {
  const life = (n: number) => (opening ? 40 : n);
  b.player('you', 'Hugo', life(27), { libraryCount: opening ? 92 : 71, isAi: false })
    .player('mira', 'Mira', life(33), { libraryCount: opening ? 92 : 70, handCount: opening ? 0 : 3 })
    .player('theo', 'Theo', life(31), { libraryCount: opening ? 92 : 64, handCount: opening ? 0 : 5 })
    .player('ana', 'Ana', life(19), { libraryCount: opening ? 92 : 68, handCount: opening ? 0 : 2 });
  const zone = opening ? 'command' : 'battlefield';
  const sythis = b.card("Sythis, Harvest's Hand", 'you', zone, { commander: true });
  const krenko = b.card('Krenko, Mob Boss', 'mira', zone, { commander: true, tapped: !opening });
  const talrand = b.card('Talrand, Sky Summoner', 'theo', zone, { commander: true });
  const meren = b.card('Meren of Clan Nel Toth', 'ana', zone, { commander: true });
  for (const p of b.g.players) for (const c of p.commanders) p.commanderCasts[c] = opening ? 0 : 1;
  if (opening) return { sythis, krenko, talrand, meren };

  b.card('Eidolon of Blossoms', 'you', 'battlefield');
  b.card('Setessan Champion', 'you', 'battlefield', { counters: [{ kind: '+1/+1', count: 2 }] });
  b.many(4, 'Forest', 'you', 'battlefield');
  b.many(3, 'Plains', 'you', 'battlefield');
  b.card('Temple Garden', 'you', 'battlefield');
  for (const k of ['Path to Exile', 'Heroic Intervention', 'Cultivate'] as const) b.card(k, 'you', 'hand');

  b.card('Goblin Chieftain', 'mira', 'battlefield');
  b.many(4, 'Goblin token', 'mira', 'battlefield', { token: true });
  b.card('Goblin Bombardment', 'mira', 'battlefield');
  b.card('Sol Ring', 'mira', 'battlefield');
  b.many(6, 'Mountain', 'mira', 'battlefield');

  b.card('Rhystic Study', 'theo', 'battlefield');
  b.many(2, 'Drake token', 'theo', 'battlefield', { token: true });
  b.card('Arcane Signet', 'theo', 'battlefield');
  b.many(6, 'Island', 'theo', 'battlefield');

  b.card('Viscera Seer', 'ana', 'battlefield');
  b.card('Sakura-Tribe Elder', 'ana', 'battlefield');
  b.card('Phyrexian Arena', 'ana', 'battlefield');
  b.many(4, 'Swamp', 'ana', 'battlefield');
  b.many(2, 'Forest', 'ana', 'battlefield');

  b.p('you').commanderDamageTaken = [
    { commanderId: talrand, amount: 5 },
    { commanderId: krenko, amount: 8 },
  ];
  b.p('ana').commanderDamageTaken = [{ commanderId: sythis, amount: 6 }];
  return { sythis, krenko, talrand, meren };
}

/** Opponents' opening-hand tags as the spec shows them. */
function opponentsDeciding(g: MockGame) {
  for (const p of g.players) if (!p.isYou) p.handCount = 7;
  player(g, 'mira').mulligan = { state: 'deciding' };
  player(g, 'theo').mulligan = { state: 'mulligan', cards: 6 };
  player(g, 'ana').mulligan = { state: 'kept', cards: 7 };
}

function mulliganGame(id: string): MockGame {
  const b = new GameBuilder(id, 'commander');
  table(b, true);
  b.turn(1, 'you', 'main1');
  const g = b.done();
  startOpeningHands(g, 'you');
  opponentsDeciding(g);
  return g;
}

function midGame(id: string): { g: MockGame; ids: Ids } {
  const b = new GameBuilder(id, 'commander');
  const ids = table(b, false);
  b.turn(12, 'mira', 'main1', 'mira');
  b.log(`${ref(ids.krenko)} creates 5 Goblin tokens.`, 'mira').log('Ana sacrifices Plaguecrafter to Viscera Seer.', 'ana');
  b.g.decision = { kind: 'waiting', forPlayerId: 'mira', what: 'Mira is taking their turn' };
  return { g: b.done(), ids };
}

const at = (g: MockGame, turn: number) => {
  g.turn.number = turn;
  return g;
};

export const START_END_SCENARIOS: Scenario[] = [
  {
    id: 'toss',
    label: '7a · Toss: play first?',
    description: 'You won the toss: "Play first" (Y, Space) or "Let ▲ Mira start" (N). Then the opening hand.',
    build: () => {
      const b = new GameBuilder('toss', 'commander');
      table(b, true);
      b.turn(1, 'you', 'main1');
      const g = b.done();
      g.decision = { kind: 'choice', prompt: tossPrompt(g) };
      return g;
    },
  },
  {
    id: 'mulligan',
    label: '7b · Opening hand: London mulligan',
    description:
      'Keep 7 (Space) or Mulligan (M); the first mulligan is free. Mulligan twice to see "Keep · put 1 on the bottom". Opponents: Deciding…, Mulligan → 6, Kept 7.',
    build: () => mulliganGame('mulligan'),
  },
  {
    id: 'mulligan-bottom',
    label: '7c · Mulligan: put 1 on the bottom',
    description: 'After a free mulligan and a second one: choose in your hand the card to put on the bottom ("0 of 1 chosen", Put on bottom).',
    build: () => {
      let g = mulliganGame('mulligan-bottom');
      for (const yes of [false, false, true]) {
        g = applyIntent(g, { type: 'answer', promptId: g.decision.kind === 'choice' ? g.decision.prompt.id : '', answer: { shape: 'yesNo', yes } });
      }
      return g;
    },
  },
  {
    id: 'player-out',
    label: '7d · An opponent is out',
    description:
      "Mira's Krenko attacks Theo (17 commander damage from Krenko). Pass priority (Space): Theo is out, a toast shows for 5 s, his column leaves and Talrand's damage drops from your plate. Table falls back to Columns.",
    build: () => {
      const { g, ids } = midGame('player-out');
      player(g, 'theo').commanderDamageTaken = [{ commanderId: ids.krenko, amount: 17 }];
      g.turn = { number: 12, activePlayerId: 'mira', step: 'declareBlockers', priorityPlayerId: 'you' };
      g.combat = { attacks: [{ attackerId: ids.krenko, defenderId: 'theo' }], blocks: [] };
      g.log.push({ id: 'l-attack', turn: 12, playerId: 'mira', text: `${ref(ids.krenko)} attacks Theo.` });
      g.decision = priorityDecision(g);
      return g;
    },
  },
  {
    id: 'you-out',
    label: '7e · You are out',
    description: '21 commander damage from Krenko: the dialog offers "Watch the rest" (Esc) or "Back to lobby". Watching: the action block reads "Watching".',
    build: () => {
      const { g, ids } = midGame('you-out');
      player(g, 'you').commanderDamageTaken = [{ commanderId: ids.krenko, amount: 21 }];
      checkOut(g);
      return g;
    },
  },
  {
    id: 'game-over',
    label: '7f · Game over: ▲ Mira won',
    description: 'The end-of-game panel: ranking, Back to lobby (Enter), View the board (Esc, keeps a top-bar chip).',
    build: () => {
      const { g, ids } = midGame('game-over');
      markOut(at(g, 12), player(g, 'theo'), { kind: 'commanderDamage', amount: 21, commanderName: 'Krenko, Mob Boss' }, ids.krenko);
      markOut(at(g, 13), player(g, 'ana'), { kind: 'life', life: 0 });
      markOut(at(g, 14), player(g, 'you'), { kind: 'life', life: -2 });
      finishIfOver(g);
      return g;
    },
  },
  {
    id: 'game-over-next',
    label: '7g · Game over: you won, next game',
    description: 'You won game 1 of the match: the main button is "Next game" (Enter), which deals the next opening hand.',
    build: () => {
      const { g, ids } = midGame('game-over-next');
      g.gamesLeft = 1;
      markOut(at(g, 9), player(g, 'theo'), { kind: 'conceded' });
      markOut(at(g, 11), player(g, 'ana'), { kind: 'commanderDamage', amount: 21, commanderName: "Sythis, Harvest's Hand" }, ids.sythis);
      markOut(at(g, 13), player(g, 'mira'), { kind: 'life', life: 0 });
      finishIfOver(g);
      return g;
    },
  },
];
