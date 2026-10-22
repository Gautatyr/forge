import { describe, expect, it } from 'vitest';
import type { CallMessage, DeltaMessage, SnapshotMessage } from '../wire/generated/wire';
import { LiveSession } from './session';

const snapshot = (game = 1, seq = 10): SnapshotMessage => ({
  t: 'snapshot',
  game,
  seq,
  label: 'test',
  viewer: { seat: 0, player: 0 },
  objects: [
    { type: 'game', id: 1, props: { Players: [0, 1], Turn: 3, Phase: 'MAIN1', PlayerTurn: 0 } },
    { type: 'player', id: 0, props: { Life: 20, Battlefield: [10] } },
    { type: 'card', id: 10, props: { Zone: 'Battlefield', Owner: 0, Controller: 0, Tapped: true } },
  ],
  log: [{ type: 'TURN', msg: 'Turn 3 (P0)' }],
});

const delta = (seq: number, d: Partial<DeltaMessage> = {}): DeltaMessage => ({
  t: 'delta',
  game: 1,
  seq,
  ts: 0,
  new: [],
  changed: [],
  removed: [],
  log: [],
  events: [],
  ...d,
});

describe('LiveSession state stream', () => {
  it('applies new, then changed (null = default), then removed', () => {
    const s = new LiveSession();
    s.apply(snapshot());
    expect(
      s.apply(
        delta(11, {
          new: [{ type: 'card', id: 11, props: { Zone: 'Hand', Owner: 0, Controller: 0 } }],
          changed: [
            { type: 'card', id: 10, props: { Tapped: null, Damage: 2 } },
            { type: 'player', id: 0, props: { Life: 17 } },
          ],
          removed: ['card:11'],
          log: [{ type: 'DAMAGE', msg: 'ouch' }],
        }),
      ),
    ).toBe('ok');
    expect(s.get('card', 10)!.props).toEqual({ Zone: 'Battlefield', Owner: 0, Controller: 0, Damage: 2 });
    expect(s.get('player', 0)!.props.Life).toBe(17);
    expect(s.get('card', 11)).toBeUndefined();
    expect(s.log.map((e) => e.msg)).toEqual(['Turn 3 (P0)', 'ouch']);
    expect(s.log[1]!.turn).toBe(3);
  });

  it('asks for a resync on a seq gap and drops deltas until the next snapshot', () => {
    const s = new LiveSession();
    s.apply(snapshot());
    expect(s.apply(delta(13, { changed: [{ type: 'player', id: 0, props: { Life: 1 } }] }))).toBe('resync');
    expect(s.awaitingSnapshot).toBe(true);
    expect(s.apply(delta(14, { changed: [{ type: 'player', id: 0, props: { Life: 2 } }] }))).toBe('ok');
    expect(s.get('player', 0)!.props.Life).toBe(20);
    s.apply(snapshot(1, 20));
    expect(s.awaitingSnapshot).toBe(false);
    expect(s.apply(delta(21))).toBe('ok');
  });

  it('treats a delta of another game as a gap', () => {
    const s = new LiveSession();
    s.apply(snapshot(1, 5));
    expect(s.apply({ ...delta(6), game: 2 })).toBe('resync');
  });

  it('marks the game finished on the final delta', () => {
    const s = new LiveSession();
    s.apply(snapshot());
    s.apply(delta(11, { final: true }));
    expect(s.finished).toBe(true);
  });

  it('bumps the version on every frame', () => {
    const s = new LiveSession();
    s.apply(snapshot());
    const v = s.version;
    s.apply(delta(11));
    expect(s.version).toBe(v + 1);
  });
});

const P0 = { type: 'player', id: 0 } as const;
const card = (id: number) => ({ type: 'card', id }) as const;
/** InputBase.showSelection: what the prompt marks (forge.gamemodes.match.Selection). */
const selection = (sel: { cards?: object[]; min?: number; max?: number; targets?: object[]; chosen?: object[] }): CallMessage => ({
  t: 'call',
  method: 'setSelection',
  args: [{ kind: 'Selection', cards: [], min: 0, max: 0, targets: [], chosen: [], ...sel }],
});
const confirm = (id: number) => ({ t: 'prompt', id, method: 'confirm', shape: 'confirm', message: 'Draw?', yes: 'Yes', no: 'No', default: true }) as const;

describe('LiveSession input state (bridge seat protocol)', () => {
  it('follows showPromptMessage, updateButtons and setSelection with {type,id} refs', () => {
    const s = new LiveSession();
    s.apply(snapshot());
    const offered = { cards: [card(10), card(12)], min: 1, max: 1, targets: [{ type: 'player', id: 1 }] };
    s.apply({ t: 'call', method: 'showPromptMessage', args: [P0, 'Lightning Bolt - Select target', card(33)] });
    s.apply({ t: 'call', method: 'updateButtons', args: [P0, 'OK', 'Cancel', false, true, false] });
    s.apply(selection(offered));
    s.apply(selection({ ...offered, chosen: [{ type: 'player', id: 1 }] }));
    expect(s.input).toEqual({
      ownerId: 0,
      message: 'Lightning Bolt - Select target',
      cardId: 33,
      namesCard: true,
      ok: { label: 'OK', enabled: false },
      cancel: { label: 'Cancel', enabled: true },
      selectable: { cards: [10, 12], min: 1, max: 1 },
      targets: [{ type: 'player', id: 1 }],
      highlighted: [{ type: 'player', id: 1 }],
    });
    s.apply(selection(offered));
    expect(s.input.highlighted).toEqual([]);
    // InputSyncronizedBase.stop: only the marks kept while the spell's cost is paid
    s.apply(selection({ chosen: [card(12)] }));
    expect(s.input.selectable).toBeUndefined();
    expect(s.input.targets).toEqual([]);
    expect(s.input.highlighted).toEqual([card(12)]);
  });

  it('offers no cards for a selection that picks none (max 0: stack items only)', () => {
    const s = new LiveSession();
    s.apply(selection({ targets: [{ type: 'stackItem', id: 7 }] }));
    expect(s.input.selectable).toBeUndefined();
    expect(s.input.targets).toEqual([{ type: 'stackItem', id: 7 }]);
  });

  it('keeps the selection across awaitNextInput: the engine sends one only when it changes', () => {
    const s = new LiveSession();
    s.apply(selection({ chosen: [card(12)] }));
    s.apply({ t: 'call', method: 'awaitNextInput', args: [] });
    expect(s.input.highlighted).toEqual([card(12)]);
  });

  it('ends the input on awaitNextInput', () => {
    const s = new LiveSession();
    s.apply({ t: 'call', method: 'updateButtons', args: [P0, 'OK', 'End Turn', true, true, true] });
    s.apply({ t: 'call', method: 'awaitNextInput', args: [] });
    expect(s.input.ok.enabled || s.input.cancel.enabled).toBe(false);
  });

  it('counts weakly selectable cards by strength (listed twice = the auto-pay plan)', () => {
    const s = new LiveSession();
    s.apply({ t: 'call', method: 'setWeaklySelectable', args: [[card(1), card(2), card(2)]] });
    expect(s.weakly).toEqual(new Map([[1, 1], [2, 2]]));
    s.apply({ t: 'call', method: 'clearWeaklySelectable', args: [] });
    expect(s.weakly.size).toBe(0);
  });

  it('holds prompts until closed; a sent reply hides it until rejected', () => {
    const s = new LiveSession();
    s.apply(confirm(7));
    expect(s.prompt?.id).toBe(7);
    s.answered(8);
    expect(s.prompt?.id).toBe(7);
    s.answered(7);
    expect(s.prompt).toBeUndefined();
    s.apply({ t: 'replyRejected', id: 7, reason: 'expected a boolean' });
    expect(s.prompt?.id).toBe(7);
    expect(s.notices.at(-1)?.text).toContain('expected a boolean');
    s.apply({ t: 'promptClosed', id: 7, reason: 'answered' });
    expect(s.prompt).toBeUndefined();
  });

  it('shows the oldest of several open prompts', () => {
    const s = new LiveSession();
    s.apply(confirm(3));
    s.apply(confirm(4));
    expect(s.prompt?.id).toBe(3);
    s.apply({ t: 'promptClosed', id: 3, reason: 'timeout' });
    expect(s.prompt?.id).toBe(4);
  });

  it('drops prompts and input on every snapshot: the greeting after it re-sends what is still open', () => {
    const s = new LiveSession();
    s.apply(snapshot(1));
    s.apply(confirm(1));
    s.apply(confirm(3));
    s.apply({ t: 'call', method: 'updateButtons', args: [P0, 'OK', 'Cancel', true, true, true] });
    s.apply({ t: 'call', method: 'setWeaklySelectable', args: [[card(10)]] });
    s.apply({ t: 'call', method: 'showRevealedCards', args: [[card(10)]] });
    s.answered(3);
    // Reconnect: prompt 1 closed while the socket was down; only prompt 3 is still open.
    s.apply(snapshot(1, 40));
    expect(s.prompt).toBeUndefined();
    expect(s.prompts).toEqual([]);
    expect(s.input.ok.enabled || s.input.cancel.enabled).toBe(false);
    expect(s.weakly.size).toBe(0);
    expect(s.revealed).toEqual([]);
    s.apply(confirm(3));
    expect(s.prompt?.id).toBe(3);
    s.apply(snapshot(2, 0));
    expect(s.prompt).toBeUndefined();
  });

  it('tags log entries with the turn their TURN line names, not the current turn', () => {
    const s = new LiveSession();
    const snap = snapshot(1, 10);
    snap.objects[0] = { type: 'game', id: 1, props: { Players: [0, 1], Turn: 24, Phase: 'MAIN1', PlayerTurn: 0 } };
    snap.log = [
      { type: 'LAND', msg: 'before' },
      { type: 'TURN', msg: 'Turn 5 (P0)' },
      { type: 'LAND', msg: 'in five' },
      { type: 'TURN', msg: 'Turn 6 (P1 (Deck))' },
      { type: 'LAND', msg: 'in six' },
    ];
    s.apply(snap);
    expect(s.log.map((e) => e.turn)).toEqual([4, 5, 5, 6, 6]);
    s.apply(delta(11, { log: [{ type: 'LAND', msg: 'still six' }] }));
    expect(s.log.at(-1)!.turn).toBe(6);
    s.apply(delta(12, { log: [{ type: 'TURN', msg: 'Turn 7 (P0)' }, { type: 'LAND', msg: 'seven' }] }));
    expect(s.log.slice(-2).map((e) => e.turn)).toEqual([7, 7]);
  });

  it('collects engine messages and rejected actions as notices', () => {
    const s = new LiveSession();
    s.apply({ t: 'call', method: 'showErrorDialog', args: ['Not enough mana', 'Error'] });
    s.apply({ t: 'actionRejected', method: 'selectCard', reason: 'unknown card' });
    expect(s.notices.map((n) => n.text)).toEqual(['Error: Not enough mana', 'selectCard: unknown card']);
    // the engine's default title "Forge" is no title, and its card ids are not for the player (Block UX note 4)
    s.apply({ t: 'call', method: 'message', args: ["Llanowar Elves (12) can't block", 'Forge'] });
    expect(s.notices.at(-1)?.text).toBe("Llanowar Elves can't block");
    expect(s.notices[1]!.id).toBeGreaterThan(s.notices[0]!.id);
  });

  it('says nothing when a bridge does not know setLanguage, but shows any other rejection', () => {
    const s = new LiveSession();
    s.apply({ t: 'rejected', reason: 'unknown message type' });
    expect(s.notices).toEqual([]);
    s.apply({ t: 'rejected', reason: 'bad frame' });
    expect(s.notices.map((n) => n.text)).toEqual(['bad frame']);
  });
});
