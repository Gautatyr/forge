import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { engineLog, engineNotice, engineText, resolveFilters, stripCardIds, targetInstruction, unlessChoice, youGrammar } from './engineText';

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
    const names = [
      'S.H.I.E.L.D. Flying Car', 'Agents of S.H.I.E.L.D.', 'M.O.D.O.K.', 'Summon: G.F. Ifrit', 'V.A.T.S.', 'U.S.Agent, John Walker',
      'B.O.B. (Bevy of Beebles)',
    ];
    for (const n of names) expect(engineText(n)).toBe(n);
    expect(engineText('Cast M.O.D.O.K. (33)?')).toBe('Cast M.O.D.O.K.?');
    expect(engineText('Select target Creature.YouCtrl or M.O.D.O.K.')).toBe('Select target creature you control or M.O.D.O.K.');
    // a subtype filter is recognised by its properties
    expect(resolveFilters('Select target Goblin.Other+YouCtrl')).toBe('Select target other goblin you control');
  });

  it('leaves every card name of the card pool as it is', () => {
    const dir = join(__dirname, '../../../../forge-gui/res/cardsfolder');
    if (!existsSync(dir) || !statSync(dir).isDirectory()) return;
    const walk = (d: string): string[] =>
      readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]));
    const changed: string[] = [];
    for (const f of walk(dir)) {
      const m = /^Name:(.+)$/m.exec(readFileSync(f, 'utf8'));
      if (m && resolveFilters(m[1]!.trim()) !== m[1]!.trim()) changed.push(m[1]!.trim());
    }
    expect(changed).toEqual([]);
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
