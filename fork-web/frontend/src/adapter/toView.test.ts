import { describe, expect, it } from 'vitest';
import type { WireObject } from '../wire/generated/wire';
import { autoAnswer, intentToFrames, stopFrames } from './commands';
import { LiveSession } from './session';
import { imageFromKey, logText, parseKeyword, passUntilYourTurnDone, toGameView } from './toView';

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

const YOU = { type: 'player', id: 0 } as const;
const card = (id: number) => ({ type: 'card', id }) as const;
const buttons = (s: LiveSession, ok: string, cancel: string, message = '') => {
  s.apply({ t: 'call', method: 'showPromptMessage', args: [YOU, message, null] });
  s.apply({ t: 'call', method: 'updateButtons', args: [YOU, ok, cancel, true, true, true] });
};
const act = (method: string, fields: object = {}) => ({ t: 'action', method, ...fields });

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
    expect(toGameView(s).decision).toEqual({ kind: 'waiting', forPlayerId: '1', what: 'AI is deciding' });
  });

  it('gives you priority on InputPassPriority (OK / End Turn)', () => {
    const s = session();
    buttons(s, 'OK', 'End Turn', 'Priority: Hugo');
    expect(toGameView(s).decision).toEqual({ kind: 'priority', playable: [], manaSources: [] });
    // Actionable highlights (setWeaklySelectable) name what you may play now.
    s.apply({ t: 'call', method: 'setWeaklySelectable', args: [[card(10)]] });
    s.apply({ t: 'delta', game: 1, seq: 1, ts: 0, new: [], changed: [{ type: 'card', id: 10, props: { Zone: 'Hand' } }, { type: 'player', id: 0, props: { Hand: [10], Battlefield: [30] } }], removed: [], log: [], events: [] });
    expect(toGameView(s).decision).toMatchObject({ kind: 'priority', playable: ['10'] });
  });

  it('turns InputAttack into declareAttackers and InputBlock into declareBlockers', () => {
    const a = session('COMBAT_DECLARE_ATTACKERS', 0);
    buttons(a, 'OK', 'Alpha Strike', 'Select creatures to attack AI or select player/card you wish to attack.');
    a.apply({ t: 'call', method: 'setWeaklySelectable', args: [[card(10)]] }); // InputAttack: the engine's attack candidates
    expect(toGameView(a).decision).toMatchObject({ kind: 'declareAttackers', candidates: ['10'], defenders: ['1'], draft: [] });

    const b = session('COMBAT_DECLARE_BLOCKERS', 1);
    // While blocks are declared the engine holds them in plannedBlockers; blockers fills once they are declared.
    b.apply({ t: 'delta', game: 1, seq: 1, ts: 0, new: [], changed: [{ type: 'game', id: 1, props: { CombatView: [{ attackers: [20], defender: { type: 'player', id: 0 }, blockers: [], plannedBlockers: [10] }] } }], removed: [], log: [], events: [] });
    buttons(b, 'OK', 'Cancel', 'Select creatures to block Dragon (20) or select another attacker to declare blockers for.');
    const g = toGameView(b);
    // Your blocks being built are the draft only (drawn once, as a draft).
    expect(g.combat).toEqual({ attacks: [{ attackerId: '20', defenderId: '0' }], blocks: [] });
    expect(g.decision).toMatchObject({ kind: 'declareBlockers', attackers: ['20'], draft: [{ blockerId: '10', attackerId: '20' }] });

    // Declared: the engine fills blockers too; at priority they are the combat's blocks.
    b.apply({ t: 'delta', game: 1, seq: 2, ts: 0, new: [], changed: [{ type: 'game', id: 1, props: { CombatView: [{ attackers: [20], defender: { type: 'player', id: 0 }, blockers: [10], plannedBlockers: [10] }] } }], removed: [], log: [], events: [] });
    buttons(b, 'OK', 'End Turn', 'Priority: Hugo');
    expect(toGameView(b).combat?.blocks).toEqual([{ blockerId: '10', attackerId: '20' }]);
  });

  it('offers the blocks the engine allows (blockOptions), per attacker', () => {
    const b = session('COMBAT_DECLARE_BLOCKERS', 1);
    b.apply({ t: 'delta', game: 1, seq: 1, ts: 0, new: [], changed: [{ type: 'game', id: 1, props: { CombatView: [{ attackers: [20], defender: { type: 'player', id: 0 }, blockers: [], plannedBlockers: [] }] } }], removed: [], log: [], events: [] });
    buttons(b, 'OK', 'Cancel', 'Select another attacker to declare blockers for.');
    // Before the engine's options arrive: the creatures it lights (setWeaklySelectable), never every untapped creature.
    b.apply({ t: 'call', method: 'setWeaklySelectable', args: [[]] });
    expect(toGameView(b).decision).toMatchObject({ kind: 'declareBlockers', candidates: [], attackers: ['20'] });
    b.apply({ t: 'blockOptions', attackers: [{ card: 20, blockers: [10], ifFreed: [], min: 2 }] });
    expect(toGameView(b).decision).toEqual({
      kind: 'declareBlockers',
      candidates: ['10'],
      attackers: ['20'],
      draft: [],
      options: [{ attackerId: '20', blockers: ['10'], ifFreed: [], min: 2 }],
    });
    // An attacker nothing may block is not lit.
    b.apply({ t: 'blockOptions', attackers: [{ card: 20, blockers: [], ifFreed: [] }] });
    expect(toGameView(b).decision).toMatchObject({ kind: 'declareBlockers', candidates: [], attackers: [] });
    // InputBlock.onStop clears the actionable cards: its options go with it.
    b.apply({ t: 'call', method: 'clearWeaklySelectable', args: [] });
    expect(b.blockOptions).toBeUndefined();
  });

  it('offers as attackers what the engine allows, not every untapped creature', () => {
    const a = session('COMBAT_DECLARE_ATTACKERS', 0);
    buttons(a, 'OK', 'Alpha Strike', 'Select creatures to attack AI or select player/card you wish to attack.');
    a.apply({ t: 'call', method: 'setWeaklySelectable', args: [[]] }); // nothing may attack (e.g. summoning sickness)
    expect(toGameView(a).decision).toMatchObject({ kind: 'declareAttackers', candidates: [] });
  });

  it('turns selectables into chooseTargets', () => {
    const s = session();
    s.apply({ t: 'call', method: 'setSelectables', args: [[card(10), card(20)], 1, 1] });
    s.apply({ t: 'call', method: 'setSelectableTargets', args: [[{ type: 'player', id: 1 }]] });
    s.apply({ t: 'call', method: 'showPromptMessage', args: [YOU, 'Bolt - Select any target', card(10)] });
    s.apply({ t: 'call', method: 'updateButtons', args: [YOU, 'OK', 'Cancel', false, true, false] });
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
    expect(toGameView(s).decision).toMatchObject({ kind: 'choice', prompt: { shape: 'yesNo', yesLabel: 'Keep 0', noLabel: 'Mulligan' } });
    s.apply({ t: 'prompt', id: 4, method: 'getChoices', shape: 'choose', message: 'Choose a color', choices: [{ i: 0, label: 'Red' }], min: 1, max: 1 });
    expect(toGameView(s).decision).toMatchObject({ kind: 'choice', prompt: { id: 'prompt:4', shape: 'chooseN' } });
  });
});

describe('no prompt when there is nothing to do (playtest 1)', () => {
  /** InputLondonMulligan: "Return N card(s)…", OK when N more are chosen, else Auto. */
  const london = (s: LiveSession, left: number, chosen: number[] = []) => {
    s.apply({ t: 'call', method: 'setHighlighted', args: [chosen.map(card), true] });
    s.apply({ t: 'call', method: 'showPromptMessage', args: [YOU, `Return ${left} card(s) to the bottom of your library`, null] });
    s.apply({ t: 'call', method: 'updateButtons', args: [YOU, 'OK', 'Auto', left === 0, left !== 0, true] });
  };

  it('answers the free mulligan’s "return 0 cards" at once, without a tray', () => {
    const s = session();
    london(s, 0);
    const g = toGameView(s);
    expect(g.decision.kind).toBe('waiting');
    expect(g.decision).toMatchObject({ forPlayerId: '0', what: 'Drawing your new hand' });
    expect(autoAnswer(s)).toEqual({ key: expect.any(String), frames: [act('selectButtonOk')] });
  });

  it('still asks when cards go to the bottom, even once they are all chosen', () => {
    const s = session();
    london(s, 1);
    expect(toGameView(s).decision).toMatchObject({ kind: 'choice', prompt: { shape: 'chooseN', min: 1, max: 1 } });
    expect(autoAnswer(s)).toBeUndefined();
    // One of one chosen: the engine says "Return 0" and enables OK; the player confirms.
    london(s, 0, [10]);
    expect(toGameView(s).decision).toMatchObject({ kind: 'choice', prompt: { shape: 'chooseN', min: 1, max: 1 } });
    expect(autoAnswer(s)).toBeUndefined();
  });

  it('never answers a paid bottom step as it ends (its last reset reads "Return 0", nothing chosen)', () => {
    const s = session();
    london(s, 1);
    london(s, 0, [10]);
    // InputLondonMulligan.done(): resetCardHighlights() before stop(); OK is still enabled.
    s.apply({ t: 'call', method: 'setHighlighted', args: [[card(10)], false] });
    expect(autoAnswer(s)).toBeUndefined();
    expect(toGameView(s).decision).not.toMatchObject({ what: 'Drawing your new hand' });
    // The next London input (after awaitNextInput) is judged on its own first message.
    s.apply({ t: 'call', method: 'awaitNextInput', args: [] });
    london(s, 0);
    expect(autoAnswer(s)).toEqual({ key: expect.any(String), frames: [act('selectButtonOk')] });
  });

  it('judges a London input by its first message even without awaitNextInput before it', () => {
    const s = session();
    buttons(s, 'Keep', 'Mulligan', 'Keep your hand?');
    london(s, 0);
    expect(autoAnswer(s)).toBeDefined();
  });

  it('answers nothing for another player’s input or any other prompt', () => {
    const s = session();
    buttons(s, 'Keep', 'Mulligan', 'Keep your hand?');
    expect(autoAnswer(s)).toBeUndefined();
    const t = session();
    t.apply({ t: 'call', method: 'showPromptMessage', args: [{ type: 'player', id: 1 }, 'Return 0 card(s) to the bottom of your library', null] });
    t.apply({ t: 'call', method: 'updateButtons', args: [{ type: 'player', id: 1 }, 'OK', 'Auto', true, false, true] });
    expect(autoAnswer(t)).toBeUndefined();
  });
});

describe('intents → frames', () => {
  it('maps board actions to Forge input clicks', () => {
    const s = session('COMBAT_DECLARE_ATTACKERS');
    const g = toGameView(s);
    expect(intentToFrames({ type: 'play', cardId: '10' }, s, g)).toEqual([act('selectCard', { card: 10 })]);
    expect(intentToFrames({ type: 'toggleTarget', target: { kind: 'player', id: '1' } }, s, g)).toEqual([act('selectPlayer', { player: 1 })]);
    expect(intentToFrames({ type: 'primary' }, s, g)).toEqual([act('selectButtonOk')]);
    expect(intentToFrames({ type: 'cancel' }, s, g)).toEqual([act('selectButtonCancel')]);
    expect(intentToFrames({ type: 'toggleAttacker', cardId: '10', defenderId: '1' }, s, g)).toEqual([
      act('selectPlayer', { player: 1 }),
      act('selectCard', { card: 10 }),
    ]);
    expect(intentToFrames({ type: 'attackWithAll', defenderId: '1' }, s, g)).toEqual([act('selectPlayer', { player: 1 }), act('alphaStrike')]);
    expect(intentToFrames({ type: 'assignBlock', blockerId: '10', attackerId: '20' }, s, g)).toEqual([
      act('selectCard', { card: 20 }),
      act('selectCard', { card: 10 }),
    ]);
    expect(intentToFrames({ type: 'spendPool', colour: 'G' }, s, g)).toEqual([act('useMana', { color: 16 })]);
    expect(intentToFrames({ type: 'undo' }, s, g)).toEqual([act('undoLastAction')]);
    expect(intentToFrames({ type: 'concede' }, s, g)).toEqual([act('concede')]);
    buttons(s, 'OK', 'End Turn', 'Priority: Hugo');
    expect(intentToFrames({ type: 'concede' }, s, toGameView(s))).toEqual([act('concede'), act('selectButtonOk')]);
    expect(intentToFrames({ type: 'setAutoPass', on: true }, s, g)).toEqual([]);
  });

  it('removes a block by re-clicking its attacker then the blocker', () => {
    const s = session('COMBAT_DECLARE_BLOCKERS', 1);
    s.apply({ t: 'delta', game: 1, seq: 1, ts: 0, new: [], changed: [{ type: 'game', id: 1, props: { CombatView: [{ attackers: [20], defender: { type: 'player', id: 0 }, blockers: [10], plannedBlockers: [] }] } }], removed: [], log: [], events: [] });
    buttons(s, 'OK', 'Cancel', 'Select creatures to block');
    expect(intentToFrames({ type: 'removeBlock', blockerId: '10' }, s, toGameView(s))).toEqual([
      act('selectCard', { card: 20 }),
      act('selectCard', { card: 10 }),
    ]);
  });

  it('removes one block of a creature blocking two attackers, or all of them', () => {
    const s = session('COMBAT_DECLARE_BLOCKERS', 1);
    s.apply({ t: 'delta', game: 1, seq: 1, ts: 0, new: [], changed: [{ type: 'game', id: 1, props: { CombatView: [
      { attackers: [20], defender: { type: 'player', id: 0 }, blockers: [], plannedBlockers: [10] },
      { attackers: [30], defender: { type: 'player', id: 0 }, blockers: [], plannedBlockers: [10] },
    ] } }], removed: [], log: [], events: [] });
    buttons(s, 'OK', 'Cancel', 'Select creatures to block');
    const g = toGameView(s);
    expect(intentToFrames({ type: 'removeBlock', blockerId: '10', attackerId: '30' }, s, g)).toEqual([act('selectCard', { card: 30 }), act('selectCard', { card: 10 })]);
    expect(intentToFrames({ type: 'removeBlock', blockerId: '10' }, s, g)).toEqual([
      act('selectCard', { card: 20 }),
      act('selectCard', { card: 10 }),
      act('selectCard', { card: 30 }),
      act('selectCard', { card: 10 }),
    ]);
  });

  it('answers prompts by reply and button inputs by button', () => {
    const s = session();
    buttons(s, 'Keep', 'Mulligan');
    const g = toGameView(s);
    const inputId = g.decision.kind === 'choice' ? g.decision.prompt.id : '';
    expect(intentToFrames({ type: 'answer', promptId: inputId, answer: { shape: 'yesNo', yes: false } }, s, g)).toEqual([act('selectButtonCancel')]);
    s.apply({ t: 'prompt', id: 9, method: 'chooseSingleEntityForEffect', shape: 'choose', message: 'Pick', min: 1, max: 1, choices: [{ i: 0, label: 'A' }, { i: 1, label: 'B' }] });
    expect(intentToFrames({ type: 'answer', promptId: 'prompt:9', answer: { shape: 'chooseN', optionIds: ['1'] } }, s, toGameView(s))).toEqual([
      { t: 'reply', id: 9, value: [1] },
    ]);
    expect(intentToFrames({ type: 'answer', promptId: 'prompt:8', answer: { shape: 'chooseN', optionIds: ['1'] } }, s, toGameView(s))).toEqual([]);
  });

  it('passes until your turn with a yield marker at your upkeep', () => {
    const s = session('MAIN1', 1);
    buttons(s, 'OK', 'End Turn');
    expect(intentToFrames({ type: 'passUntilYourTurn' }, s, toGameView(s))).toEqual([
      act('sendYieldUpdate', { update: { kind: 'SetMarker', phaseOwner: 0, phase: 'UPKEEP', atOrPastAtClick: false } }),
      act('selectButtonOk'),
    ]);
    expect(intentToFrames({ type: 'cancelPassUntilYourTurn' }, s, toGameView(s))).toEqual([act('sendYieldUpdate', { update: { kind: 'ClearMarker' } })]);
  });

  it('sends phase stops as SkipPhase for every player and step', () => {
    const g = toGameView(session());
    const frames = stopFrames(g, (pid, step) => pid === '0' && step === 'main1');
    expect(frames).toContainEqual(act('sendYieldUpdate', { update: { kind: 'SkipPhase', turnPlayer: 0, phase: 'MAIN1', skip: false } }));
    expect(frames).toContainEqual(act('sendYieldUpdate', { update: { kind: 'SkipPhase', turnPlayer: 1, phase: 'MAIN1', skip: true } }));
    expect(frames).toHaveLength(2 * 11);
  });
});

describe('payment and reveals', () => {
  it('turns "Pay Mana Cost" into payMana with the sources and the auto-pay plan', () => {
    const s = session();
    s.apply({ t: 'delta', game: 1, seq: 1, ts: 0, new: [{ type: 'card', id: 40, props: { Owner: 0, Controller: 0, Zone: 'Battlefield', CurrentState: 'Original' } }, { type: 'cardState', id: 40, state: 'Original', props: { Name: 'Forest', Type: 'Basic Land - Forest', OrigProduceMana: 'G' } }], changed: [{ type: 'player', id: 0, props: { Battlefield: [10, 30, 40] } }], removed: [], log: [], events: [] });
    buttons(s, 'OK', 'End Turn', 'Priority: Hugo');
    s.clicked(10);
    s.apply({ t: 'call', method: 'setWeaklySelectable', args: [[card(40), card(40)]] });
    s.apply({ t: 'call', method: 'updateButtons', args: [YOU, 'Auto', 'Cancel', true, true, true] });
    s.apply({ t: 'call', method: 'showPromptMessage', args: [YOU, 'Grizzly Bears\n\nPay Mana Cost: {1}{G}', card(-1)] });
    expect(toGameView(s).decision).toEqual({
      kind: 'payMana',
      sourceCardId: '10',
      cost: '{1}{G}',
      remaining: '{1}{G}',
      tax: 0,
      sources: [{ cardId: '40', colours: ['G'] }],
      canUndoTap: false,
      autoTaps: ['40'],
      autoCanPay: true,
      lifePays: false,
    });
    s.apply({ t: 'call', method: 'showPromptMessage', args: [YOU, 'Grizzly Bears\n\nPay Mana Cost: {1}', card(-1)] });
    expect(toGameView(s).decision).toMatchObject({ cost: '{1}{G}', remaining: '{1}' });
  });

  it('keeps naming the spell being paid for while it is in no zone', () => {
    const s = session();
    buttons(s, 'OK', 'End Turn', 'Priority: Hugo');
    s.clicked(10);
    s.apply({ t: 'call', method: 'updateButtons', args: [YOU, 'Auto', 'Cancel', true, true, true] });
    s.apply({ t: 'call', method: 'showPromptMessage', args: [YOU, 'Bears\n\nPay Mana Cost: {2}', card(-1)] });
    s.apply({ t: 'delta', game: 1, seq: 1, ts: 0, new: [], changed: [{ type: 'player', id: 0, props: { Battlefield: [30] } }], removed: ['card:10', 'cardState:10:Original'], log: [], events: [] });
    const g = toGameView(s);
    expect(g.decision).toMatchObject({ kind: 'payMana', sourceCardId: '10' });
    expect(g.cards['10']).toMatchObject({ name: 'Grizzly Bears', zone: 'stack' });
    expect(g.players[0]!.battlefield).toEqual(['30']);
  });

  it('shows a one-line reveal message once', () => {
    const s = session();
    s.apply({ t: 'call', method: 'showRevealedCards', args: [[card(20)]] });
    buttons(s, 'OK', '', "Looking at cards in AI's hand");
    s.apply({ t: 'call', method: 'updateButtons', args: [YOU, 'OK', '', true, false, true] });
    expect(toGameView(s).decision).toMatchObject({ kind: 'choice', prompt: { title: "Looking at cards in AI's hand", instruction: '' } });
  });

  it('shows revealed cards in the tray until OK', () => {
    const s = session();
    s.apply({ t: 'call', method: 'showRevealedCards', args: [[card(20)]] });
    buttons(s, 'OK', 'End Turn', "Looking at cards in AI's hand");
    const g = toGameView(s);
    expect(g.decision).toMatchObject({ kind: 'choice', prompt: { shape: 'chooseN', max: 0, options: [{ id: '20', cardId: '20' }] } });
    const id = g.decision.kind === 'choice' ? g.decision.prompt.id : '';
    expect(intentToFrames({ type: 'answer', promptId: id, answer: { shape: 'chooseN', optionIds: [] } }, s, g)).toEqual([act('selectButtonOk')]);
    s.apply({ t: 'call', method: 'hideRevealedCards', args: [] });
    expect(toGameView(s).decision.kind).not.toBe('choice');
  });
});

describe('combat inputs', () => {
  it('reads priority in the declare blockers step as priority, not as a block declaration', () => {
    const s = session('COMBAT_DECLARE_BLOCKERS', 1);
    buttons(s, 'OK', 'End Turn', 'Priority: Hugo\nTurn: 5 (AI)\nPhase: Declare Blockers Step\nStack: Empty');
    expect(toGameView(s).decision.kind).toBe('priority');
  });
});

describe('attacking planeswalkers and battles (issue #65)', () => {
  /** The AI controls Teferi (50); a battle (60) you control is protected by the AI. */
  function withPermanents(phase: 'COMBAT_DECLARE_ATTACKERS' | 'COMBAT_DECLARE_BLOCKERS' = 'COMBAT_DECLARE_ATTACKERS', active = 0): LiveSession {
    const s = session(phase, active);
    s.apply({
      t: 'delta',
      game: 1,
      seq: 1,
      ts: 0,
      new: [
        { type: 'card', id: 50, props: { Owner: 1, Controller: 1, Zone: 'Battlefield', CurrentState: 'Original', Counters: { LOYALTY: 4 } } },
        { type: 'cardState', id: 50, state: 'Original', props: { Name: 'Teferi, Temporal Archmage', Type: 'Legendary Planeswalker - Teferi', Loyalty: '5' } },
        { type: 'card', id: 60, props: { Owner: 0, Controller: 0, Zone: 'Battlefield', CurrentState: 'Original', ProtectingPlayer: 1, Counters: { DEFENSE: 5 } } },
        { type: 'cardState', id: 60, state: 'Original', props: { Name: 'Invasion of Ergamon', Type: 'Battle - Siege' } },
      ],
      changed: [
        { type: 'player', id: 1, props: { Battlefield: [20, 50] } },
        { type: 'player', id: 0, props: { Battlefield: [10, 30, 60] } },
      ],
      removed: [],
      log: [],
      events: [],
    });
    return s;
  }
  const band = (attacker: number, defender: { type: 'card' | 'player'; id: number }) => ({ attackers: [attacker], defender, blockers: [], plannedBlockers: [] });

  it('offers the defenders the engine allows (attackOptions): players, planeswalkers and battles', () => {
    const a = withPermanents();
    buttons(a, 'OK', 'Alpha Strike', 'Select creatures to attack AI or select player/card you wish to attack.');
    a.apply({ t: 'call', method: 'setWeaklySelectable', args: [[card(10)]] });
    a.apply({ t: 'attackOptions', defenders: [{ type: 'player', id: 1 }, { type: 'card', id: 50 }, { type: 'card', id: 60 }] });
    expect(toGameView(a).decision).toMatchObject({ kind: 'declareAttackers', candidates: ['10'], defenders: ['1'], defenderCards: ['50', '60'] });
    // A defender the engine leaves out is not offered (e.g. a planeswalker it can't attack now).
    a.apply({ t: 'attackOptions', defenders: [{ type: 'player', id: 1 }] });
    expect(toGameView(a).decision).toMatchObject({ defenders: ['1'], defenderCards: [] });
    // InputAttack.onStop clears the actionable cards: its options go with it.
    a.apply({ t: 'call', method: 'clearWeaklySelectable', args: [] });
    expect(a.attackOptions).toBeUndefined();
  });

  it('draws an attack on a planeswalker or battle as an attack on that permanent, its defending player beside it', () => {
    const s = withPermanents('COMBAT_DECLARE_BLOCKERS', 1);
    s.apply({ t: 'delta', game: 1, seq: 2, ts: 0, new: [], changed: [{ type: 'game', id: 1, props: { CombatView: [band(10, { type: 'card', id: 50 }), band(30, { type: 'card', id: 60 }), band(20, { type: 'player', id: 0 })] } }], removed: [], log: [], events: [] });
    expect(toGameView(s).combat?.attacks).toEqual([
      { attackerId: '10', defenderId: '1', defenderCardId: '50' },
      // A battle's defending player is its protector, not its controller.
      { attackerId: '30', defenderId: '1', defenderCardId: '60' },
      { attackerId: '20', defenderId: '0' },
    ]);
  });

  it('picks a planeswalker as the defender with selectCard, then the attacker', () => {
    const s = withPermanents();
    const g = toGameView(s);
    expect(intentToFrames({ type: 'toggleAttacker', cardId: '10', defenderId: '1', defenderCardId: '50' }, s, g)).toEqual([
      act('selectCard', { card: 50 }),
      act('selectCard', { card: 10 }),
    ]);
    expect(intentToFrames({ type: 'attackWithAll', defenderId: '1', defenderCardId: '50' }, s, g)).toEqual([act('selectCard', { card: 50 }), act('alphaStrike')]);
  });
});

describe('commander tax (issue #67)', () => {
  function withCommander(casts: number): LiveSession {
    const s = session();
    s.apply(
      delta1({
        new: [
          { type: 'card', id: 70, props: { Owner: 0, Controller: 0, Zone: 'Command', CurrentState: 'Original', IsCommander: true } },
          { type: 'cardState', id: 70, state: 'Original', props: { Name: 'Szarekh, the Silent King', Type: 'Legendary Artifact Creature - Necron', ManaCost: '{1}{B}{B}{B}', Power: 3, Toughness: 4 } },
        ],
        changed: [{ type: 'player', id: 0, props: { Command: [70], Commander: [70], CommanderCast: { '70': casts } } }],
      }),
    );
    buttons(s, 'OK', 'End Turn', 'Priority: Hugo');
    return s;
  }
  const pay = (s: LiveSession, card: number, cost: string) => {
    s.clicked(card);
    s.apply({ t: 'call', method: 'updateButtons', args: [YOU, 'Auto', 'Cancel', true, true, true] });
    s.apply({ t: 'call', method: 'showPromptMessage', args: [YOU, `Pay Mana Cost: ${cost}`, { type: 'card', id: card }] });
  };

  it('includes the tax (2 per earlier cast) when your commander is cast from the command zone', () => {
    const s = withCommander(1);
    pay(s, 70, '{3}{B}{B}{B}');
    expect(toGameView(s).decision).toMatchObject({ kind: 'payMana', sourceCardId: '70', cost: '{3}{B}{B}{B}', tax: 2 });
  });

  it('has no tax on a first cast, nor for a spell that is not your commander', () => {
    const first = withCommander(0);
    pay(first, 70, '{1}{B}{B}{B}');
    expect(toGameView(first).decision).toMatchObject({ kind: 'payMana', tax: 0 });
    const other = withCommander(2);
    pay(other, 10, '{1}{G}');
    expect(toGameView(other).decision).toMatchObject({ kind: 'payMana', tax: 0 });
  });

  it('has no tax for your commander cast from another zone (an ability or a cast from hand pays none)', () => {
    const s = withCommander(1);
    s.apply({ t: 'delta', game: 1, seq: 2, ts: 0, new: [], changed: [{ type: 'card', id: 70, props: { Zone: 'Hand' } }, { type: 'player', id: 0, props: { Command: [], Hand: [70] } }], removed: [], log: [], events: [] });
    pay(s, 70, '{1}{B}{B}{B}');
    expect(toGameView(s).decision).toMatchObject({ kind: 'payMana', tax: 0 });
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

  it('gives the image lookup every key, tokens by their name, special faces without one', () => {
    const refs: unknown[] = [];
    const lookup = (r: unknown) => (refs.push(r), undefined);
    imageFromKey('c:Lightning Bolt|M10|1', false, lookup, 'Lightning Bolt');
    imageFromKey('c:Delver of Secrets|ISD|1$alt', true, lookup, 'Insectile Aberration');
    imageFromKey('t:w_1_1_soldier_m21', false, lookup, 'Soldier');
    imageFromKey('t:morph', false, lookup, 'Face-down card');
    imageFromKey(undefined, false, lookup, 'Nothing');
    expect(refs).toEqual([
      { key: 'c:Lightning Bolt|M10|1', name: 'Lightning Bolt', set: 'm10', back: false },
      { key: 'c:Delver of Secrets|ISD|1$alt', name: 'Delver of Secrets', set: 'isd', back: true },
      { key: 't:w_1_1_soldier_m21', name: 'Soldier', set: '', back: false, token: true },
      { key: 't:morph', name: '', set: '', back: false, token: true },
    ]);
  });

  it('turns "Name (id)" in the log into card tokens for visible cards only', () => {
    const g = toGameView(session());
    expect(logText('Hugo cast Grizzly Bears (10) targeting Dragon (20); Secret (99) moved.', g.cards)).toBe(
      'Hugo cast {card:10} targeting {card:20}; Secret (99) moved.',
    );
  });
});

type View = ReturnType<typeof toGameView>;
const delta1 = (d: { new?: WireObject[]; changed?: { type: string; id: number; props: object }[] }) =>
  ({ t: 'delta', game: 1, seq: 1, ts: 0, new: d.new ?? [], changed: d.changed ?? [], removed: [], log: [], events: [] }) as Parameters<LiveSession['apply']>[0];

/** Every player id the view names, wherever it names one. */
function playerIdsIn(g: View): string[] {
  const ids: string[] = [g.youId, g.turn.activePlayerId];
  if (g.turn.priorityPlayerId) ids.push(g.turn.priorityPlayerId);
  for (const c of Object.values(g.cards)) ids.push(c.ownerId, c.controllerId);
  for (const a of g.combat?.attacks ?? []) ids.push(a.defenderId);
  for (const si of g.stack) {
    ids.push(si.controllerId);
    for (const t of si.targets) if (t.kind === 'player') ids.push(t.id);
  }
  const d = g.decision;
  if (d.kind === 'waiting') ids.push(d.forPlayerId);
  if (d.kind === 'chooseTargets') for (const t of [...d.legal, ...d.chosen]) if (t.kind === 'player') ids.push(t.id);
  if (d.kind === 'declareAttackers') ids.push(...d.defenders, ...d.draft.map((a) => a.defenderId));
  if (d.kind === 'choice' && d.prompt.shape === 'chooseN') for (const o of d.prompt.options) if (o.playerId) ids.push(o.playerId);
  return ids;
}

/** Every card id the view names in a zone list or in combat. */
function cardIdsIn(g: View): string[] {
  const ids: string[] = [];
  for (const p of g.players) ids.push(...p.hand, ...p.battlefield, ...p.graveyard, ...p.exile, ...p.command, ...p.commanders);
  for (const a of g.combat?.attacks ?? []) ids.push(a.attackerId, ...(a.defenderCardId ? [a.defenderCardId] : []));
  for (const b of g.combat?.blocks ?? []) ids.push(b.blockerId, b.attackerId);
  return ids;
}

describe('cards in no zone, of no player (a mutated commander’s merged copy)', () => {
  it('leaves the card out, drops its combat bands and names only players of the game', () => {
    const s = session('COMBAT_DECLARE_ATTACKERS', 1);
    s.apply(
      delta1({
        new: [
          { type: 'card', id: -1, props: { CurrentState: 'Original' } },
          { type: 'cardState', id: -1, state: 'Original', props: { Name: 'Otrimi, the Ever-Playful', Type: 'Legendary Creature - Nightmare Beast', Power: 6, Toughness: 6 } },
          { type: 'card', id: 50, props: { Owner: 1, Controller: 1, Zone: 'Battlefield', CurrentState: 'Original' } },
          { type: 'cardState', id: 50, state: 'Original', props: { Name: 'Jace, Architect of Thought', Type: 'Legendary Planeswalker - Jace', Loyalty: '4' } },
          { type: 'stackItem', id: 7, props: { SourceCard: -1, ActivatingPlayer: -1, Ability: true, Description: 'Mutate trigger', TargetPlayers: [-1, 0] } },
        ],
        changed: [
          { type: 'player', id: 1, props: { Battlefield: [20, 50] } },
          {
            type: 'game',
            id: 1,
            props: {
              Stack: [7],
              CombatView: [
                { attackers: [-1, 10], defender: { type: 'card', id: 50 }, blockers: [], plannedBlockers: [] },
                { attackers: [20], defender: { type: 'card', id: -1 }, blockers: [-1], plannedBlockers: [] },
                { attackers: [10], defender: { type: 'player', id: -1 }, blockers: [], plannedBlockers: [] },
              ],
            },
          },
        ],
      }),
    );
    const g = toGameView(s);
    expect(g.cards['-1']).toBeUndefined();
    const players = new Set(g.players.map((p) => p.id));
    expect(playerIdsIn(g).filter((id) => !players.has(id))).toEqual([]);
    expect(cardIdsIn(g).filter((id) => !g.cards[id])).toEqual([]);
    // Jace is attacked, his controller defends; the ghost attacker, the ghost defender and the unknown player are dropped.
    expect(g.combat).toEqual({ attacks: [{ attackerId: '10', defenderId: '1', defenderCardId: '50' }], blocks: [] });
    // The stack item stays, held by a real player (the active one when its controller is unknown).
    expect(g.stack).toEqual([expect.objectContaining({ id: '7', controllerId: '1', targets: [{ kind: 'player', id: '0' }] })]);
  });

  it('keeps a card whose owner is unknown but whose controller is known', () => {
    const s = session();
    s.apply(
      delta1({
        new: [
          { type: 'card', id: 60, props: { Controller: 1, Zone: 'Battlefield', CurrentState: 'Original' } },
          { type: 'cardState', id: 60, state: 'Original', props: { Name: 'Token', Type: 'Creature' } },
        ],
        changed: [{ type: 'player', id: 1, props: { Battlefield: [20, 60] } }],
      }),
    );
    expect(toGameView(s).cards['60']).toMatchObject({ ownerId: '1', controllerId: '1', zone: 'battlefield' });
  });
});

describe('selections off the board (library searches, choosing a player)', () => {
  /** Cultivate resolving: three basic lands of your library are selectable, up to 2. */
  function search(): LiveSession {
    const s = session();
    const lands = [71, 72, 73];
    s.apply(
      delta1({
        new: lands.flatMap((id): WireObject[] => [
          { type: 'card', id, props: { Owner: 0, Controller: 0, Zone: 'Library', CurrentState: 'Original' } },
          { type: 'cardState', id, state: 'Original', props: { Name: `Forest ${id}`, Type: 'Basic Land - Forest' } },
        ]),
      }),
    );
    s.apply({ t: 'call', method: 'setSelectables', args: [lands.map(card), 0, 2] });
    s.apply({ t: 'call', method: 'showPromptMessage', args: [YOU, 'Grizzly Bears (10)\nSelect up to 2 cards from your library', card(10)] });
    s.apply({ t: 'call', method: 'updateButtons', args: [YOU, 'OK', 'Cancel', true, false, true] });
    return s;
  }

  it('lists library cards in the tray (they are on no board)', () => {
    expect(toGameView(search()).decision).toMatchObject({
      kind: 'choice',
      prompt: {
        shape: 'chooseN',
        // "Grizzly Bears (10)\nSelect up to 2…": what asks, then the question (not the same line twice)
        title: 'Grizzly Bears',
        instruction: 'Select up to 2 cards from your library',
        sourceCardId: '10',
        confirmLabel: 'OK',
        min: 0,
        max: 2,
        options: [
          { id: 'c71', label: 'Forest 71', cardId: '71' },
          { id: 'c72', label: 'Forest 72', cardId: '72' },
          { id: 'c73', label: 'Forest 73', cardId: '73' },
        ],
      },
    });
  });

  it('answers with one selectCard per pick, then OK unless the last pick ends the input', () => {
    const s = search();
    const answer = (optionIds: string[]) => {
      const g = toGameView(s);
      const id = g.decision.kind === 'choice' ? g.decision.prompt.id : '';
      return intentToFrames({ type: 'answer', promptId: id, answer: { shape: 'chooseN', optionIds } }, s, g);
    };
    expect(answer(['c72'])).toEqual([act('selectCard', { card: 72 }), act('selectButtonOk')]);
    // Two of up to two: the engine ends the input on the second pick; an OK would answer the next input.
    expect(answer(['c71', 'c73'])).toEqual([act('selectCard', { card: 71 }), act('selectCard', { card: 73 })]);
    expect(answer([])).toEqual([act('selectButtonOk')]);
    // Already picked on the server: unpick what the answer drops, pick only what is new.
    s.apply({ t: 'call', method: 'setHighlighted', args: [[card(71)], true] });
    expect(answer(['c72'])).toEqual([act('selectCard', { card: 71 }), act('selectCard', { card: 72 }), act('selectButtonOk')]);
  });

  it('keeps the prompt id while the engine highlights picks', () => {
    const s = search();
    const before = toGameView(s).decision;
    s.apply({ t: 'call', method: 'setHighlighted', args: [[card(71)], true] });
    const after = toGameView(s).decision;
    expect(before.kind === 'choice' && after.kind === 'choice' && before.prompt.id === after.prompt.id).toBe(true);
  });

  it('words the coin toss as "You won the coin toss. Who plays first?", with no "Choose exactly 1" (playtest 1)', () => {
    const s = session();
    s.apply({ t: 'call', method: 'setSelectableTargets', args: [[YOU, { type: 'player', id: 1 }]] });
    // PlayerControllerHuman.chooseStartingPlayer, 3+ players: lblYouHaveWonTheCoinToss + lblWhoWouldYouLiketoStartthisGame
    const msg = 'Hugo, you have won the coin toss.\n\nWho would you like to start this game? (Click on the portrait.)';
    s.apply({ t: 'call', method: 'showPromptMessage', args: [YOU, msg, null] });
    s.apply({ t: 'call', method: 'updateButtons', args: [YOU, 'OK', 'Cancel', false, false, true] });
    const g = toGameView(s);
    expect(g.decision).toMatchObject({
      kind: 'choice',
      prompt: { shape: 'chooseN', title: 'You won the coin toss. Who plays first?', instruction: '', quiet: true, min: 1, max: 1 },
    });
    const id = g.decision.kind === 'choice' ? g.decision.prompt.id : '';
    expect(intentToFrames({ type: 'answer', promptId: id, answer: { shape: 'chooseN', optionIds: ['p0'] } }, s, g)).toEqual([act('selectPlayer', { player: 0 })]);

    // A later game of the match: the loser of the last game chooses.
    s.apply({ t: 'call', method: 'showPromptMessage', args: [YOU, 'Hugo, you lost the last game.\n\nWho would you like to start this game? (Click on the portrait.)', null] });
    expect(toGameView(s).decision).toMatchObject({ prompt: { title: 'You lost the last game. Who plays first?', instruction: '', quiet: true } });
  });

  it('asks who starts with player options (no spell, no Cancel), answered by selectPlayer', () => {
    const s = session();
    s.apply({ t: 'call', method: 'setSelectableTargets', args: [[YOU, { type: 'player', id: 1 }]] });
    s.apply({ t: 'call', method: 'showPromptMessage', args: [YOU, 'Choose the player who goes first (Click on the portrait.)', null] });
    s.apply({ t: 'call', method: 'updateButtons', args: [YOU, 'OK', 'Cancel', false, false, true] });
    const g = toGameView(s);
    expect(g.decision).toMatchObject({
      kind: 'choice',
      prompt: {
        shape: 'chooseN',
        title: 'Choose the player who goes first',
        min: 1,
        max: 1,
        options: [
          { id: 'p0', label: 'Hugo', playerId: '0' },
          { id: 'p1', label: 'AI', playerId: '1' },
        ],
      },
    });
    const id = g.decision.kind === 'choice' ? g.decision.prompt.id : '';
    expect(intentToFrames({ type: 'answer', promptId: id, answer: { shape: 'chooseN', optionIds: ['p1'] } }, s, g)).toEqual([act('selectPlayer', { player: 1 })]);
  });

  it('discards to hand size in the tray, for no card: an earlier click is not its source', () => {
    const s = session();
    s.apply(
      delta1({
        new: [
          { type: 'card', id: 40, props: { Owner: 0, Controller: 0, Zone: 'Battlefield', CurrentState: 'Original' } },
          { type: 'cardState', id: 40, state: 'Original', props: { Name: 'Vivid Marsh', Type: 'Land' } },
          ...[51, 52, 53].flatMap((id): WireObject[] => [
            { type: 'card', id, props: { Owner: 0, Controller: 0, Zone: 'Hand', CurrentState: 'Original' } },
            { type: 'cardState', id, state: 'Original', props: { Name: `Card ${id}`, Type: 'Instant' } },
          ]),
        ],
        changed: [{ type: 'player', id: 0, props: { Battlefield: [10, 30, 40], Hand: [51, 52, 53] } }],
      }),
    );
    // Earlier this turn: Vivid Marsh clicked with priority (its mana ability), then priority again.
    buttons(s, 'OK', 'End Turn', 'Priority: Hugo');
    s.clicked(40);
    buttons(s, 'OK', 'End Turn', 'Priority: Hugo');
    s.apply({ t: 'call', method: 'awaitNextInput', args: [] });
    // Cleanup: InputSelectCardsFromList without a spell ability (no card in showPromptMessage), no Cancel.
    s.apply({ t: 'call', method: 'setSelectables', args: [[card(51), card(52), card(53)], 2, 2] });
    s.apply({
      t: 'call',
      method: 'showPromptMessage',
      args: [YOU, 'Cleanup Phase\nSelect 2 card(s) to discard to bring your hand down to the maximum of 7 cards.', null],
    });
    s.apply({ t: 'call', method: 'updateButtons', args: [YOU, 'OK', 'Cancel', false, false, true] });
    const d = toGameView(s).decision;
    expect(d).toMatchObject({
      kind: 'choice',
      prompt: {
        shape: 'chooseN',
        title: 'Cleanup Phase',
        instruction: 'Select 2 card(s) to discard to bring your hand down to the maximum of 7 cards.',
        min: 2,
        max: 2,
        options: [
          { id: 'c51', cardId: '51' },
          { id: 'c52', cardId: '52' },
          { id: 'c53', cardId: '53' },
        ],
      },
    });
    expect(d.kind === 'choice' && d.prompt.sourceCardId).toBeFalsy();
  });

  it('shows a one-line selection once: as the title, with no instruction', () => {
    const s = session();
    s.apply({ t: 'call', method: 'setSelectables', args: [[card(10)], 1, 1] });
    s.apply({ t: 'call', method: 'showPromptMessage', args: [YOU, 'Select a creature you control', null] });
    s.apply({ t: 'call', method: 'updateButtons', args: [YOU, 'OK', 'Cancel', false, false, true] });
    const d = toGameView(s).decision;
    expect(d).toMatchObject({ kind: 'choice', prompt: { shape: 'chooseN', title: 'Select a creature you control', instruction: '' } });
  });

  it('keeps board targeting for a spell whose targets are on the board', () => {
    const s = session();
    s.apply({ t: 'call', method: 'setSelectables', args: [[card(20)], 1, 1] });
    s.apply({ t: 'call', method: 'setSelectableTargets', args: [[{ type: 'player', id: 1 }]] });
    s.apply({ t: 'call', method: 'showPromptMessage', args: [YOU, 'Bolt - Select any target', card(10)] });
    s.apply({ t: 'call', method: 'updateButtons', args: [YOU, 'OK', 'Cancel', false, true, false] });
    expect(toGameView(s).decision.kind).toBe('chooseTargets');
  });
});

describe('payment, mana sources, "To my turn"', () => {
  it('leaves tapped cards out of the auto-pay plan', () => {
    const s = session();
    buttons(s, 'OK', 'End Turn', 'Priority: Hugo');
    s.clicked(10);
    // 30 is tapped (session()), 10 is not.
    s.apply({ t: 'call', method: 'setWeaklySelectable', args: [[card(10), card(10), card(30), card(30)]] });
    s.apply({ t: 'call', method: 'updateButtons', args: [YOU, 'Auto', 'Cancel', true, true, true] });
    s.apply({ t: 'call', method: 'showPromptMessage', args: [YOU, 'Bears\n\nPay Mana Cost: {1}', card(10)] });
    expect(toGameView(s).decision).toMatchObject({ kind: 'payMana', autoTaps: ['10'] });
  });

  it('names the colour a source adds before "any colour" (Vivid Marsh B, Haven C, a "GU" land G)', () => {
    const s = session();
    const permanent = (id: number, props: object): WireObject[] => [
      { type: 'card', id, props: { Owner: 0, Controller: 0, Zone: 'Battlefield', CurrentState: 'Original' } },
      { type: 'cardState', id, state: 'Original', props: { Type: 'Land', ...props } },
    ];
    s.apply(
      delta1({
        new: [
          ...permanent(41, { Name: 'Vivid Marsh', OrigProduceMana: 'B', OrigProduceAnyMana: true }),
          ...permanent(42, { Name: 'Haven of the Spirit Dragon', OrigProduceAnyMana: true, OracleText: '{T}: Add {C}.\r\n\r\n{T}: Add one mana of any color. Spend this mana only to cast a Dragon creature spell.' }),
          ...permanent(43, { Name: 'Yavimaya Coast', OrigProduceMana: 'GU' }),
          ...permanent(44, { Name: 'Curse of Opulence', Type: 'Enchantment - Aura Curse', OracleText: 'Whenever enchanted player is attacked, create a Gold token. (A Gold token is an artifact with "Sacrifice this token: Add one mana of any color.")' }),
        ],
        changed: [{ type: 'player', id: 0, props: { Battlefield: [10, 30, 41, 42, 43, 44] } }],
      }),
    );
    buttons(s, 'OK', 'End Turn', 'Priority: Hugo');
    expect(toGameView(s).decision).toMatchObject({
      kind: 'priority',
      manaSources: [
        { cardId: '41', colours: ['B'] },
        { cardId: '42', colours: ['C'] },
        { cardId: '43', colours: ['G'] },
      ],
    });
  });

  it('sets the yield marker so that "To my turn" on your own turn waits for your next turn', () => {
    const mine = session('MAIN1', 0);
    buttons(mine, 'OK', 'End Turn');
    expect(intentToFrames({ type: 'passUntilYourTurn' }, mine, toGameView(mine))[0]).toEqual(
      act('sendYieldUpdate', { update: { kind: 'SetMarker', phaseOwner: 0, phase: 'UPKEEP', atOrPastAtClick: true } }),
    );
    const theirs = session('MAIN1', 1);
    expect(intentToFrames({ type: 'passUntilYourTurn' }, theirs, toGameView(theirs))[0]).toEqual(
      act('sendYieldUpdate', { update: { kind: 'SetMarker', phaseOwner: 0, phase: 'UPKEEP', atOrPastAtClick: false } }),
    );
  });

  it('ends "To my turn" when a later turn of yours starts', () => {
    const g = toGameView(session('MAIN1', 0));
    expect(passUntilYourTurnDone(g, 5)).toBe(false);
    expect(passUntilYourTurnDone({ ...g, turn: { ...g.turn, number: 6, activePlayerId: '1' } }, 5)).toBe(false);
    expect(passUntilYourTurnDone({ ...g, turn: { ...g.turn, number: 9 } }, 5)).toBe(true);
  });
});
