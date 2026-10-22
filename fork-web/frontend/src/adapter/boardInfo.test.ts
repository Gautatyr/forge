import { describe, expect, it } from 'vitest';
import type { WireObject } from '../wire/generated/wire';
import { LiveSession } from './session';
import { toGameView } from './toView';

const ALIAS = 2 ** 30;
const YOU = { type: 'player', id: 0 } as const;

const cardObj = (id: number, props: object, state: object): WireObject[] => [
  { type: 'card', id, props: { CurrentState: 'Original', ...props } } as WireObject,
  { type: 'cardState', id, state: 'Original', props: state } as WireObject,
];

/** Two players (you = 0, AI = 1), empty boards: tests add the cards they need. */
function session(objects: WireObject[], player0: object = {}, player1: object = {}, game: object = {}): LiveSession {
  const all: WireObject[] = [
    { type: 'game', id: 1, props: { Players: [1, 0], Turn: 5, Phase: 'MAIN1', PlayerTurn: 0, GameType: 'Commander', Stack: [], ...game } },
    { type: 'player', id: 0, props: { Name: 'Hugo', Life: 40, Hand: [], ...player0 } },
    { type: 'player', id: 1, props: { Name: 'AI', IsAI: true, Life: 40, Hand: [], ...player1 } },
    ...objects,
  ];
  const s = new LiveSession();
  s.apply({ t: 'snapshot', game: 1, seq: 0, label: 't', viewer: { seat: 1, player: 0 }, objects: all, log: [] });
  return s;
}

describe('summoning sickness (pass 2 #6)', () => {
  const bear = (keywords: string[], sick = true) =>
    session(
      cardObj(10, { Owner: 0, Controller: 0, Zone: 'Battlefield', Sickness: sick }, { Name: 'Goblin', Type: 'Creature - Goblin', Power: 2, Toughness: 2, Keywords: keywords }),
      { Battlefield: [10] },
    );
  it('is shown for a creature that came in this turn', () => {
    expect(toGameView(bear([])).cards['10']!.summoningSick).toBe(true);
  });
  it('is not shown when the creature has haste (the engine lets it attack and tap)', () => {
    expect(toGameView(bear(['Haste (This creature can attack and {T} as soon as it comes under your control.)'])).cards['10']!.summoningSick).toBe(false);
    expect(toGameView(bear(['Haste'])).cards['10']!.summoningSick).toBe(false);
  });
  it('keeps the badge for other keywords', () => {
    expect(toGameView(bear(['Flying', 'Hasty Spirit'])).cards['10']!.summoningSick).toBe(true);
  });
});

describe('command zone: castable cards vs effects (#14, pass 2 #8)', () => {
  const s = () =>
    session(
      [
        ...cardObj(40, { Owner: 0, Controller: 0, Zone: 'Command', IsCommander: true, GamePieceType: 'CARD' }, { Name: 'Sythis', Type: 'Legendary Creature - Dryad' }),
        ...cardObj(41, { Owner: 0, Controller: 0, Zone: 'Command', GamePieceType: 'EFFECT', IsEmblem: true }, { Name: 'Emblem - Chandra', Type: 'Emblem' }),
        ...cardObj(42, { Owner: 0, Controller: 0, Zone: 'Command', GamePieceType: 'EFFECT' }, { Name: 'The Monarch', Type: 'Effect' }),
        ...cardObj(43, { Owner: 1, Controller: 1, Zone: 'Command', GamePieceType: 'EFFECT' }, { Name: "Stomp's Effect", Type: 'Effect' }),
        ...cardObj(44, { Owner: 1, Controller: 1, Zone: 'Command', GamePieceType: 'DUNGEON' }, { Name: 'Tomb of Annihilation', Type: 'Dungeon' }),
        ...cardObj(45, { Owner: 0, Controller: 0, Zone: 'Command', GamePieceType: 'CARD' }, { Name: 'Lurrus', Type: 'Legendary Creature - Cat' }),
      ],
      { Command: [40, 41, 42, 45], Commander: [40] },
      { Command: [43, 44] },
    );
  it('keeps only castable cards in `command` and puts engine effects, emblems and dungeons in `effects`', () => {
    const g = toGameView(s());
    expect(g.players[0]).toMatchObject({ command: ['40', '45'], effects: ['41', '42'] });
    expect(g.players[1]).toMatchObject({ command: [], effects: ['43', '44'] });
  });
});

describe('auras on a player (pass 2 #9)', () => {
  it('lists the cards attached to a player on that player', () => {
    const s = session(
      cardObj(60, { Owner: 1, Controller: 1, Zone: 'Battlefield', EntityAttachedTo: { type: 'player', id: 0 } }, { Name: 'Curse of Bounty', Type: 'Enchantment - Aura Curse' }),
      {},
      { Battlefield: [60] },
    );
    s.apply({ t: 'delta', game: 1, seq: 1, ts: 0, new: [], changed: [{ type: 'player', id: 0, props: { AttachedCards: [60] } }], removed: [], log: [], events: [] });
    const g = toGameView(s);
    expect(g.players[0]!.attachments).toEqual(['60']);
    expect(g.players[1]!.attachments ?? []).toEqual([]);
    // It stays on its controller's battlefield, attached to no card.
    expect(g.players[1]!.battlefield).toEqual(['60']);
    expect(g.cards['60']!.attachedTo).toBeUndefined();
  });
  it('leaves out an attachment the viewer cannot see', () => {
    const s = session([], {}, {});
    s.apply({ t: 'delta', game: 1, seq: 1, ts: 0, new: [], changed: [{ type: 'player', id: 0, props: { AttachedCards: [ALIAS + 9] } }], removed: [], log: [], events: [] });
    expect(toGameView(s).players[0]!.attachments ?? []).toEqual([]);
  });
});

describe('cards held by another card: imprint, exiled with (#15)', () => {
  const vat = (imprinted: number[]) =>
    session(
      [
        ...cardObj(70, { Owner: 0, Controller: 0, Zone: 'Battlefield', ImprintedCards: imprinted, ExiledCards: [71] }, { Name: 'Mimic Vat', Type: 'Artifact' }),
        ...cardObj(71, { Owner: 1, Controller: 1, Zone: 'Exile', ExiledWith: 70 }, { Name: 'Dragon', Type: 'Creature - Dragon', Power: 4, Toughness: 4 }),
      ],
      { Battlefield: [70] },
      { Exile: [71] },
    );
  it('names the held card on the holder and the holder on the held card', () => {
    const g = toGameView(vat([71]));
    expect(g.cards['70']!.links).toEqual([
      { kind: 'imprinted', cardIds: ['71'] },
      { kind: 'exiled', cardIds: ['71'] },
    ]);
    expect(g.cards['71']!.links).toEqual([{ kind: 'exiledWith', cardIds: ['70'] }]);
  });
  it('never names a card this viewer cannot see (an unseen id names no object)', () => {
    const g = toGameView(vat([ALIAS + 5, 71]));
    expect(g.cards['70']!.links![0]).toEqual({ kind: 'imprinted', cardIds: ['71'] });
    const only = toGameView(vat([ALIAS + 5]));
    expect(only.cards['70']!.links).toEqual([{ kind: 'exiled', cardIds: ['71'] }]);
  });
  it('has no links when nothing is held', () => {
    const s = session(cardObj(10, { Owner: 0, Controller: 0, Zone: 'Battlefield' }, { Name: 'Bear', Type: 'Creature - Bear', Power: 2, Toughness: 2 }), { Battlefield: [10] });
    expect(toGameView(s).cards['10']!.links).toBeUndefined();
  });
});

describe('P/T breakdown (pass 2 #7)', () => {
  it('has none live: the engine view carries no per-source modifiers, so the view says so', () => {
    const s = session(cardObj(10, { Owner: 0, Controller: 0, Zone: 'Battlefield' }, { Name: 'Bear', Type: 'Creature - Bear', Power: 3, Toughness: 3 }), { Battlefield: [10] });
    expect(toGameView(s).cards['10']!.ptModifiers).toBeUndefined();
  });
});

describe('stack item targets (pass 2 #10)', () => {
  it("takes the chosen mode's targets from the sub-ability", () => {
    const s = session(
      [
        ...cardObj(10, { Owner: 0, Controller: 0, Zone: 'Battlefield' }, { Name: 'Birds of Paradise', Type: 'Creature - Bird', Power: 0, Toughness: 1 }),
        ...cardObj(20, { Owner: 1, Controller: 1, Zone: 'Battlefield' }, { Name: 'Goblin Cratermaker', Type: 'Creature - Goblin', Power: 2, Toughness: 2 }),
        { type: 'stackItem', id: 8, props: { SourceCard: 20, ActivatingPlayer: 1, Ability: true, Description: 'Choose one', SubInstance: 9 } },
        { type: 'stackItem', id: 9, props: { SourceCard: 20, ActivatingPlayer: 1, Ability: true, Description: '2 damage to Birds', TargetCards: [10] } },
      ],
      { Battlefield: [10] },
      { Battlefield: [20] },
      { Stack: [8] },
    );
    expect(toGameView(s).stack).toEqual([expect.objectContaining({ id: '8', targets: [{ kind: 'card', id: '10' }] })]);
  });
  it('keeps the item’s own targets first and lists each target once', () => {
    const s = session(
      [
        ...cardObj(10, { Owner: 0, Controller: 0, Zone: 'Battlefield' }, { Name: 'Bear', Type: 'Creature - Bear', Power: 2, Toughness: 2 }),
        { type: 'stackItem', id: 8, props: { SourceCard: 10, ActivatingPlayer: 1, Ability: true, TargetPlayers: [0], SubInstance: 9 } },
        { type: 'stackItem', id: 9, props: { SourceCard: 10, ActivatingPlayer: 1, Ability: true, TargetPlayers: [0], TargetCards: [10], SubInstance: 11 } },
        { type: 'stackItem', id: 11, props: { SourceCard: 10, ActivatingPlayer: 1, Ability: true, TargetCards: [10] } },
      ],
      { Battlefield: [10] },
      {},
      { Stack: [8] },
    );
    expect(toGameView(s).stack[0]!.targets).toEqual([
      { kind: 'player', id: '0' },
      { kind: 'card', id: '10' },
    ]);
  });
});

describe('reveal title (pass 1 #8)', () => {
  const reveal = (hand1: number[], shown: number[], message = "Looking at cards in AI's hand") => {
    const s = session(
      [
        ...cardObj(25, { Owner: 1, Controller: 1, Zone: 'Hand' }, { Name: 'Port Town', Type: 'Land' }),
        ...cardObj(26, { Owner: 1, Controller: 1, Zone: 'Hand' }, { Name: 'Lightning Bolt', Type: 'Instant' }),
        { type: 'card', id: ALIAS + 2, props: { Owner: 1, Controller: 1, Zone: 'Hand' } } as WireObject,
      ],
      {},
      { Hand: hand1 },
    );
    s.apply({ t: 'call', method: 'showRevealedCards', args: [shown.map((id) => ({ type: 'card', id }))] });
    s.apply({ t: 'call', method: 'showPromptMessage', args: [YOU, message, null] });
    s.apply({ t: 'call', method: 'updateButtons', args: [YOU, 'OK', '', true, false, true] });
    const d = toGameView(s).decision;
    return d.kind === 'choice' ? d.prompt : undefined;
  };
  it('names the revealed card when it is only part of the hand', () => {
    expect(reveal([ALIAS + 2, 25], [25])).toMatchObject({ title: 'Revealed: Port Town', instruction: "From AI's hand." });
  });
  it('counts several revealed cards', () => {
    expect(reveal([ALIAS + 2, 25, 26], [25, 26])).toMatchObject({ title: 'Revealed: 2 cards' });
  });
  it('keeps the engine’s title when the whole hand is shown', () => {
    expect(reveal([25, 26], [25, 26])).toMatchObject({ title: "Looking at cards in AI's hand", instruction: '' });
  });
  it('keeps any other engine message', () => {
    expect(reveal([ALIAS + 2, 25], [25], 'AI reveals Port Town')).toMatchObject({ title: 'AI reveals Port Town' });
  });
});
