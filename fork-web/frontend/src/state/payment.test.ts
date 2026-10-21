import { describe, expect, it } from 'vitest';
import { applyIntent, type MockGame } from '../mock/engine';
import { SCENARIOS, scenarioById } from '../mock/scenarios';
import type { GameView } from '../model/types';
import { cardClick } from './cardClick';
import { cardStatus } from './cardStatus';
import { DEFAULT_STOPS } from './prefs';
import { primaryAction, promptText } from './primaryAction';
import { INITIAL_UI } from './ui';

const named = (g: GameView, name: string, pred: (c: GameView['cards'][string]) => boolean = () => true) =>
  Object.values(g.cards).find((c) => c.name === name && pred(c))!;
const yourUntapped = (g: GameView, name: string) =>
  named(g, name, (c) => c.zone === 'battlefield' && !c.tapped && c.controllerId === g.youId);

describe('no hand-holding highlights (design pass 4, P1)', () => {
  it('with priority, no card is ringed, badged or dimmed, whatever you can play', () => {
    for (const id of ['priority', 'hand9', 'duel', 'keywords']) {
      const g = scenarioById(id).build();
      expect(g.decision.kind).toBe('priority');
      for (const cid of Object.keys(g.cards)) {
        const s = cardStatus(g, INITIAL_UI, cid);
        expect(s.actionable, `${id} ${cid}`).toBe(false);
        expect(s.dimmed).toBe(false);
        expect(s).not.toHaveProperty('playable');
      }
    }
  });

  it('no prompt mentions lit cards', () => {
    for (const { id } of SCENARIOS) expect(promptText(scenarioById(id).build())).not.toMatch(/\blit\b/i);
    const g = scenarioById('hand9').build();
    const path = g.players[0]!.hand.find((c) => g.cards[c]!.name === 'Path to Exile')!;
    expect(promptText(applyIntent(g, { type: 'play', cardId: path }))).not.toMatch(/\blit\b/i);
  });

  it('uses the new prompt copy', () => {
    expect(promptText(scenarioById('priority').build())).toBe("Mira's Lightning Bolt is on top of the stack. Respond, or let it resolve.");
    expect(promptText(scenarioById('hand9').build())).toBe('Your main phase.');
    const g = scenarioById('hand9').build();
    const anaCombat: GameView = { ...g, turn: { ...g.turn, activePlayerId: 'ana', step: 'declareAttackers' } };
    expect(promptText(anaCombat)).toBe("Ana's turn · combat.");
    expect(promptText({ ...g, turn: { ...g.turn, step: 'upkeep' } })).toBe('Your turn · upkeep.');
  });
});

describe('a click with priority', () => {
  const g = scenarioById('hand9').build();

  it('plays a card you can play', () => {
    const forest = g.players[0]!.hand.find((c) => g.cards[c]!.name === 'Forest')!;
    expect(cardClick(g, forest)).toEqual({ kind: 'intent', intent: { type: 'play', cardId: forest } });
  });

  it("gives a neutral note for a card you can't play", () => {
    const duel = scenarioById('duel').build();
    const titan = named(duel, 'Primeval Titan');
    expect(cardClick(duel, titan.id)).toEqual({ kind: 'note', text: "You can't play Primeval Titan right now." });
  });

  it('taps a land for mana; a land with two colours asks which', () => {
    const forest = yourUntapped(g, 'Forest');
    expect(cardClick(g, forest.id)).toEqual({ kind: 'intent', intent: { type: 'tapForMana', cardId: forest.id } });
    const temple = yourUntapped(g, 'Temple Garden');
    expect(cardClick(g, temple.id)).toEqual({ kind: 'chooseMana', cardId: temple.id, colours: ['G', 'W'] });
  });

  it('activates any other permanent of yours; an opponent permanent does nothing', () => {
    const eidolon = named(g, 'Eidolon of Blossoms');
    expect(cardClick(g, eidolon.id)).toEqual({ kind: 'intent', intent: { type: 'activate', cardId: eidolon.id } });
    // A tapped land is no mana source now: the click tries its other abilities.
    const tapped = named(g, 'Forest', (c) => c.zone === 'battlefield' && c.tapped);
    expect(cardClick(g, tapped.id)).toEqual({ kind: 'intent', intent: { type: 'activate', cardId: tapped.id } });
    expect(cardClick(g, named(g, 'Krenko, Mob Boss').id)).toEqual({ kind: 'none' });
  });

  it('leaves target, combat and choice clicks to the match context', () => {
    const b = scenarioById('blockers').build();
    expect(cardClick(b, Object.keys(b.cards)[0]!)).toEqual({ kind: 'default' });
  });
});

describe('while paying', () => {
  const pay = (): MockGame => {
    const g = scenarioById('hand9').build();
    const hi = g.players[0]!.hand.find((c) => g.cards[c]!.name === 'Heroic Intervention')!;
    return applyIntent(g, { type: 'play', cardId: hi });
  };

  it('rings only the sources that can still pay, with a mana mark; your other permanents dim, opponents do not', () => {
    const g = pay();
    const forest = cardStatus(g, INITIAL_UI, yourUntapped(g, 'Forest').id);
    expect(forest).toMatchObject({ actionable: true, actionKind: 'mana', dimmed: false });
    expect(cardStatus(g, INITIAL_UI, named(g, 'Eidolon of Blossoms').id)).toMatchObject({ actionable: false, dimmed: true });
    expect(cardStatus(g, INITIAL_UI, named(g, 'Krenko, Mob Boss').id).dimmed).toBe(false);
    if (g.decision.kind !== 'payMana') throw new Error('not paying');
    expect(cardStatus(g, INITIAL_UI, g.decision.sourceCardId).selected).toBe(true);
  });

  it('a click taps a source; a dual land asks which colour; other cards do nothing', () => {
    const g = pay();
    const forest = yourUntapped(g, 'Forest');
    expect(cardClick(g, forest.id)).toEqual({ kind: 'intent', intent: { type: 'tapForMana', cardId: forest.id } });
    expect(cardClick(g, yourUntapped(g, 'Temple Garden').id)).toMatchObject({ kind: 'chooseMana', colours: ['G', 'W'] });
    expect(cardClick(g, named(g, 'Eidolon of Blossoms').id)).toEqual({ kind: 'none' });
  });

  it('the main button pays the rest automatically and names what it taps', () => {
    const g = pay();
    const a = primaryAction(g, INITIAL_UI, DEFAULT_STOPS);
    expect(a).toMatchObject({ label: 'Pay automatically', enabled: true, intent: { type: 'payAuto' } });
    expect(a.detail).toMatch(/^Taps: Forest, /);
  });

  it('says so when untapped sources fall short', () => {
    const g = pay();
    if (g.decision.kind !== 'payMana') throw new Error('not paying');
    const short: GameView = { ...g, decision: { ...g.decision, autoCanPay: false } };
    expect(primaryAction(short, INITIAL_UI, DEFAULT_STOPS)).toMatchObject({ enabled: false, detail: 'Not enough untapped mana' });
  });
});
