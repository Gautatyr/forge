import { describe, expect, it } from 'vitest';
import type { WireObject } from '../wire/generated/wire';
import { intentToFrames } from './commands';
import { LiveSession } from './session';
import { imageFromKey, logText, parseKeyword, toGameView } from './toView';

const ALIAS = 2 ** 30;

/** Two players (you = 0), a creature each, a hidden card in the opponent's hand, a face-down card. */
function session(phase: 'MAIN1' | 'COMBAT_DECLARE_ATTACKERS' | 'COMBAT_DECLARE_BLOCKERS' = 'MAIN1', active = 0): LiveSession {
  const objects: WireObject[] = [
    { type: 'game', id: 1, props: { Players: [1, 0], Turn: 5, Phase: phase, PlayerTurn: active, GameType: 'Commander', Stack: [] } },
    { type: 'player', id: 0, props: { Name: 'Hugo', Life: 38, Battlefield: [10, 30], Hand: [], Library: [ALIAS + 1], Counters: { POISON: 2, ENERGY: 3 }, HasPriority: true } },
    { type: 'player', id: 1, props: { Name: 'AI', IsAI: true, Life: 40, Battlefield: [20], Hand: [ALIAS + 2], CommanderDamage: { '20': 6 } } },
    { type: 'card', id: 10, props: { Owner: 0, Controller: 0, Zone: 'Battlefield', CurrentState: 'Original', Counters: { P1P1: 2 }, Sickness: true } },
    { type: 'cardState', id: 10, state: 'Original', props: { Name: 'Grizzly Bears', Type: 'Creature - Bear', ManaCost: '{1}{G}', Power: 4, Toughness: 4, ImageKey: 'c:Grizzly Bears|M10|1', Keywords: ['Trample (This creature can deal excess combat damage.)', 'Ward {2}'] } },
    { type: 'card', id: 20, props: { Owner: 1, Controller: 1, Zone: 'Battlefield', CurrentState: 'Original', IsCommander: true } },
    { type: 'cardState', id: 20, state: 'Original', props: { Name: 'Dragon', Type: 'Legendary Creature - Dragon', Power: 6, Toughness: 6 } },
    { type: 'card', id: ALIAS + 2, props: { Owner: 1, Controller: 1, Zone: 'Hand' } },
    { type: 'card', id: ALIAS + 1, props: { Owner: 0, Controller: 0, Zone: 'Library' } },
    { type: 'card', id: 30, props: { Owner: 0, Controller: 0, Zone: 'Battlefield', CurrentState: 'FaceDown', Tapped: true } },
    { type: 'cardState', id: 30, state: 'FaceDown', props: { Type: 'Creature', Power: 2, Toughness: 2 } },
  ];
  const s = new LiveSession();
  s.apply({ t: 'snapshot', game: 1, seq: 0, label: 't', viewer: { seat: 1, player: 0 }, objects, log: [] });
  return s;
}

const buttons = (s: LiveSession, ok: string, cancel: string, message = '') => {
  s.apply({ t: 'call', method: 'showPromptMessage', args: [0, message, null] });
  s.apply({ t: 'call', method: 'updateButtons', args: [0, ok, cancel, true, true, true] });
};

describe('toGameView', () => {
  it('puts you first and maps players', () => {
    const g = toGameView(session());
    expect(g.youId).toBe('0');
    expect(g.players.map((p) => [p.id, p.seat, p.isYou])).toEqual([
      ['0', 0, true],
      ['1', 1, false],
    ]);
    expect(g.players[0]).toMatchObject({ life: 38, poison: 2, counters: [{ kind: 'Energy', count: 3 }], startingLife: 40, libraryCount: 1 });
    expect(g.players[1]).toMatchObject({ isAi: true, handCount: 1, hand: [], commanderDamageTaken: [{ commanderId: '20', amount: 6 }] });
  });

  it('maps visible cards and keeps hidden ones out', () => {
    const g = toGameView(session());
    expect(Object.keys(g.cards).sort()).toEqual(['10', '20', '30']);
    expect(g.cards['10']).toMatchObject({
      name: 'Grizzly Bears',
      power: 4,
      toughness: 4,
      summoningSick: true,
      counters: [{ kind: '+1/+1', count: 2 }],
      front: { typeLine: 'Creature — Bear', manaCost: '{1}{G}', power: '4' },
    });
    expect(g.cards['10']!.keywords).toEqual([
      { name: 'Trample', label: 'Trample', reminder: 'This creature can deal excess combat damage.' },
      { name: 'Ward', label: 'Ward {2}' },
    ]);
    expect(g.cards['30']).toMatchObject({ name: 'Face-down card', tapped: true, power: 2 });
  });

  it('waits for the priority holder when no input is shown to you', () => {
    const s = session();
    s.apply({ t: 'delta', game: 1, seq: 1, ts: 0, new: [], changed: [{ type: 'player', id: 0, props: { HasPriority: null } }, { type: 'player', id: 1, props: { HasPriority: true } }], removed: [], log: [], events: [] });
    expect(toGameView(s).decision).toEqual({ kind: 'waiting', forPlayerId: '1', what: 'AI has priority' });
  });

  it('gives you priority on InputPassPriority (OK / End Turn)', () => {
    const s = session();
    buttons(s, 'OK', 'End Turn', 'Priority: Hugo');
    expect(toGameView(s).decision).toEqual({ kind: 'priority', playable: [] });
  });

  it('turns InputAttack into declareAttackers and InputBlock into declareBlockers', () => {
    const a = session('COMBAT_DECLARE_ATTACKERS', 0);
    buttons(a, 'OK', 'Alpha Strike', 'Select creatures to attack AI or select player/card you wish to attack.');
    expect(toGameView(a).decision).toMatchObject({ kind: 'declareAttackers', candidates: ['10'], defenders: ['1'], draft: [] });

    const b = session('COMBAT_DECLARE_BLOCKERS', 1);
    b.apply({ t: 'delta', game: 1, seq: 1, ts: 0, new: [], changed: [{ type: 'game', id: 1, props: { CombatView: [{ attackers: [20], defender: { type: 'player', id: 0 }, blockers: [10], plannedBlockers: [] }] } }], removed: [], log: [], events: [] });
    buttons(b, 'OK', 'Cancel', 'Select creatures to block Dragon (20) or select another attacker to declare blockers for.');
    const g = toGameView(b);
    expect(g.combat).toEqual({ attacks: [{ attackerId: '20', defenderId: '0' }], blocks: [{ blockerId: '10', attackerId: '20' }] });
    expect(g.decision).toMatchObject({ kind: 'declareBlockers', attackers: ['20'], draft: [{ blockerId: '10', attackerId: '20' }] });
  });

  it('turns selectables into chooseTargets', () => {
    const s = session();
    s.apply({ t: 'call', method: 'setSelectables', args: [[10, 20], 1, 1] });
    s.apply({ t: 'call', method: 'setSelectableTargets', args: [[1]] });
    s.apply({ t: 'call', method: 'showPromptMessage', args: [0, 'Bolt - Select any target', 10] });
    s.apply({ t: 'call', method: 'updateButtons', args: [0, 'OK', 'Cancel', false, true, false] });
    expect(toGameView(s).decision).toEqual({
      kind: 'chooseTargets',
      sourceCardId: '10',
      instruction: 'Bolt - Select any target',
      legal: [
        { kind: 'card', id: '10' },
        { kind: 'card', id: '20' },
        { kind: 'player', id: '1' },
      ],
      chosen: [],
      min: 1,
      max: 1,
    });
  });

  it('turns other two-button inputs into a yes/no tray, and prompts into the matching shape', () => {
    const s = session();
    buttons(s, 'Keep', 'Mulligan', 'Keep this hand?');
    expect(toGameView(s).decision).toMatchObject({ kind: 'choice', prompt: { shape: 'yesNo', yesLabel: 'Keep', noLabel: 'Mulligan' } });
    s.apply({ t: 'prompt', id: 4, method: 'getChoices', title: 'Choose a color', choices: [{ i: 0, label: 'Red' }], min: 1, max: 1 });
    expect(toGameView(s).decision).toMatchObject({ kind: 'choice', prompt: { id: 'prompt:4', shape: 'chooseN' } });
  });
});

describe('intents → frames', () => {
  it('maps board actions to Forge input clicks', () => {
    const s = session('COMBAT_DECLARE_ATTACKERS');
    const g = toGameView(s);
    expect(intentToFrames({ type: 'play', cardId: '10' }, s, g)).toEqual([{ t: 'selectCard', args: [10] }]);
    expect(intentToFrames({ type: 'toggleTarget', target: { kind: 'player', id: '1' } }, s, g)).toEqual([{ t: 'selectPlayer', args: [1] }]);
    expect(intentToFrames({ type: 'primary' }, s, g)).toEqual([{ t: 'selectButtonOk' }]);
    expect(intentToFrames({ type: 'cancel' }, s, g)).toEqual([{ t: 'selectButtonCancel' }]);
    expect(intentToFrames({ type: 'toggleAttacker', cardId: '10', defenderId: '1' }, s, g)).toEqual([
      { t: 'selectPlayer', args: [1] },
      { t: 'selectCard', args: [10] },
    ]);
    expect(intentToFrames({ type: 'attackWithAll', defenderId: '1' }, s, g)).toEqual([{ t: 'selectPlayer', args: [1] }, { t: 'alphaStrike' }]);
    expect(intentToFrames({ type: 'assignBlock', blockerId: '10', attackerId: '20' }, s, g)).toEqual([
      { t: 'selectCard', args: [20] },
      { t: 'selectCard', args: [10] },
    ]);
    expect(intentToFrames({ type: 'undo' }, s, g)).toEqual([{ t: 'undoLastAction' }]);
    expect(intentToFrames({ type: 'setAutoPass', on: true }, s, g)).toEqual([]);
  });

  it('removes a block by re-clicking its attacker then the blocker', () => {
    const s = session('COMBAT_DECLARE_BLOCKERS', 1);
    s.apply({ t: 'delta', game: 1, seq: 1, ts: 0, new: [], changed: [{ type: 'game', id: 1, props: { CombatView: [{ attackers: [20], defender: { type: 'player', id: 0 }, blockers: [10], plannedBlockers: [] }] } }], removed: [], log: [], events: [] });
    buttons(s, 'OK', 'Cancel', 'Select creatures to block');
    expect(intentToFrames({ type: 'removeBlock', blockerId: '10' }, s, toGameView(s))).toEqual([
      { t: 'selectCard', args: [20] },
      { t: 'selectCard', args: [10] },
    ]);
  });

  it('answers prompts by reply and two-button inputs by button', () => {
    const s = session();
    buttons(s, 'Keep', 'Mulligan');
    const g = toGameView(s);
    const inputId = g.decision.kind === 'choice' ? g.decision.prompt.id : '';
    expect(intentToFrames({ type: 'answer', promptId: inputId, answer: { shape: 'yesNo', yes: false } }, s, g)).toEqual([{ t: 'selectButtonCancel' }]);
    s.apply({ t: 'prompt', id: 9, method: 'chooseSingleEntityForEffect', title: 'Pick', choices: [{ i: 0, label: 'A' }, { i: 1, label: 'B' }] });
    expect(intentToFrames({ type: 'answer', promptId: 'prompt:9', answer: { shape: 'chooseN', optionIds: ['1'] } }, s, toGameView(s))).toEqual([
      { t: 'reply', id: 9, value: 1 },
    ]);
    expect(intentToFrames({ type: 'answer', promptId: 'prompt:8', answer: { shape: 'chooseN', optionIds: ['1'] } }, s, toGameView(s))).toEqual([]);
  });

  it('ends the turn only through InputPassPriority\'s End Turn button', () => {
    const s = session();
    buttons(s, 'OK', 'End Turn');
    expect(intentToFrames({ type: 'passUntilYourTurn' }, s, toGameView(s))).toEqual([{ t: 'selectButtonCancel' }]);
    buttons(s, 'OK', 'Undo (1)');
    expect(intentToFrames({ type: 'passUntilYourTurn' }, s, toGameView(s))).toEqual([]);
  });
});

describe('helpers', () => {
  it('parses engine keyword strings', () => {
    expect(parseKeyword('Flying (This creature can’t be blocked except by creatures with flying or reach.)')).toMatchObject({ name: 'Flying', label: 'Flying' });
    expect(parseKeyword('Protection from red')).toEqual({ name: 'Protection', label: 'Protection from red' });
    expect(parseKeyword('Hexproof from black')).toEqual({ name: 'Hexproof', label: 'Hexproof from black' });
    expect(parseKeyword('Toxic 2')).toEqual({ name: 'Toxic', label: 'Toxic 2' });
    expect(parseKeyword('First Strike')).toEqual({ name: 'First Strike', label: 'First Strike' });
  });

  it('builds Scryfall image URLs from image keys', () => {
    expect(imageFromKey('c:Lightning Bolt|M10|1')!.normal).toBe(
      'https://api.scryfall.com/cards/named?exact=Lightning%20Bolt&set=m10&format=image&version=normal',
    );
    expect(imageFromKey('t:hidden')).toBeUndefined();
  });

  it('turns "Name (id)" in the log into card tokens for visible cards only', () => {
    const g = toGameView(session());
    expect(logText('Hugo cast Grizzly Bears (10) targeting Dragon (20); Secret (99) moved.', g.cards)).toBe(
      'Hugo cast {card:10} targeting {card:20}; Secret (99) moved.',
    );
  });
});
