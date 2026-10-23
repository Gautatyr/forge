import { describe, expect, it } from 'vitest';
import { engineLog, engineNotice, engineText, faceDownLookup, resolveFilters, stripCardIds, targetInstruction, tellApart, unlessChoice, youGrammar } from './engineText';

// Strings are the engine's own (InputSelectTargets, ChangeZoneEffect, TriggeredAbility, the web log), as seen in playtests 1 and 2.
describe('engineText: engine words → player words', () => {
  it('strips engine card ids (pass 1 #1)', () => {
    expect(stripCardIds('Use triggered ability of Noxious Gearhulk (62)?')).toBe('Use triggered ability of Noxious Gearhulk?');
    expect(engineText('Triggered by: Ruin Rat (247)')).toBe('Triggered by: Ruin Rat');
    expect(engineText("Return Wurmcoil Engine (248) to its owner's hand")).toBe("Return Wurmcoil Engine to its owner's hand");
    // words in parentheses stay, and so do the card tokens the log builds
    expect(engineText('(4 more can be targeted)')).toBe('(4 more can be targeted)');
    expect(engineText('{card:12} dies (Deck)')).toBe('{card:12} dies (Deck)');
  });

  it('drops stray separators around a line (pass 1 #2, #5)', () => {
    expect(engineText('Beseech the Mirror (65) -')).toBe('Beseech the Mirror');
    expect(engineText('- Select an artifact creature card or Vehicle card milled this way')).toBe(
      'Select an artifact creature card or Vehicle card milled this way',
    );
    expect(engineText(' - Discard\nDiscard 2 card(s)')).toBe('Discard\nDiscard 2 card(s)');
    // a minus sign is not a separator
    expect(engineText('-1: Untap up to four target permanents.')).toBe('-1: Untap up to four target permanents.');
    expect(engineText('Choose one:')).toBe('Choose one:');
  });

  it('keeps a list of cards that share a name', () => {
    expect(engineText('Goblin (45)\nGoblin (46)')).toBe('Goblin\nGoblin');
  });

  it('shows a repeated line once (pass 1 #7)', () => {
    expect(engineText('- Herald of Anguish - Creature 5 / 5\nHerald of Anguish - Creature 5 / 5\nChoose artifact to tap for Improvise.\nRemaining mana cost is {5}{B}{B}')).toBe(
      'Herald of Anguish - Creature 5 / 5\nChoose artifact to tap for Improvise.\nRemaining mana cost is {5}{B}{B}',
    );
  });

  it('turns a raw engine filter into words (pass 1 #3)', () => {
    expect(engineText('Select target Artifact.cmcLTX+YouCtrl')).toBe('Select target artifact with lesser mana value you control');
    expect(resolveFilters('Select target Creature.OppCtrl')).toBe('Select target creature an opponent controls');
    expect(resolveFilters('Select target Permanent.nonLand+Other+YouCtrl')).toBe('Select target other non-land permanent you control');
    expect(resolveFilters('Select target Creature.powerLE2')).toBe('Select target creature with power 2 or less');
    expect(resolveFilters('Select target Creature.withFlying+tapped')).toBe('Select target tapped creature with flying');
    // a property the words don't know is hidden, not shown
    expect(resolveFilters('Select target Land.Snow+SomethingNew')).toBe('Select target snow land');
    expect(resolveFilters('Select target Card.Zzz')).toBe('Select target card');
    // plain text is left alone
    expect(resolveFilters('Select up to 2 cards from your library. Then shuffle.')).toBe('Select up to 2 cards from your library. Then shuffle.');
  });

  it('leaves card names with dots alone (review round 1)', () => {
    // every card name in forge-gui/res/cardsfolder with a letter-dot-letter (grep '^Name:')
    const names = [
      'A.I.M. Bot',
      'A.I.M. Labs',
      'A.I.M. Scientists',
      'A.I.M. Synthoids',
      'Agents of S.H.I.E.L.D.',
      'B.O.B. (Bevy of Beebles)',
      'C.A.M.P.',
      'Big Apple, 3 a.m.',
      'M.O.D.O.K.',
      'M.O.D.O.K., Evil Intellect',
      'H.E.R.B.I.E., Lovable Robot',
      'H.E.R.B.I.E. Scout Unit',
      'Summon: G.F. Cerberus',
      'U.S.Agent, John Walker',
      'U.S.S. Enterprise-D, Galaxy-Class',
      'Nick Fury, Agent of S.H.I.E.L.D.',
      'Quake, Agent of S.H.I.E.L.D.',
      'S.H.I.E.L.D. Helicarrier',
      'S.H.I.E.L.D. Flying Car',
      'S.H.I.E.L.D. Spy Kit',
      'S.H.I.E.L.D. Deployment Drone',
      'Scientist Supreme of A.I.M.',
      'Summon: G.F. Ifrit',
      'V.A.T.S.',
    ];
    for (const n of names) expect(engineText(n)).toBe(n);
    expect(engineText('Cast M.O.D.O.K. (33)?')).toBe('Cast M.O.D.O.K.?');
    expect(engineText('Select target Creature.YouCtrl or M.O.D.O.K.')).toBe('Select target creature you control or M.O.D.O.K.');
    // a subtype filter is recognised by its properties
    expect(resolveFilters('Select target Goblin.Other+YouCtrl')).toBe('Select target other goblin you control');
  });

  it('names a zone search that is not a library search (pass 1 #2)', () => {
    expect(engineText('Search your graveyard and exile?')).toBe('Look through your graveyard and exile zone?');
    expect(engineText('Search your library?')).toBe('Search your library?');
    expect(engineText("Search AI 1's graveyard?")).toBe("Look through AI 1's graveyard?");
  });

  it('keeps the instruction of a target step that lists targets and a count (pass 1 #6)', () => {
    expect(targetInstruction('Teferi, Temporal Archmage (12) - Select target permanent\n(4 more can be targeted)')).toBe(
      'Teferi, Temporal Archmage - Select target permanent (4 more can be targeted)',
    );
    // targets chosen so far are listed by name after the instruction
    expect(targetInstruction('Teferi (12) - Select target permanent\nTargeted: \nForest (3)\nBirds of Paradise (9)\n(2 more can be targeted)')).toBe(
      'Teferi - Select target permanent (2 more can be targeted)',
    );
    // the detailed form: description, blank line, the prompt
    expect(targetInstruction('Bolt (12) - Deal 3 damage to any target.\n\nSelect any target')).toBe('Select any target');
    expect(targetInstruction('Bolt - Select any target')).toBe('Bolt - Select any target');
    expect(targetInstruction('')).toBe('Choose');
    expect(targetInstruction('(2 more can be targeted)')).toBe('Choose (2 more can be targeted)');
  });

  it('words "X unless you Y" options as the cost, then the loss (pass 2 #4)', () => {
    expect(unlessChoice('You lose 3 life unless you sacrifice a nonland permanent.')).toBe('Sacrifice a nonland permanent, or lose 3 life');
    expect(unlessChoice('You lose 3 life unless you discard a card.')).toBe('Discard a card, or lose 3 life');
    expect(unlessChoice('Draw a card')).toBeUndefined();
  });
});

describe('engineText: the seat is "You"', () => {
  it('puts the seat in the second person (pass 1 #9)', () => {
    expect(youGrammar('You has kept a hand of 7 cards', 'You')).toBe('You have kept a hand of 7 cards');
    expect(youGrammar('You searches their library for a card.', 'You')).toBe('You search your library for a card.');
    expect(youGrammar('You loses 3 life.', 'You')).toBe('You lose 3 life.');
    expect(youGrammar("You's library", 'You')).toBe('Your library');
    expect(youGrammar('AI 1 deals 3 damage to You.', 'You')).toBe('AI 1 deals 3 damage to you.');
    expect(youGrammar('You mulligans. You draws 7 cards.', 'You')).toBe('You mulligan. You draw 7 cards.');
    // a negated verb agrees too, and the seat after "targeting" is "you"
    expect(youGrammar("You doesn't pay.", 'You')).toBe("You don't pay.");
    expect(youGrammar("Hugo isn't able to block.", 'Hugo')).toBe("You aren't able to block.");
    expect(youGrammar("Hugo can't draw.", 'Hugo')).toBe("You can't draw.");
    expect(youGrammar('AI 1 casts Lightning Bolt targeting Hugo.', 'Hugo')).toBe('AI 1 casts Lightning Bolt targeting you.');
    // other players and other verbs stay
    expect(youGrammar('AI 1 searches their library.', 'You')).toBe('AI 1 searches their library.');
    expect(youGrammar('You cast Llanowar Elves.', 'You')).toBe('You cast Llanowar Elves.');
    expect(youGrammar('Turn 5 (You)', 'You')).toBe('Turn 5 (You)');
    expect(youGrammar('Young Pyromancer dies', 'You')).toBe('Young Pyromancer dies');
    // a seat with another name keeps it
    expect(youGrammar('Hugo has kept a hand of 7 cards', 'Hugo')).toBe('You have kept a hand of 7 cards');
  });

  it('log lines: ids gone, grammar fixed', () => {
    expect(engineLog('You searches their library for Sol Ring (12).', 'You')).toBe('You search your library for Sol Ring.');
    expect(engineLog('AI 1 (Deck) casts Wurmcoil Engine (248).', 'You')).toBe('AI 1 (Deck) casts Wurmcoil Engine.');
    expect(engineLog('You has kept a hand of 7 cards.')).toBe('You has kept a hand of 7 cards.');
  });

  it('engine notices carry no default title (Block UX note 4)', () => {
    expect(engineNotice("Can't block Llanowar Elves (12)", 'Forge')).toBe("Can't block Llanowar Elves");
    expect(engineNotice('Attack declaration invalid', undefined)).toBe('Attack declaration invalid');
    expect(engineNotice('Nothing here', 'Deck check')).toBe('Deck check: Nothing here');
  });
});

// Strings are the ones QA playtest 3 copied from the log, the stack and the trays (issue #127).
describe('engineText: raw tags and ids (issue #127)', () => {
  it('drops the tags that repeat the card or say nothing a player needs', () => {
    expect(engineText('At the beginning of your upkeep, flip a coin. If you lose the flip, Mana Crypt deals 3 damage to you. [Phase: You]')).toBe(
      'At the beginning of your upkeep, flip a coin. If you lose the flip, Mana Crypt deals 3 damage to you.',
    );
    expect(engineText('At the beginning of your upkeep, you draw a card. [Phase: AI 2 (Feline Ferocity [C17])]')).toBe(
      'At the beginning of your upkeep, you draw a card.',
    );
    expect(engineText("When Bojuka Bog enters, exile all cards from target player's graveyard. (Targeting: [[AI 1]]) [Zone Changer: Bojuka Bog (12)]")).toBe(
      "When Bojuka Bog enters, exile all cards from target player's graveyard. (Targeting: AI 1)",
    );
    expect(engineText('Whenever Goblin Guide attacks, defending player reveals the top card. [Attacker: Goblin Guide (5)]')).toBe(
      'Whenever Goblin Guide attacks, defending player reveals the top card.',
    );
    expect(engineText('Whenever City of Brass becomes tapped, it deals 1 damage to you. [Tapped: City of Brass (9)]')).toBe(
      'Whenever City of Brass becomes tapped, it deals 1 damage to you.',
    );
    expect(engineText('Hideaway 4 (When this permanent enters, look at the top four cards.) [Zone Changer: Shelldock Isle (7)]')).toBe(
      'Hideaway 4 (When this permanent enters, look at the top four cards.)',
    );
    // several values: nothing a player can use
    expect(
      engineText(
        'Extort (Whenever you cast a spell, you may pay {W/B}.) [Card: Diabolic Intent (3), Activator: You, SpellAbility: As an additional cost to cast this spell, sacrifice a creature. Search your library [C17] for a card.]',
      ),
    ).toBe('Extort (Whenever you cast a spell, you may pay {W/B}.)');
    expect(engineText('Whenever a creature deals damage, draw. [Damage Source: Otrimi (331), Damaged: AI 2 (Feline Ferocity [C17])]')).toBe(
      'Whenever a creature deals damage, draw.',
    );
    // a bracket that is no tag stays (set codes, rules text)
    expect(engineText('Feline Ferocity [C17] deals 2 damage')).toBe('Feline Ferocity [C17] deals 2 damage');
  });

  it('words what tells identical triggers apart (three Mimic Vat triggers)', () => {
    const vat = 'Whenever a nontoken creature dies, you may exile that card. If you do, create a token that is a copy of it. [Zone Changer: ';
    const raw = [`${vat}Boggart Brute (30)]`, `${vat}Rograkh, Son of Rohgahh (31)]`, `${vat}Face-down card (H0)]`];
    const plain = 'Whenever a nontoken creature dies, you may exile that card. If you do, create a token that is a copy of it.';
    expect(engineText(raw[0]!, undefined, true)).toBe(`${plain} (for Boggart Brute)`);
    expect(tellApart(raw.map((text) => ({ text })), (r, keep) => engineText(r, undefined, keep))).toEqual([
      `${plain} (for Boggart Brute)`,
      `${plain} (for Rograkh, Son of Rohgahh)`,
      `${plain} (for a face-down creature)`,
    ]);
    // different items stay plain, and so do identical ones from different sources
    expect(tellApart([{ text: raw[0]! }, { text: 'Draw a card. [Phase: You]' }], (r, keep) => engineText(r, undefined, keep))).toEqual([plain, 'Draw a card.']);
    expect(tellApart([{ text: raw[0]!, key: 'a' }, { text: raw[1]!, key: 'b' }], (r, keep) => engineText(r, undefined, keep))).toEqual([plain, plain]);
    expect(engineText('Whenever Attackers attack. [Number Attackers: [The Ur-Dragon (100)]]', undefined, true)).toBe('Whenever Attackers attack. (for The Ur-Dragon)');
  });

  it('unwraps the target lists', () => {
    expect(engineText('AI 3 cast Spitting Earth targeting [ Karador, Ghost Chieftain (4)]')).toBe('AI 3 cast Spitting Earth targeting Karador, Ghost Chieftain');
    expect(engineText('You cast Fireball targeting [Goblin Guide (1), Goblin Guide (2)]')).toBe('You cast Fireball targeting Goblin Guide, Goblin Guide');
    expect(engineText('You triggered Bojuka Bog targeting [AI 1]')).toBe('You triggered Bojuka Bog targeting AI 1');
  });

  it('words a face-down card by its hidden id: named only when the viewer may look at it', () => {
    expect(engineText('You assigned Rograkh and Face-down card (H4) to block Boggart Brute.')).toBe(
      'You assigned Rograkh and a face-down creature to block Boggart Brute.',
    );
    expect(engineText('Face-down card (H4) deals 2 damage to Boggart Brute.')).toBe('A face-down creature deals 2 damage to Boggart Brute.');
    const cards = {
      '30': { id: '30', name: 'Zoetic Cavern', hiddenId: 4, faceDown: { seen: true } },
      '31': { id: '31', name: 'Face-down card', hiddenId: 5, faceDown: { seen: false } },
      '32': { id: '32', name: 'Boggart Brute', hiddenId: 6 },
    } as never;
    const lookup = faceDownLookup(cards);
    expect(engineText('Face-down card (H4) deals 2 damage to Boggart Brute.', lookup)).toBe('Zoetic Cavern deals 2 damage to Boggart Brute.');
    // an opponent's face-down card stays face-down
    expect(engineText('Face-down card (H5) deals 2 damage.', lookup)).toBe('A face-down creature deals 2 damage.');
    // a card that is face up now (it died) is public
    expect(engineText('Face-down card (H6) dies.', lookup)).toBe('Boggart Brute dies.');
    expect(engineText('Face-down card (H0) dies.', lookup)).toBe('A face-down creature dies.');
    const asToken = faceDownLookup({ '30': { id: '30', name: 'Zoetic Cavern', hiddenId: 4, faceDown: { seen: true } } } as never, true);
    expect(engineText('You cast Morph. Face-down card (H4) dies.', asToken)).toBe('You cast Morph. {card:30} dies.');
  });
});

describe('engineText: "You" after a card name (issue #127)', () => {
  it('agrees the verb of a seat name after "Card - " and the verbs that follow in the clause', () => {
    expect(youGrammar('Diabolic Intent - You searches their library for a card, reveals it, puts it into their hand, then shuffles.', 'You')).toBe(
      'Diabolic Intent - You search your library for a card, reveal it, put it into your hand, then shuffle.',
    );
    expect(youGrammar("Buried Alive - You searches their library for up to three creature cards, puts them into their owner's graveyard, then shuffles.", 'You')).toBe(
      "Buried Alive - You search your library for up to three creature cards, put them into their owner's graveyard, then shuffle.",
    );
    expect(youGrammar('Opt - You scries 1. You draw a card.', 'You')).toBe('Opt - You scry 1. You draw a card.');
    expect(youGrammar('Consider - You surveils. You draw a card.', 'You')).toBe('Consider - You surveil. You draw a card.');
    expect(youGrammar('Faithless Looting - You draw two cards. You discards two cards.', 'You')).toBe('Faithless Looting - You draw two cards. You discard two cards.');
    // a noun after "and" is no verb; another player stays
    expect(youGrammar('Wrath - You sacrifices a creature and lands you control.', 'You')).toBe('Wrath - You sacrifice a creature and lands you control.');
    expect(youGrammar('Opt - AI 1 scries 1.', 'You')).toBe('Opt - AI 1 scries 1.');
  });

  it('agrees only verbs after a comma, "then" or "and", never a function word or a plural noun', () => {
    expect(youGrammar('Spell - You sacrifices a creature, as the rules say.', 'You')).toBe('Spell - You sacrifice a creature, as the rules say.');
    expect(youGrammar('Spell - You destroys all artifacts and enchantments that you control.', 'You')).toBe('Spell - You destroy all artifacts and enchantments that you control.');
    expect(youGrammar('Spell - You destroys all lands and creatures each player controls.', 'You')).toBe('Spell - You destroy all lands and creatures each player controls.');
    expect(youGrammar('Spell - You gains 3 life and draws a card, then discards a card.', 'You')).toBe('Spell - You gain 3 life and draw a card, then discard a card.');
  });

  it('the stack text is worded like the log', () => {
    expect(engineLog('Faithless Looting - You draw two cards. You discards two cards. [Phase: You]', 'You')).toBe(
      'Faithless Looting - You draw two cards. You discard two cards.',
    );
  });
});
