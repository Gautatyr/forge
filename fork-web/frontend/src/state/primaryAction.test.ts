import { describe, expect, it } from 'vitest';
import { applyIntent } from '../mock/engine';
import { SCENARIOS, scenarioById } from '../mock/scenarios';
import type { Block, CardView, Decision, GameView, PlayerView } from '../model/types';
import { cardStatus } from './cardStatus';
import { canCancel, cancelLabel, primaryAction, promptText } from './primaryAction';
import { DEFAULT_STOPS } from './prefs';
import { setYourStop } from './stops';
import { INITIAL_UI } from './ui';

describe('primary button says what it will do', () => {
  it('offers Resolve while the stack holds items', () => {
    const g = scenarioById('priority').build();
    const a = primaryAction(g, INITIAL_UI, DEFAULT_STOPS);
    expect(a.label).toBe('Resolve');
    expect(a.detail).toContain('Lightning Bolt');
  });

  it('counts attackers, then blockers', () => {
    let g = scenarioById('duel').build();
    g = applyIntent(g, { type: 'primary' }); // to combat
    expect(primaryAction(g, INITIAL_UI, DEFAULT_STOPS).label).toBe('Skip attack');
    g = applyIntent(g, { type: 'attackWithAll', defenderId: 'ai' });
    expect(primaryAction(g, INITIAL_UI, DEFAULT_STOPS).label).toMatch(/^Attack with \d+$/);

    const b = scenarioById('blockers').build();
    expect(primaryAction(b, INITIAL_UI, DEFAULT_STOPS).label).toBe('No blocks');
  });

  it('defaults auto-pass and auto-yield to off (ruling D4)', () => {
    for (const { id } of SCENARIOS) {
      const g = scenarioById(id).build();
      expect(g.autoPass).toBe(false);
      expect(g.autoYield).toBe(false);
    }
  });

  it('names the next stop when passing with an empty stack', () => {
    const g = scenarioById('duel').build();
    const main2 = { ...g, turn: { ...g.turn, step: 'main2' as const } };
    const endTurn = primaryAction(main2, INITIAL_UI, DEFAULT_STOPS);
    expect(endTurn.label).toBe('End turn');
    expect(endTurn.detail).toBe("Next stop: Forge AI's beginning of combat step");

    const upkeep = { ...g, turn: { ...g.turn, step: 'upkeep' as const } };
    const pass = primaryAction(upkeep, INITIAL_UI, DEFAULT_STOPS);
    expect(pass.label).toBe('Pass priority');
    expect(pass.detail).toBe('Next stop: your first main phase');
    expect(primaryAction(upkeep, INITIAL_UI, setYourStop(DEFAULT_STOPS, 'draw', true)).detail).toBe('Next stop: your draw step');

    const opp = { ...g, turn: { ...g.turn, activePlayerId: 'ai', step: 'beginCombat' as const } };
    expect(primaryAction(opp, INITIAL_UI, DEFAULT_STOPS).detail).toBe("Next stop: Forge AI's declare attackers step");
  });

  it('says when no stop is set', () => {
    const g = scenarioById('duel').build();
    const upkeep = { ...g, turn: { ...g.turn, step: 'upkeep' as const } };
    expect(primaryAction(upkeep, INITIAL_UI, { yourTurn: [], opponentsTurn: [], perOpponent: {} }).detail).toBe(
      'No stops set: you act again when something is on the stack',
    );
  });
});

/* --- hand-built games: two players (you, opp), cards from a name and a few fields --- */

const plate = (id: string, name: string, seat: number): PlayerView => ({
  id,
  name,
  seat,
  isYou: id === 'you',
  isAi: id !== 'you',
  life: 20,
  startingLife: 20,
  poison: 0,
  counters: [],
  handCount: 0,
  libraryCount: 40,
  hand: [],
  battlefield: [],
  graveyard: [],
  exile: [],
  command: [],
  commanders: [],
  commanderCasts: {},
  commanderDamageTaken: [],
  landsPlayedThisTurn: 0,
  hasLost: false,
});

/** A creature on the battlefield; `kw`: keyword names as the engine sends them ("Flying", "Double Strike"). */
function card(id: string, name: string, o: Partial<CardView> & { kw?: string[] } = {}): CardView {
  const { kw = [], ...rest } = o;
  return {
    id,
    name,
    front: { name, manaCost: '', typeLine: 'Creature', oracleText: '' },
    ownerId: 'opp',
    controllerId: 'opp',
    zone: 'battlefield',
    isToken: false,
    isCommander: false,
    tapped: false,
    summoningSick: false,
    counters: [],
    damage: 0,
    ptModifiers: [],
    keywords: kw.map((k) => ({ name: k, label: k })),
    attachments: [],
    ...rest,
  };
}

function game(cards: CardView[], decision: Decision, extra: Partial<GameView> = {}): GameView {
  return {
    id: 'test',
    format: 'constructed',
    youId: 'you',
    players: [plate('you', 'You', 0), plate('opp', 'Opp', 1)],
    cards: Object.fromEntries(cards.map((c) => [c.id, c])),
    stack: [],
    turn: { number: 5, activePlayerId: 'opp', step: 'declareBlockers' },
    decision,
    autoPass: false,
    autoYield: false,
    autoYieldTo: [],
    passingUntilYourTurn: false,
    log: [],
    ...extra,
  };
}

const mine = (id: string, name: string, o: Partial<CardView> & { kw?: string[] } = {}) =>
  card(id, name, { ownerId: 'you', controllerId: 'you', ...o });

const blocks = (draft: Block[] = [], attackers: string[] = []): Decision => ({
  kind: 'declareBlockers',
  candidates: draft.map((b) => b.blockerId),
  attackers,
  draft,
});

describe('block forecast counts what the engine says attacks you (issue #79)', () => {
  // QA case 1: two flyers and a 2/2 at you; only the 2/2 may be blocked (the engine's block options).
  const attackers = [
    card('178', 'Niv-Mizzet, Dracogenius', { power: 5, toughness: 5, kw: ['Flying'] }),
    card('187', 'Scalelord Reckoner', { power: 4, toughness: 4, kw: ['Flying'] }),
    card('105', 'Dragonspeaker Shaman', { power: 2, toughness: 2 }),
  ];
  const soldiers = [mine('1', 'Soldier', { power: 1, toughness: 1 }), mine('2', 'Soldier', { power: 1, toughness: 1 })];
  const combat = { attacks: attackers.map((a) => ({ attackerId: a.id, defenderId: 'you' })), blocks: [] };
  const blocking = (draft: Block[]) => game([...attackers, ...soldiers], blocks(draft, ['105']), { combat });

  it('counts attackers you have no blocker for', () => {
    const a = primaryAction(blocking([]), INITIAL_UI, DEFAULT_STOPS);
    expect(a.label).toBe('No blocks');
    expect(a.detail).toBe('You take 11 damage');
  });

  it('leaves out only the attackers you block', () => {
    const draft = [
      { blockerId: '1', attackerId: '105' },
      { blockerId: '2', attackerId: '105' },
    ];
    const a = primaryAction(blocking(draft), INITIAL_UI, DEFAULT_STOPS);
    expect(a.label).toBe('Block with 2');
    expect(a.detail).toBe('You take 9 damage');
  });

  it('reports an attack on your planeswalker as damage to it, not to you', () => {
    const chandra = mine('35', 'Chandra, Torch of Defiance', { power: undefined, toughness: undefined });
    const g = game([chandra, card('71', 'Thorn Lieutenant', { power: 2, toughness: 3 })], blocks([], ['71']), {
      combat: { attacks: [{ attackerId: '71', defenderId: 'you', defenderCardId: '35' }], blocks: [] },
    });
    expect(primaryAction(g, INITIAL_UI, DEFAULT_STOPS).detail).toBe('Chandra, Torch of Defiance takes 2 damage');
  });

  it('names both when you and your planeswalker are attacked', () => {
    const chandra = mine('35', 'Chandra, Torch of Defiance', { power: undefined, toughness: undefined });
    const g = game([chandra, card('71', 'Thorn Lieutenant', { power: 2, toughness: 3 }), card('72', 'Bear', { power: 2, toughness: 2 })], blocks(), {
      combat: {
        attacks: [
          { attackerId: '71', defenderId: 'you', defenderCardId: '35' },
          { attackerId: '72', defenderId: 'you' },
        ],
        blocks: [],
      },
    });
    expect(primaryAction(g, INITIAL_UI, DEFAULT_STOPS).detail).toBe('You take 2 damage · Chandra, Torch of Defiance takes 2 damage');
  });

  it('ignores attacks on other players', () => {
    const g = game([card('72', 'Bear', { power: 2, toughness: 2 })], blocks(), {
      players: [plate('you', 'You', 0), plate('opp', 'Opp', 1), plate('third', 'Third', 2)],
      combat: { attacks: [{ attackerId: '72', defenderId: 'third' }], blocks: [] },
    });
    expect(primaryAction(g, INITIAL_UI, DEFAULT_STOPS).detail).toBe('You take 0 damage');
  });

  it('counts double strike twice', () => {
    const g = game([card('9', 'Boros Swiftblade', { power: 1, toughness: 2, kw: ['Double Strike'] })], blocks(), {
      combat: { attacks: [{ attackerId: '9', defenderId: 'you' }], blocks: [] },
    });
    expect(primaryAction(g, INITIAL_UI, DEFAULT_STOPS).detail).toBe('You take 2 damage');
  });

  it('gives a range when a blocked attacker has trample: at most the excess over lethal damage', () => {
    const wurm = card('7', 'Craw Wurm', { power: 6, toughness: 4, kw: ['Trample'] });
    const wall = mine('1', 'Wall', { power: 0, toughness: 4, damage: 1 });
    const bear = card('8', 'Bear', { power: 2, toughness: 2 });
    const g = game([wurm, wall, bear], blocks([{ blockerId: '1', attackerId: '7' }], ['7', '8']), {
      combat: {
        attacks: [
          { attackerId: '7', defenderId: 'you' },
          { attackerId: '8', defenderId: 'you' },
        ],
        blocks: [],
      },
    });
    // the Bear's 2, plus up to 6 - 3 from the Wurm (the Wall's lethal damage: 4 toughness, 1 already marked)
    expect(primaryAction(g, INITIAL_UI, DEFAULT_STOPS).detail).toBe('You take 2 to 5 damage');
  });

  it('counts 1 lethal damage per blocker with deathtouch, and double strike with trample twice', () => {
    const g = game(
      [card('7', 'Wurm', { power: 3, toughness: 3, kw: ['Trample', 'Deathtouch', 'Double Strike'] }), mine('1', 'Wall', { power: 0, toughness: 5 })],
      blocks([{ blockerId: '1', attackerId: '7' }], ['7']),
      { combat: { attacks: [{ attackerId: '7', defenderId: 'you' }], blocks: [] } },
    );
    expect(primaryAction(g, INITIAL_UI, DEFAULT_STOPS).detail).toBe('You take up to 5 damage');
  });

  it('a blocked attacker without trample deals you nothing', () => {
    const g = game([card('8', 'Bear', { power: 2, toughness: 2 }), mine('1', 'Wall', { power: 0, toughness: 4 })], blocks([{ blockerId: '1', attackerId: '8' }], ['8']), {
      combat: { attacks: [{ attackerId: '8', defenderId: 'you' }], blocks: [] },
    });
    expect(primaryAction(g, INITIAL_UI, DEFAULT_STOPS).detail).toBe('You take 0 damage');
  });

  it('counts infect as poison counters, not life', () => {
    const g = game([card('8', 'Glistener Elf', { power: 1, toughness: 1, kw: ['Infect'] }), card('9', 'Bear', { power: 2, toughness: 2 })], blocks(), {
      combat: {
        attacks: [
          { attackerId: '8', defenderId: 'you' },
          { attackerId: '9', defenderId: 'you' },
        ],
        blocks: [],
      },
    });
    expect(primaryAction(g, INITIAL_UI, DEFAULT_STOPS).detail).toBe('You take 2 damage · You get 1 poison counter');
  });
});

describe('attack forecast (issue #79)', () => {
  it('counts double strike twice', () => {
    const cards = [
      mine('1', 'Boros Swiftblade', { power: 1, toughness: 2, kw: ['Double Strike'] }),
      mine('2', 'Typhoid Rats', { power: 1, toughness: 1, kw: ['Deathtouch'] }),
    ];
    const draft = [
      { attackerId: '1', defenderId: 'opp' },
      { attackerId: '2', defenderId: 'opp' },
    ];
    const g = game(cards, { kind: 'declareAttackers', candidates: ['1', '2'], defenders: ['opp'], defenderCards: [], draft }, {
      turn: { number: 5, activePlayerId: 'you', step: 'declareAttackers' },
    });
    const a = primaryAction(g, INITIAL_UI, DEFAULT_STOPS);
    expect(a.label).toBe('Attack with 2');
    expect(a.detail).toBe('3 damage if unblocked');
  });
});

describe('card picks are worded from what the engine asks (issue #81)', () => {
  const fable = mine('15', 'Fable of the Mirror-Breaker', { front: { name: 'Fable of the Mirror-Breaker', manaCost: '{2}{R}', typeLine: 'Enchantment — Saga', oracleText: '' } });
  const hand = [mine('20', 'Raise the Alarm', { zone: 'hand' }), mine('21', 'Shock', { zone: 'hand' })];
  const pick = (o: Partial<Extract<Decision, { kind: 'chooseTargets' }>>): Decision => ({
    kind: 'chooseTargets',
    sourceCardId: '15',
    instruction: 'Discard 2 card(s)',
    legal: hand.map((c) => ({ kind: 'card' as const, id: c.id })),
    chosen: [],
    min: 0,
    max: 2,
    purpose: 'pick',
    ...o,
  });
  const at = (d: Decision) => game([fable, ...hand], d, { turn: { number: 5, activePlayerId: 'you', step: 'main1' } });

  it('a discard reads as a discard with its range, never as casting the source', () => {
    const none = primaryAction(at(pick({})), INITIAL_UI, DEFAULT_STOPS);
    expect(none.label).toBe('Discard none');
    expect(none.detail).toBe('Discard 2 card(s) · up to 2');
    expect(none.enabled).toBe(true);
    const one = primaryAction(at(pick({ chosen: [{ kind: 'card', id: '20' }], instruction: 'Discard 1 card(s)' })), INITIAL_UI, DEFAULT_STOPS);
    expect(one.label).toBe('Discard (1)');
    expect(one.detail).toBe('Raise the Alarm · up to 2');
  });

  it('a sacrifice cost reads as a sacrifice; too few picked asks for more', () => {
    const d = pick({ instruction: 'Select creature to sacrifice (1 left)', min: 1, max: 1 });
    const a = primaryAction(at(d), INITIAL_UI, DEFAULT_STOPS);
    expect(a.label).toBe('Choose 1 more');
    expect(a.enabled).toBe(false);
    expect(a.detail).toBe('Select creature to sacrifice (1 left)');
    const ready = primaryAction(at({ ...d, chosen: [{ kind: 'card', id: '20' }] } as Decision), INITIAL_UI, DEFAULT_STOPS);
    expect(ready.label).toBe('Sacrifice (1)');
    expect(promptText(at(d))).toBe('Fable of the Mirror-Breaker: Select creature to sacrifice (1 left).');
  });

  it('a pick with no verb the screen knows reads "Choose"', () => {
    const a = primaryAction(at(pick({ instruction: 'Select a card', chosen: [{ kind: 'card', id: '20' }], min: 1, max: 1 })), INITIAL_UI, DEFAULT_STOPS);
    expect(a.label).toBe('Choose (1)');
  });

  it('targets keep the cast wording for a spell, and name an activated or triggered ability', () => {
    const target = (ability: 'spell' | 'activated' | 'triggered' | undefined): Decision => ({
      kind: 'chooseTargets',
      sourceCardId: '15',
      instruction: 'Select target creature',
      legal: [{ kind: 'card', id: '20' }],
      chosen: [{ kind: 'card', id: '20' }],
      min: 1,
      max: 1,
      purpose: 'target',
      ...(ability ? { ability } : {}),
    });
    expect(primaryAction(at(target('spell')), INITIAL_UI, DEFAULT_STOPS).label).toBe('Cast Fable of the Mirror-Breaker');
    expect(primaryAction(at(target(undefined)), INITIAL_UI, DEFAULT_STOPS).label).toBe('Cast Fable of the Mirror-Breaker');
    expect(primaryAction(at(target('activated')), INITIAL_UI, DEFAULT_STOPS).label).toBe('Activate Fable of the Mirror-Breaker');
    expect(primaryAction(at(target('triggered')), INITIAL_UI, DEFAULT_STOPS).label).toBe('Confirm targets');
    expect(primaryAction(at(target('activated')), INITIAL_UI, DEFAULT_STOPS).detail).toBe('Target: Raise the Alarm');
  });

  it('a Cancel that declines an unless cost says what happens instead', () => {
    const d = pick({ instruction: 'Select nonland permanent to sacrifice (1 left)', min: 1, max: 1, decline: 'You loses 3 life.', cancellable: true });
    expect(canCancel(at(d), INITIAL_UI)).toBe(true);
    expect(cancelLabel(at(d))).toBe('Decline: You loses 3 life');
    expect(cancelLabel(at(pick({ cancellable: true })))).toBe('Cancel');
  });

  it('lights picked-from cards without the target icon, and does not mark the source as chosen', () => {
    const p = cardStatus(at(pick({})), INITIAL_UI, '20');
    expect(p).toMatchObject({ actionable: true, actionKind: undefined, selected: false });
    expect(cardStatus(at(pick({})), INITIAL_UI, '15').selected).toBe(false);
    expect(cardStatus(at(pick({ purpose: 'target' })), INITIAL_UI, '20').actionKind).toBe('target');
    expect(cardStatus(at(pick({ purpose: 'target' })), INITIAL_UI, '15').selected).toBe(true);
  });

  it('a pick the engine does not let you cancel offers no Cancel', () => {
    expect(canCancel(at(pick({ cancellable: false })), INITIAL_UI)).toBe(false);
    expect(canCancel(at(pick({ purpose: 'target' })), INITIAL_UI)).toBe(true);
  });
});
