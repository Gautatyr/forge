import { describe, expect, it } from 'vitest';
import { player } from '../model/selectors';
import type { GameView } from '../model/types';
import { primaryAction, promptText } from '../state/primaryAction';
import { DEFAULT_STOPS } from '../state/prefs';
import { INITIAL_UI } from '../state/ui';
import { gunzipDataUrl, parseRecording, RECORDINGS } from './replay';
import { LiveSession } from './session';
import { toGameView } from './toView';
import fixture from './fixtures/commander4-seat0.jsonl.gz?inline';

// A full 4-player Commander game (C17/C20 precons, AI only) recorded from seat 0's stream with
// scripts/record-stream.mjs against `make web-server ARGS="--mode commander --speed fast"`.
const frames = parseRecording(await gunzipDataUrl(fixture));

function replay(upTo = frames.length): { s: LiveSession; views: GameView[] } {
  const s = new LiveSession();
  const views: GameView[] = [];
  for (const f of frames.slice(0, upTo)) {
    expect(s.apply(f)).toBe('ok');
    if (s.gameObject?.props.Players?.length) views.push(toGameView(s));
  }
  return { s, views };
}

const { s: end, views } = replay();

describe('recorded 4-player Commander stream', () => {
  it('is one hello, snapshots and an unbroken run of deltas up to the final one', () => {
    expect(frames[0]!.t).toBe('hello');
    expect(frames.filter((f) => f.t === 'delta').length).toBeGreaterThan(500);
    expect(end.finished).toBe(true);
    expect(end.awaitingSnapshot).toBe(false);
  });

  it('maps every state to a view the screen can draw', () => {
    for (const g of views) {
      expect(g.players).toHaveLength(4);
      expect(g.players[0]!.isYou).toBe(true);
      expect(g.players.map((p) => p.seat)).toEqual([0, 1, 2, 3]);
      for (const p of g.players) {
        for (const id of [...p.hand, ...p.battlefield, ...p.graveyard, ...p.exile, ...p.command, ...p.commanders]) {
          expect(g.cards[id], `card ${id} of ${p.name}`).toBeDefined();
        }
        if (!p.isYou) expect(p.hand).toEqual([]);
      }
      for (const c of Object.values(g.cards)) {
        if (c.attachedTo) expect(g.cards[c.attachedTo] ?? null, `host of ${c.name}`).not.toBeNull();
      }
      for (const item of g.stack) expect(g.players.some((p) => p.id === item.controllerId)).toBe(true);
      for (const e of g.log) for (const m of e.text.matchAll(/\{card:([^}]+)\}/g)) expect(g.cards[m[1]!]).toBeDefined();
      // The screen's own derivations must not throw on any state.
      expect(primaryAction(g, INITIAL_UI, DEFAULT_STOPS).label).toBeTruthy();
      expect(promptText(g)).toBeTruthy();
      expect(() => player(g, g.turn.activePlayerId)).not.toThrow();
    }
  });

  it('shows the state seat 0 had mid-game', () => {
    const { s } = replay(250);
    const g = toGameView(s);
    expect(g.format).toBe('commander');
    expect(g.turn).toMatchObject({ number: 21, activePlayerId: '1', step: 'draw', priorityPlayerId: '1' });
    const me = g.players[0]!;
    expect(me).toMatchObject({ id: '0', life: 37, startingLife: 40, handCount: 4, libraryCount: 85, isAi: true });
    expect(me.hand).toEqual(['85', '11', '12', '39']);
    expect(me.commanders).toEqual(['100']);
    expect(g.cards['100']).toMatchObject({ name: 'The Ur-Dragon', isCommander: true, zone: 'command', power: 10, toughness: 10 });
    expect(g.cards['100']!.keywords.map((k) => k.name)).toEqual(['Flying']);
    expect(g.cards['21']).toMatchObject({ name: 'Island', tapped: true, zone: 'battlefield' });
    expect(g.cards['21']!.front.typeLine).toBe('Basic Land — Island');
    const opp = g.players.find((p) => p.id === '2')!;
    expect(opp).toMatchObject({ life: 29, handCount: 6, hand: [], commanderCasts: { '302': 1 } });
    expect(g.decision).toEqual({ kind: 'waiting', forPlayerId: '1', what: expect.stringContaining('AI 2') });
  });

  it('puts the stack bottom to top', () => {
    const { s } = replay(116);
    const g = toGameView(s);
    // The engine sent Stack [12, 8]: Frantic Search (12) was cast in response to Fertilid (8).
    expect(g.stack.map((i) => i.id)).toEqual(['8', '12']);
    expect(g.stack.at(-1)).toMatchObject({ kind: 'spell', sourceCardId: '254', controllerId: '2' });
    expect(g.stack.at(-1)!.text).toMatch(/^Frantic Search/);
  });

  it('ends with three players out', () => {
    const last = views.at(-1)!;
    expect(last.players.filter((p) => p.hasLost)).toHaveLength(3);
  });

  it('lists the commander precon replay', () => {
    expect(Object.keys(RECORDINGS)).toContain('commander4');
  });
});
