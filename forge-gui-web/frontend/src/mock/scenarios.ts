import { GameBuilder, ref } from './builder';
import type { CardKey } from './cardDb';
import { cultivatePrompt, type MockGame } from './engine';

export interface Scenario {
  id: string;
  label: string;
  description: string;
  build: () => MockGame;
}

interface CommanderIds {
  sythis: string;
  eidolon: string;
  knight: string;
  champion: string;
  spirit: string;
  krenko: string;
  chieftain: string;
  prospector: string;
  goblins: string[];
  meren: string;
  talrand: string;
}

/**
 * The shared 4-player Commander board: you (Sythis enchantress), Mira
 * (Krenko goblins), Theo (Talrand spells), Ana (Meren aristocrats).
 */
function commanderTable(b: GameBuilder, opts: { sythisInCommand?: boolean } = {}): CommanderIds {
  b.player('you', 'Hugo', 34, { libraryCount: 61, isAi: false })
    .player('mira', 'Mira', 24, { libraryCount: 70, handCount: 4 })
    .player('theo', 'Theo', 31, { libraryCount: 58, handCount: 6 })
    .player('ana', 'Ana', 22, { libraryCount: 66, handCount: 3, counters: [{ kind: 'Experience', count: 4 }] });

  // --- You -----------------------------------------------------------------
  const sythis = opts.sythisInCommand
    ? b.card("Sythis, Harvest's Hand", 'you', 'command', { commander: true })
    : b.card("Sythis, Harvest's Hand", 'you', 'battlefield', { commander: true });
  b.p('you').commanderCasts[sythis] = 1;
  if (!opts.sythisInCommand) b.card('Swiftfoot Boots', 'you', 'battlefield', { attachTo: sythis });
  else b.card('Swiftfoot Boots', 'you', 'battlefield');
  const eidolon = b.card('Eidolon of Blossoms', 'you', 'battlefield');
  const knight = b.card('Knight of Autumn', 'you', 'battlefield', { counters: [{ kind: '+1/+1', count: 2 }] });
  b.card('Rancor', 'you', 'battlefield', { attachTo: knight });
  const champion = b.card('Setessan Champion', 'you', 'battlefield', { counters: [{ kind: '+1/+1', count: 3 }] });
  const spirit = b.card('Selfless Spirit', 'you', 'battlefield', { sick: true });
  b.card('Elvish Mystic', 'you', 'battlefield', { tapped: true });
  b.card('Sigil of the Empty Throne', 'you', 'battlefield');
  b.many(3, 'Angel token', 'you', 'battlefield', { token: true });
  b.many(2, 'Forest', 'you', 'battlefield', { tapped: true });
  b.many(3, 'Forest', 'you', 'battlefield');
  b.card('Plains', 'you', 'battlefield', { tapped: true });
  b.many(3, 'Plains', 'you', 'battlefield');
  for (const k of ['Temple Garden', 'Command Tower', 'Krosan Verge'] as CardKey[]) b.card(k, 'you', 'battlefield');
  b.card("Moment's Peace", 'you', 'graveyard');
  b.card('Wrath of God', 'you', 'graveyard');
  b.card('Llanowar Elves', 'you', 'graveyard');
  b.card('Mesa Enchantress', 'you', 'exile');

  // --- Mira: Krenko goblins --------------------------------------------------
  const krenko = b.card('Krenko, Mob Boss', 'mira', 'battlefield', { commander: true, tapped: true });
  b.p('mira').commanderCasts[krenko] = 1;
  const chieftain = b.card('Goblin Chieftain', 'mira', 'battlefield');
  const prospector = b.card('Skirk Prospector', 'mira', 'battlefield');
  const goblins = b.many(6, 'Goblin token', 'mira', 'battlefield', { token: true });
  b.card('Goblin Bombardment', 'mira', 'battlefield');
  b.card('Impact Tremors', 'mira', 'battlefield');
  b.card('Sol Ring', 'mira', 'battlefield', { tapped: true });
  b.many(2, 'Mountain', 'mira', 'battlefield', { tapped: true });
  b.many(5, 'Mountain', 'mira', 'battlefield');
  b.card('Goblin Matron', 'mira', 'graveyard');
  b.card('Lightning Bolt', 'mira', 'graveyard');
  b.card('Goblin Guide', 'mira', 'exile');

  // --- Theo: Talrand spells (commander in the command zone) -----------------
  const talrand = b.card('Talrand, Sky Summoner', 'theo', 'command', { commander: true });
  b.p('theo').commanderCasts[talrand] = 2;
  b.card('Rhystic Study', 'theo', 'battlefield');
  b.card('Search for Azcanta', 'theo', 'battlefield', { transformed: true });
  b.card('Sol Ring', 'theo', 'battlefield');
  b.card('Arcane Signet', 'theo', 'battlefield');
  b.many(2, 'Drake token', 'theo', 'battlefield', { token: true });
  b.many(6, 'Island', 'theo', 'battlefield');
  b.card('Mystic Sanctuary', 'theo', 'battlefield');
  b.card('Counterspell', 'theo', 'graveyard');
  b.card('Brainstorm', 'theo', 'graveyard');
  b.card('Ponder', 'theo', 'graveyard');

  // --- Ana: Meren aristocrats --------------------------------------------------
  const meren = b.card('Meren of Clan Nel Toth', 'ana', 'battlefield', { commander: true });
  b.p('ana').commanderCasts[meren] = 0;
  b.card('Sakura-Tribe Elder', 'ana', 'battlefield');
  b.card('Eternal Witness', 'ana', 'battlefield', { sick: true });
  b.card('Viscera Seer', 'ana', 'battlefield');
  b.card('Phyrexian Arena', 'ana', 'battlefield');
  b.many(4, 'Swamp', 'ana', 'battlefield');
  b.many(3, 'Forest', 'ana', 'battlefield', { tapped: true });
  b.card('Overgrown Tomb', 'ana', 'battlefield');
  b.card('Plaguecrafter', 'ana', 'graveyard');
  b.card('Cultivate', 'ana', 'graveyard');
  b.card('Fleshbag Marauder', 'ana', 'exile');

  // Commander damage so far.
  b.p('you').commanderDamageTaken = [
    { commanderId: meren, amount: 6 },
    { commanderId: krenko, amount: 4 },
  ];
  b.p('theo').commanderDamageTaken = [{ commanderId: sythis, amount: 3 }];
  b.p('ana').commanderDamageTaken = [{ commanderId: krenko, amount: 5 }];

  b.log(`${ref(krenko)} creates 5 Goblin tokens.`, 'mira', 8)
    .log(`Impact Tremors deals 5 damage to each opponent.`, 'mira', 8)
    .log(`${ref(meren)} attacks Hugo; Hugo takes 3 damage.`, 'ana', 8);

  return { sythis, eidolon, knight, champion, spirit, krenko, chieftain, prospector, goblins, meren, talrand };
}

function yourHand(b: GameBuilder, keys: CardKey[]) {
  for (const k of keys) b.card(k, 'you', 'hand');
}

const HAND_7: CardKey[] = [
  'Path to Exile',
  'Heroic Intervention',
  "Enchantress's Presence",
  'Beast Within',
  'Cultivate',
  'Forest',
  "Emeria's Call",
];
const HAND_9: CardKey[] = [...HAND_7, 'Smothering Tithe', 'Sanctum Weaver'];
const HAND_12: CardKey[] = [...HAND_9, "Mirari's Wake", 'Generous Gift', 'Destiny Spinner'];

export const SCENARIOS: Scenario[] = [
  {
    id: 'priority',
    label: '1 · Commander: your main phase, 2 on the stack',
    description: 'Your turn 9, main 1. You cast Swords on Meren; Mira responded with Lightning Bolt on your Eidolon.',
    build: () => {
      const b = new GameBuilder('priority', 'commander');
      const ids = commanderTable(b);
      yourHand(b, HAND_7);
      b.turn(9, 'you', 'main1', 'you');
      const swords = b.card('Swords to Plowshares', 'you', 'graveyard');
      const bolt = b.card('Lightning Bolt', 'mira', 'graveyard');
      // Move both onto the stack.
      for (const [id, owner] of [
        [swords, 'you'],
        [bolt, 'mira'],
      ] as const) {
        const p = b.p(owner);
        p.graveyard.splice(p.graveyard.indexOf(id), 1);
        b.g.cards[id]!.zone = 'stack';
      }
      b.g.stack = [
        {
          id: 's1',
          sourceCardId: swords,
          controllerId: 'you',
          kind: 'spell',
          text: 'Exile target creature. Its controller gains life equal to its power.',
          targets: [{ kind: 'card', id: ids.meren }],
        },
        {
          id: 's2',
          sourceCardId: bolt,
          controllerId: 'mira',
          kind: 'spell',
          text: 'Lightning Bolt deals 3 damage to any target.',
          targets: [{ kind: 'card', id: ids.eidolon }],
        },
      ];
      b.p('you').landsPlayedThisTurn = 1;
      b.log(`Hugo casts ${ref(swords)} targeting ${ref(ids.meren)}.`, 'you')
        .log(`Mira casts ${ref(bolt)} targeting ${ref(ids.eidolon)}.`, 'mira');
      return b.done();
    },
  },
  {
    id: 'blockers',
    label: '2 · Commander: declare blockers',
    description: 'Mira attacks: Krenko, Goblin Chieftain and two Goblins at you, Skirk Prospector at Theo.',
    build: () => {
      const b = new GameBuilder('blockers', 'commander');
      const ids = commanderTable(b);
      yourHand(b, HAND_7);
      b.turn(10, 'mira', 'declareBlockers', undefined);
      const attackers = [ids.krenko, ids.chieftain, ids.goblins[0]!, ids.goblins[1]!];
      for (const id of [...attackers, ids.prospector]) b.g.cards[id]!.tapped = true;
      b.g.combat = {
        attacks: [
          ...attackers.map((attackerId) => ({ attackerId, defenderId: 'you' })),
          { attackerId: ids.prospector, defenderId: 'theo' },
        ],
        blocks: [],
      };
      const candidates = [ids.sythis, ids.eidolon, ids.knight, ids.champion, ids.spirit].concat(
        b.p('you').battlefield.filter((id) => b.g.cards[id]!.isToken),
      );
      b.g.cards[ids.spirit]!.summoningSick = false;
      b.g.decision = { kind: 'declareBlockers', candidates, attackers, draft: [] };
      b.log('Mira attacks Hugo with 4 creatures and Theo with 1.', 'mira', 10);
      return b.done();
    },
  },
  {
    id: 'scry',
    label: '3a · Choice tray: scry 2',
    description: 'You played Temple of Plenty: scry 2. The tray asks; the board stays visible.',
    build: () => {
      const b = new GameBuilder('scry', 'commander');
      commanderTable(b);
      yourHand(b, HAND_7.filter((k) => k !== 'Forest'));
      b.turn(9, 'you', 'main1', 'you');
      const temple = b.card('Temple of Plenty', 'you', 'battlefield', { tapped: true });
      b.p('you').landsPlayedThisTurn = 1;
      const top1 = b.card('Mesa Enchantress', 'you', 'library');
      const top2 = b.card('Plains', 'you', 'library');
      b.g.decision = {
        kind: 'choice',
        prompt: {
          id: 'scry',
          shape: 'order',
          title: 'Scry 2',
          instruction: 'Look at the top two cards of your library. Put any number on the bottom and the rest on top in any order.',
          sourceCardId: temple,
          confirmLabel: 'Confirm scry',
          lists: [
            {
              id: 'top',
              label: 'Top of library',
              hint: 'Leftmost is drawn first',
              items: [
                { id: top1, label: 'Mesa Enchantress', cardId: top1 },
                { id: top2, label: 'Plains', cardId: top2 },
              ],
            },
            { id: 'bottom', label: 'Bottom of library', hint: 'Order does not matter', items: [] },
          ],
        },
      };
      b.log(`Hugo plays ${ref(temple)}.`, 'you');
      return b.done();
    },
  },
  {
    id: 'search',
    label: '3b · Choice tray: choose up to 2',
    description: 'Cultivate resolves: choose up to two basic lands from your library.',
    build: () => {
      const b = new GameBuilder('search', 'commander');
      commanderTable(b);
      yourHand(b, HAND_7.filter((k) => k !== 'Cultivate'));
      b.turn(9, 'you', 'main1', 'you');
      const cultivate = b.card('Cultivate', 'you', 'graveyard');
      b.g.decision = { kind: 'choice', prompt: cultivatePrompt(b.g, cultivate) };
      b.log(`Hugo casts ${ref(cultivate)}.`, 'you');
      return b.done();
    },
  },
  {
    id: 'duel',
    label: '4 · 1v1: your main phase',
    description: 'Constructed 1v1 against the AI. Your turn 6, main 1, stack empty.',
    build: () => {
      const b = new GameBuilder('duel', 'constructed');
      b.player('you', 'Hugo', 17, { libraryCount: 47, isAi: false }).player('ai', 'Forge AI', 12, {
        libraryCount: 46,
        handCount: 3,
      });
      b.card('Steel Leaf Champion', 'you', 'battlefield');
      b.card('Old-Growth Troll', 'you', 'battlefield', { counters: [{ kind: '+1/+1', count: 1 }] });
      b.card('Questing Beast', 'you', 'battlefield', { sick: true });
      b.card('Llanowar Elves', 'you', 'battlefield', { tapped: true });
      b.many(2, 'Forest', 'you', 'battlefield', { tapped: true });
      b.many(4, 'Forest', 'you', 'battlefield');
      b.card('Lightning Bolt', 'ai', 'graveyard');
      b.card('Lightning Bolt', 'ai', 'graveyard');
      b.card('Elvish Mystic', 'you', 'graveyard');
      b.card('Monastery Swiftspear', 'ai', 'battlefield', { tapped: true });
      const hero = b.card('Heartfire Hero', 'ai', 'battlefield', { counters: [{ kind: '+1/+1', count: 2 }] });
      b.card('Eidolon of the Great Revel', 'ai', 'battlefield');
      b.card('Bonecrusher Giant', 'ai', 'battlefield', { damage: 2 });
      b.many(3, 'Mountain', 'ai', 'battlefield', { tapped: true });
      b.many(2, 'Mountain', 'ai', 'battlefield');
      b.card('Goblin Guide', 'ai', 'exile');
      yourHand(b, ['Ram Through', 'Primeval Titan', 'Forest', 'Beast Within', 'Cultivate']);
      b.turn(6, 'you', 'main1', 'you');
      b.log(`Forge AI attacks with ${ref(hero)}; Hugo takes 3 damage.`, 'ai', 5).log('Hugo draws a card.', 'you');
      return b.done();
    },
  },
  {
    id: 'hand9',
    label: '5a · Hand of 9 (+2 castable elsewhere)',
    description: 'Nine cards in hand stay readable with no overlap. Sythis can be recast from the command zone, Moment\'s Peace with flashback.',
    build: () => {
      const b = new GameBuilder('hand9', 'commander');
      commanderTable(b, { sythisInCommand: true });
      yourHand(b, HAND_9);
      b.turn(9, 'you', 'main1', 'you');
      return b.done();
    },
  },
  {
    id: 'hand12',
    label: '5b · Hand of 12 (overflow)',
    description: 'Twelve cards: the hand staggers so every name and cost stays visible; overlap falls on the art only.',
    build: () => {
      const b = new GameBuilder('hand12', 'commander');
      commanderTable(b, { sythisInCommand: true });
      yourHand(b, HAND_12);
      b.turn(9, 'you', 'main1', 'you');
      return b.done();
    },
  },
];

export function scenarioById(id: string): Scenario {
  return SCENARIOS.find((s) => s.id === id) ?? SCENARIOS[0]!;
}
