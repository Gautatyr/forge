import { isCreature, isLand } from '../model/selectors';
import type { ChoicePrompt, DistributeRecipient } from '../model/types';
import { GameBuilder, ref } from './builder';
import { cardNames, type CardKey } from './cardDb';
import { applyIntent, cultivatePrompt, type MockGame } from './engine';

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
  b.card('Tolarian Terror', 'theo', 'battlefield');
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
  b.card('Vampire Nighthawk', 'ana', 'battlefield');
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
    .log(`Impact Tremors deals 5 damage to each opponent.`, 'mira', 8, 'life')
    .log(`${ref(meren)} attacks Hugo; Hugo takes 3 damage.`, 'ana', 8, 'life');

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
const HAND_10: CardKey[] = [...HAND_9, "Mirari's Wake"];
const HAND_12: CardKey[] = [...HAND_9, "Mirari's Wake", 'Generous Gift', 'Destiny Spinner'];
const HAND_15: CardKey[] = [...HAND_12, 'Doubling Season', 'Mesa Enchantress', 'Plains'];

function handScenario(id: string, label: string, description: string, keys: CardKey[]): Scenario {
  return {
    id,
    label,
    description,
    build: () => {
      const b = new GameBuilder(id, 'commander');
      commanderTable(b, { sythisInCommand: true });
      yourHand(b, keys);
      b.turn(9, 'you', 'main1', 'you');
      return b.done();
    },
  };
}

/**
 * Choice-tray scenarios (design pass 4 §2.2, issue #30): the shared table,
 * your turn 9 main 1 unless `open` changes it, with a prompt open.
 */
function trayScenario(
  id: string,
  label: string,
  description: string,
  open: (b: GameBuilder, ids: CommanderIds) => ChoicePrompt,
): Scenario {
  return {
    id,
    label,
    description,
    build: () => {
      const b = new GameBuilder(id, 'commander');
      const ids = commanderTable(b);
      yourHand(b, HAND_7);
      b.turn(9, 'you', 'main1', 'you');
      b.g.decision = { kind: 'choice', prompt: open(b, ids) };
      return b.done();
    },
  };
}

const TRAY_SCENARIOS: Scenario[] = [
  trayScenario(
    'sacrifice',
    '3c · Choose in place: sacrifice a creature',
    "Ana's Fleshbag Marauder: you pick one of your creatures on the board. The tray is a one-line bar.",
    (b) => {
      b.turn(9, 'ana', 'main1', 'ana');
      const fleshbag = b.card('Fleshbag Marauder', 'ana', 'battlefield', { sick: true });
      b.log(`Ana casts ${ref(fleshbag)}.`, 'ana');
      const creatures = b.p('you').battlefield.filter((id) => isCreature(b.g.cards[id]!));
      return {
        id: 'sacrifice',
        shape: 'chooseN',
        title: 'Choose a creature to sacrifice',
        instruction: 'Fleshbag Marauder: each player sacrifices a creature.',
        sourceCardId: fleshbag,
        confirmLabel: 'Sacrifice',
        min: 1,
        max: 1,
        options: creatures.map((id) => ({ id, label: b.g.cards[id]!.name, cardId: id })),
      };
    },
  ),
  trayScenario(
    'choose-player',
    '3d · Choose in place: an opponent',
    'Choose a player: their plates light up and take the selected state.',
    (b) => ({
      id: 'choose-player',
      shape: 'chooseN',
      title: 'Choose an opponent',
      instruction: 'The chosen opponent draws a card, and so do you.',
      confirmLabel: 'Choose',
      min: 1,
      max: 1,
      options: ['mira', 'theo', 'ana'].map((id) => ({ id, label: b.p(id).name, playerId: id })),
    }),
  ),
  trayScenario('modes', '3e · Choose one: modes as chips', "Knight of Autumn's enter trigger: three modes as text chips.", (_b, ids) => ({
    id: 'modes',
    shape: 'chooseN',
    title: 'Choose one — Knight of Autumn',
    instruction: 'When this creature enters, choose one.',
    sourceCardId: ids.knight,
    confirmLabel: 'Choose',
    min: 1,
    max: 1,
    options: [
      { id: 'counters', label: 'Put two +1/+1 counters on this creature.' },
      { id: 'destroy', label: 'Destroy target artifact or enchantment.' },
      { id: 'life', label: 'You gain 4 life.' },
    ],
  })),
  trayScenario('colour', '3f · Choose a colour', 'Sanctum Weaver adds mana of any one colour: five symbols with their names.', (b) => {
    const weaver = b.card('Sanctum Weaver', 'you', 'battlefield', { tapped: true });
    const colours: [string, string][] = [
      ['W', 'White'],
      ['U', 'Blue'],
      ['B', 'Black'],
      ['R', 'Red'],
      ['G', 'Green'],
    ];
    return {
      id: 'colour',
      shape: 'chooseN',
      title: 'Choose a color',
      instruction: 'Sanctum Weaver: add X mana of any one color, where X is the number of enchantments you control.',
      sourceCardId: weaver,
      confirmLabel: 'Choose',
      min: 1,
      max: 1,
      options: colours.map(([s, name]) => ({ id: s, label: name, symbol: `{${s}}` })),
    };
  }),
  trayScenario('tutor', '3g · Choose from a long list (filter)', "Primeval Titan: 16 land cards, so the tray gets a filter box and scrolls.", (b) => {
    const titan = b.card('Primeval Titan', 'you', 'battlefield', { sick: true });
    const keys: CardKey[] = [
      'Forest', 'Forest', 'Forest', 'Plains', 'Plains', 'Temple Garden', 'Command Tower', 'Krosan Verge', 'Overgrown Tomb',
      'Mystic Sanctuary', 'Snow-Covered Forest', 'Snow-Covered Plains', 'Temple of Plenty', 'Island', 'Swamp', 'Mountain',
    ];
    const lands = keys.map((k) => b.card(k, 'you', 'library'));
    b.log(`Hugo casts ${ref(titan)}.`, 'you');
    return {
      id: 'tutor',
      shape: 'chooseN',
      title: 'Choose up to 2 land cards',
      instruction: 'Primeval Titan: search your library for up to two land cards, put them onto the battlefield tapped, then shuffle.',
      sourceCardId: titan,
      confirmLabel: 'Put onto the battlefield',
      min: 0,
      max: 2,
      options: lands.map((id) => ({ id, label: b.g.cards[id]!.name, cardId: id })),
    };
  }),
  trayScenario('optional', '3h · Yes / no: optional trigger', 'The source card is in the tray header; Y, N, Space.', (b) => {
    const sigil = b.p('you').battlefield.find((id) => b.g.cards[id]!.name === 'Sigil of the Empty Throne')!;
    return {
      id: 'optional',
      shape: 'yesNo',
      title: "Use Sigil of the Empty Throne's ability?",
      instruction: 'Create a 4/4 white Angel creature token with flying.',
      sourceCardId: sigil,
      confirmLabel: 'Yes',
      yesLabel: 'Yes',
      noLabel: 'No',
    };
  }),
  trayScenario(
    'commander-zone',
    '3i · Yes / no: commander moving zones',
    "Ana's Beast Within destroys Sythis: move it to the command zone (default) or leave it in the graveyard.",
    (b, ids) => {
      // Sythis is between zones while the game asks: off the battlefield, Boots unattached.
      const you = b.p('you');
      you.battlefield.splice(you.battlefield.indexOf(ids.sythis), 1);
      const sythis = b.g.cards[ids.sythis]!;
      for (const a of sythis.attachments) b.g.cards[a]!.attachedTo = undefined;
      sythis.attachments = [];
      sythis.zone = 'stack';
      const beast = b.card('Beast Within', 'ana', 'graveyard');
      b.log(`Ana casts ${ref(beast)} targeting ${ref(ids.sythis)}.`, 'ana');
      return {
        id: `commander-zone:${ids.sythis}`,
        shape: 'yesNo',
        title: "Sythis, Harvest's Hand would go to your graveyard.",
        instruction: 'Your commander can go to the command zone instead.',
        confirmLabel: 'Move to command zone',
        yesLabel: 'Move to command zone',
        noLabel: 'Leave it in the graveyard',
        defaultAnswer: 'yes',
        cardId: ids.sythis,
      };
    },
  ),
  trayScenario('triggers', '3j · Order: simultaneous triggers', 'Four of your abilities trigger at once: one column, the top resolves first.', (b, ids) => {
    const sigil = b.p('you').battlefield.find((id) => b.g.cards[id]!.name === 'Sigil of the Empty Throne')!;
    const presence = b.card("Enchantress's Presence", 'you', 'graveyard');
    b.log(`Hugo casts ${ref(presence)}.`, 'you');
    const items = [
      { id: 't-eidolon', label: 'Eidolon of Blossoms: draw a card.', cardId: ids.eidolon },
      { id: 't-champion', label: 'Setessan Champion: put a +1/+1 counter on it and draw a card.', cardId: ids.champion },
      { id: 't-sythis', label: "Sythis, Harvest's Hand: gain 1 life and draw a card.", cardId: ids.sythis },
      { id: 't-sigil', label: 'Sigil of the Empty Throne: create a 4/4 white Angel token with flying.', cardId: sigil },
    ];
    return {
      id: 'triggers',
      shape: 'order',
      title: 'Order your triggers',
      instruction: 'Your abilities triggered at the same time. Put them in the order they resolve.',
      confirmLabel: 'Put on the stack',
      lists: [{ id: 'stack', label: 'Resolves first', hint: '', items }],
    };
  }),
  trayScenario('reveal', '3k · Reveal: Mira reveals', "Mira's Goblin Matron finds a Goblin: one card at hand size, OK (Space). Also logged in Recent.", (b) => {
    b.turn(10, 'mira', 'main1', 'mira');
    const matron = b.card('Goblin Matron', 'mira', 'battlefield', { sick: true });
    const found = b.card('Goblin Chieftain', 'mira', 'library');
    b.log(`Mira casts ${ref(matron)}.`, 'mira').log(`Mira reveals ${ref(found)}.`, 'mira');
    return {
      id: 'reveal',
      shape: 'chooseN',
      title: 'Mira reveals',
      instruction: 'Goblin Matron: Mira searches her library for a Goblin card and puts it into her hand.',
      sourceCardId: matron,
      byPlayerId: 'mira',
      confirmLabel: 'OK',
      min: 0,
      max: 0,
      options: [{ id: found, label: 'Goblin Chieftain', cardId: found }],
    };
  }),
  trayScenario('look', '3l · Look: top 3 of your library', 'Three cards at hand size with hover previews; OK (Space).', (b) => {
    const top = (['Doubling Season', 'Plains', 'Mesa Enchantress'] as CardKey[]).map((k) => b.card(k, 'you', 'library'));
    b.log('Hugo looks at the top 3 cards of their library.', 'you');
    return {
      id: 'look',
      shape: 'chooseN',
      title: 'You look at the top 3 cards of your library',
      instruction: 'They stay on top in this order.',
      confirmLabel: 'OK',
      min: 0,
      max: 0,
      options: top.map((id) => ({ id, label: b.g.cards[id]!.name, cardId: id })),
    };
  }),
  trayScenario('ability-menu', '3m · Ability menu: Krosan Verge', 'The engine asks which ability: a menu anchored to the card, keys 1–2, Esc.', (b) => {
    const verge = b.p('you').battlefield.find((id) => b.g.cards[id]!.name === 'Krosan Verge')!;
    return {
      id: `ability:${verge}`,
      shape: 'chooseN',
      title: 'Choose an ability to activate',
      instruction: 'Krosan Verge has two abilities. Choose one.',
      sourceCardId: verge,
      confirmLabel: 'Choose an ability',
      min: 1,
      max: 1,
      abilityMenu: true,
      options: [
        { id: 'mana', cost: '{T}', label: 'Add {C}.' },
        {
          id: 'search',
          cost: '{2}{T}',
          label: 'Sacrifice this land: Search your library for a Forest card and a Plains card, put them onto the battlefield tapped, then shuffle.',
        },
      ],
    };
  }),
];

/** Combat damage assignment (§2.3): `attacker` (yours) is blocked by `blockers`; the prompt opens after P/T are computed. */
function combatDamagePrompt(g: MockGame, attacker: string, blockers: string[], defenderId: string): ChoicePrompt {
  const a = g.cards[attacker]!;
  const has = (k: string) => a.keywords.some((x) => x.name === k);
  const deathtouch = has('Deathtouch');
  const trample = has('Trample');
  const defender = g.players.find((p) => p.id === defenderId)!;
  const recipients: DistributeRecipient[] = blockers.map((id) => {
    const c = g.cards[id]!;
    const left = Math.max(0, (c.toughness ?? 0) - c.damage);
    return { id, label: c.name, cardId: id, lethal: deathtouch ? Math.min(1, left) : left };
  });
  if (trample) recipients.push({ id: defenderId, label: defender.name, playerId: defenderId });
  const names = blockers.map((id) => g.cards[id]!.name).join(' and ');
  return {
    id: `combat-damage:${attacker}`,
    shape: 'distribute',
    title: `Assign ${a.name}'s ${a.power ?? 0} damage`,
    instruction: trample
      ? `Blocked by ${names}. With trample, damage beyond lethal can go to ${defender.name}.`
      : `Blocked by ${names}.`,
    sourceCardId: attacker,
    confirmLabel: 'Assign damage',
    total: a.power ?? 0,
    recipients,
    combat: { attackerId: attacker, deathtouch, trampleId: trample ? defenderId : undefined },
  };
}

/** Number shapes (design pass 4 §2.3, issue #31): distribute, combat damage, X, name a card. */
const NUMBER_SCENARIOS: Scenario[] = [
  trayScenario('divide', '7a · Divide 5 damage among 3 targets', "Fiery Justice: one row per target with a stepper, at least 1 each; confirm at 0 left. Tab, ↑/↓, Shift+↑/↓.", (b, ids) => {
    const justice = b.card('Fiery Justice', 'you', 'graveyard');
    b.log(`Hugo casts ${ref(justice)}.`, 'you');
    return {
      id: 'divide',
      shape: 'distribute',
      title: 'Divide 5 damage among 3 targets',
      instruction: 'Fiery Justice deals 5 damage divided as you choose. Each target gets at least 1.',
      sourceCardId: justice,
      confirmLabel: 'Divide damage',
      total: 5,
      recipients: [
        { id: ids.krenko, label: 'Krenko, Mob Boss', cardId: ids.krenko, min: 1 },
        { id: ids.chieftain, label: 'Goblin Chieftain', cardId: ids.chieftain, min: 1 },
        { id: 'mira', label: 'Mira', playerId: 'mira', min: 1 },
      ],
    };
  }),
  {
    id: 'combat-damage',
    label: '7b · Combat damage: trample',
    description:
      'Knight of Autumn (6/3 trample with Rancor) is blocked by two of Ana\'s creatures. Opens on the automatic assignment: Space accepts it. Ana\'s row waits for lethal on every blocker.',
    build: () => {
      const b = new GameBuilder('combat-damage', 'commander');
      const ids = commanderTable(b);
      yourHand(b, HAND_7);
      b.turn(9, 'you', 'combatDamage', undefined);
      const blockers = ['Vampire Nighthawk', 'Sakura-Tribe Elder'].map((n) => b.p('ana').battlefield.find((id) => b.g.cards[id]!.name === n)!);
      b.g.cards[ids.knight]!.tapped = true;
      b.g.combat = { attacks: [{ attackerId: ids.knight, defenderId: 'ana' }], blocks: blockers.map((blockerId) => ({ blockerId, attackerId: ids.knight })) };
      b.log(`Hugo attacks Ana with ${ref(ids.knight)}.`, 'you').log('Ana blocks with Vampire Nighthawk and Sakura-Tribe Elder.', 'ana');
      const g = b.done();
      g.decision = { kind: 'choice', prompt: combatDamagePrompt(g, ids.knight, blockers, 'ana') };
      return g;
    },
  },
  {
    id: 'combat-deathtouch',
    label: '7c · Combat damage: deathtouch',
    description: 'Questing Beast (deathtouch, no trample) is blocked by two creatures: "Lethal 1 · deathtouch", the rest on the last blocker.',
    build: () => {
      const b = new GameBuilder('combat-deathtouch', 'constructed');
      b.player('you', 'Hugo', 17, { libraryCount: 47, isAi: false }).player('ai', 'Forge AI', 12, { libraryCount: 46, handCount: 3 });
      const beast = b.card('Questing Beast', 'you', 'battlefield'); // vigilance: attacks untapped
      b.many(4, 'Forest', 'you', 'battlefield');
      const giant = b.card('Bonecrusher Giant', 'ai', 'battlefield');
      const hero = b.card('Heartfire Hero', 'ai', 'battlefield', { counters: [{ kind: '+1/+1', count: 2 }] });
      b.many(3, 'Mountain', 'ai', 'battlefield');
      yourHand(b, ['Ram Through', 'Forest', 'Beast Within']);
      b.turn(6, 'you', 'combatDamage', undefined);
      b.g.combat = { attacks: [{ attackerId: beast, defenderId: 'ai' }], blocks: [giant, hero].map((blockerId) => ({ blockerId, attackerId: beast })) };
      b.log(`Hugo attacks with ${ref(beast)}.`, 'you').log(`Forge AI blocks with ${ref(giant)} and ${ref(hero)}.`, 'ai');
      const g = b.done();
      g.decision = { kind: 'choice', prompt: combatDamagePrompt(g, beast, [giant, hero], 'ai') };
      return g;
    },
  },
  {
    id: 'x-cost',
    label: "7d · Number: X for Green Sun's Zenith",
    description: 'Casting an X spell asks for X first: stepper and typed field, range shown, opens on the default. Then payment opens with X in the cost.',
    build: () => {
      const b = new GameBuilder('x-cost', 'commander');
      commanderTable(b, { sythisInCommand: true });
      yourHand(b, ["Green Sun's Zenith", 'Heroic Intervention', 'Path to Exile', 'Cultivate', 'Forest']);
      b.turn(9, 'you', 'main1', 'you');
      b.p('you').landsPlayedThisTurn = 1;
      const g = b.done();
      const gsz = g.players[0]!.hand.find((id) => g.cards[id]!.name === "Green Sun's Zenith")!;
      return applyIntent(g, { type: 'play', cardId: gsz });
    },
  },
  trayScenario('name-card', '7e · Name a card', 'Meddling Mage enters: type a name, up to 8 suggestions with cost and type line, ↑/↓ shows each preview, Enter picks.', (b) => {
    const mage = b.card('Meddling Mage', 'you', 'battlefield', { sick: true });
    b.log(`Hugo casts ${ref(mage)}.`, 'you');
    return {
      id: 'name-card',
      shape: 'input',
      kind: 'cardName',
      title: 'Choose a card name',
      instruction: "Meddling Mage: spells with the chosen name can't be cast.",
      sourceCardId: mage,
      confirmLabel: 'Name this card',
      constraint: 'Name a nonland card',
      cardNames: cardNames().filter((n) => !/\bLand\b/.test(n.typeLine)),
    };
  }),
];

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
    id: 'stack6',
    label: '1b · Commander: a 6-item stack',
    description: 'Six items on the stack, three players responding. Only the top item lights its targets; hover another to see its own.',
    build: () => {
      const b = new GameBuilder('stack6', 'commander');
      const ids = commanderTable(b);
      yourHand(b, HAND_7);
      b.turn(9, 'you', 'main1', 'you');
      const onBattlefield = (owner: string, name: string) =>
        b.p(owner).battlefield.find((id) => b.g.cards[id]!.name === name)!;
      const bombardment = onBattlefield('mira', 'Goblin Bombardment');
      const rhystic = onBattlefield('theo', 'Rhystic Study');
      const sigil = onBattlefield('you', 'Sigil of the Empty Throne');
      const swords = b.card('Swords to Plowshares', 'you', 'stack');
      const bolt = b.card('Lightning Bolt', 'mira', 'stack');
      const beast = b.card('Beast Within', 'ana', 'stack');
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
        {
          id: 's3',
          sourceCardId: rhystic,
          controllerId: 'theo',
          kind: 'trigger',
          text: 'Theo may draw a card unless Mira pays {1}.',
          targets: [],
        },
        {
          id: 's4',
          sourceCardId: bombardment,
          controllerId: 'mira',
          kind: 'ability',
          text: 'Goblin Bombardment deals 1 damage to Theo.',
          targets: [{ kind: 'player', id: 'theo' }],
        },
        {
          id: 's5',
          sourceCardId: beast,
          controllerId: 'ana',
          kind: 'spell',
          text: 'Destroy target permanent. Its controller creates a 3/3 green Beast creature token.',
          targets: [{ kind: 'card', id: sigil }],
        },
        {
          id: 's6',
          sourceCardId: bombardment,
          controllerId: 'mira',
          kind: 'ability',
          text: 'Goblin Bombardment deals 1 damage to Hugo.',
          targets: [{ kind: 'player', id: 'you' }],
        },
      ];
      b.p('you').landsPlayedThisTurn = 1;
      b.log(`Hugo casts ${ref(swords)} targeting ${ref(ids.meren)}.`, 'you')
        .log(`Mira casts ${ref(bolt)} targeting ${ref(ids.eidolon)}.`, 'mira')
        .log(`${ref(rhystic)} triggers for Theo.`, 'theo')
        .log(`Mira sacrifices a Goblin: ${ref(bombardment)} targets Theo.`, 'mira')
        .log(`Ana casts ${ref(beast)} targeting ${ref(sigil)}.`, 'ana')
        .log(`Mira sacrifices a Goblin: ${ref(bombardment)} targets Hugo.`, 'mira');
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
      const runAmok = b.card('Run Amok', 'mira', 'graveyard');
      b.g.eotEffects[ids.krenko] = [{ sourceId: runAmok, sourceName: 'Run Amok', power: 3, toughness: 3, keywords: ['Trample'] }];
      b.log('Mira attacks Hugo with 4 creatures and Theo with 1.', 'mira', 10).log(
        `Mira casts ${ref(runAmok)} on ${ref(ids.krenko)}: +3/+3 and trample until end of turn.`,
        'mira',
        10,
      );
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
  ...TRAY_SCENARIOS,
  ...NUMBER_SCENARIOS,
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
    id: 'keywords',
    label: '4b · 1v1: keyword icons',
    description:
      'Every kind of keyword icon: printed and added by another card (Swiftfoot Boots, Avacyn), the generic icons, +N chips, a tapped card. Hold Alt for words.',
    build: () => {
      const b = new GameBuilder('keywords', 'constructed');
      b.player('you', 'Hugo', 18, { libraryCount: 44, isAi: false }).player('ai', 'Forge AI', 15, {
        libraryCount: 45,
        handCount: 4,
      });
      const hawk = b.card('Vampire Nighthawk', 'you', 'battlefield');
      b.card('Swiftfoot Boots', 'you', 'battlefield', { attachTo: hawk });
      b.card('Questing Beast', 'you', 'battlefield');
      b.card('Fencing Ace', 'you', 'battlefield', { tapped: true });
      b.card('Giant Spider', 'you', 'battlefield');
      b.card('Wall of Omens', 'you', 'battlefield');
      b.card('Noble Hierarch', 'you', 'battlefield', { tapped: true });
      b.card('Monastery Swiftspear', 'you', 'battlefield', { sick: true });
      b.many(3, 'Forest', 'you', 'battlefield');
      b.many(2, 'Plains', 'you', 'battlefield', { tapped: true });
      b.card('Avacyn, Angel of Hope', 'ai', 'battlefield');
      b.card('Silver Knight', 'ai', 'battlefield');
      b.card('Knight of Grace', 'ai', 'battlefield', { damage: 1 });
      b.card('Tolarian Terror', 'ai', 'battlefield');
      b.card("Ulamog's Crusher", 'ai', 'battlefield', { tapped: true });
      b.card('Bloated Contaminator', 'ai', 'battlefield');
      b.card('Boggart Brute', 'ai', 'battlefield');
      b.many(3, 'Plains', 'ai', 'battlefield');
      b.many(3, 'Island', 'ai', 'battlefield', { tapped: true });
      yourHand(b, ['Path to Exile', 'Heroic Intervention', 'Forest', 'Beast Within']);
      b.turn(7, 'you', 'main1', 'you');
      b.log('Hugo draws a card.', 'you');
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
  handScenario(
    'hand10',
    '5b · Hand of 10 (overflow starts)',
    'Ten cards: beyond nine the hand staggers right away at full size, with no shrinking step first.',
    HAND_10,
  ),
  handScenario(
    'hand12',
    '5c · Hand of 12 (overflow)',
    'Twelve cards: the hand staggers so every name and cost stays visible; overlap falls on the art only.',
    HAND_12,
  ),
  handScenario('hand15', '5d · Hand of 15 (overflow)', 'Fifteen cards, still staggered at full size.', HAND_15),
  {
    id: 'board',
    label: '5e · Catching up: Mira’s Bolt at you',
    description:
      'Mira’s turn 10. Recent has a divider per turn; lines where you lost life or a permanent are bold. Pass: the Bolt resolves and your plate shows ▼ −3 for 4 s. Sythis shows only beside the hand; Moment’s Peace stays there although every land is tapped. Commander damage chips name their source (Theo’s Krenko chip is past 15); Mira has {R}{R} floating.',
    build: () => {
      const b = new GameBuilder('board', 'commander');
      const ids = commanderTable(b, { sythisInCommand: true });
      yourHand(b, HAND_7);
      for (const id of b.p('you').battlefield) {
        const c = b.g.cards[id]!;
        if (isLand(c) || c.name === 'Elvish Mystic') c.tapped = true;
      }
      b.turn(10, 'mira', 'main1', 'you');
      b.p('you').landsPlayedThisTurn = 0;
      b.p('mira').manaPool = { R: 2 };
      b.p('theo').commanderDamageTaken = [
        { commanderId: ids.sythis, amount: 3 },
        { commanderId: ids.krenko, amount: 16 },
      ];
      b.p('ana').commanderDamageTaken = [
        { commanderId: ids.krenko, amount: 5 },
        { commanderId: ids.sythis, amount: 2 },
      ];
      const oldBolt = b.card('Lightning Bolt', 'mira', 'graveyard');
      // Cast from Mira's hand: built in her graveyard (keeps her hand count), then moved to the stack.
      const bolt = b.card('Lightning Bolt', 'mira', 'graveyard');
      const mira = b.p('mira');
      mira.graveyard.splice(mira.graveyard.indexOf(bolt), 1);
      b.g.cards[bolt]!.zone = 'stack';
      b.g.stack = [
        {
          id: 's1',
          sourceCardId: bolt,
          controllerId: 'mira',
          kind: 'spell',
          text: 'Lightning Bolt deals 3 damage to any target.',
          targets: [{ kind: 'player', id: 'you' }],
        },
      ];
      b.log('Hugo draws a card.', 'you', 9)
        .log(`Hugo casts ${ref(ids.eidolon)}.`, 'you', 9)
        .log(`Mira casts ${ref(oldBolt)} targeting ${ref(ids.sythis)}.`, 'mira', 9)
        .log(`${ref(ids.sythis)} dies; Hugo moves it to the command zone.`, 'you', 9, 'permanent')
        .log('Hugo ends the turn.', 'you', 9)
        .log('Mira draws a card.', 'mira', 10)
        .log(`${ref(ids.krenko)} creates 5 Goblin tokens.`, 'mira', 10)
        .log('Impact Tremors deals 5 damage to each opponent.', 'mira', 10, 'life')
        .log('Mira adds {R}{R}.', 'mira', 10)
        .log(`Mira casts ${ref(bolt)} targeting Hugo.`, 'mira', 10);
      return b.done();
    },
  },
  {
    id: 'payment',
    label: '6 · Payment: Sythis with tax, {G}{G} floating',
    description:
      'Paying {2}{G}{W} for Sythis by hand: click lands (Temple Garden and Command Tower ask for a colour), click a floating {G}, Z undoes a tap, Space pays the rest, Esc cancels. Then try Green Sun\'s Zenith (X first) or click a land to float mana.',
    build: () => {
      const b = new GameBuilder('payment', 'commander');
      commanderTable(b, { sythisInCommand: true });
      yourHand(b, ["Green Sun's Zenith", 'Heroic Intervention', 'Path to Exile', 'Cultivate', 'Forest', 'Primeval Titan']);
      b.turn(9, 'you', 'main1', 'you');
      b.p('you').landsPlayedThisTurn = 1;
      b.p('you').manaPool = { G: 2 };
      b.log('Hugo adds {G}{G} with two Forests.', 'you');
      const g = b.done();
      return applyIntent(g, { type: 'play', cardId: g.players[0]!.command[0]! });
    },
  },
];

export function scenarioById(id: string): Scenario {
  return SCENARIOS.find((s) => s.id === id) ?? SCENARIOS[0]!;
}
