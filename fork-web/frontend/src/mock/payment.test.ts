import { describe, expect, it } from 'vitest';
import type { Intent } from '../model/intents';
import type { CardId, Decision } from '../model/types';
import { applyIntent, type MockGame } from './engine';
import { scenarioById } from './scenarios';

const byName = (g: MockGame, name: string) => Object.values(g.cards).filter((c) => c.name === name);
const inHand = (g: MockGame, name: string) => g.players[0]!.hand.find((id) => g.cards[id]!.name === name)!;
const untapped = (g: MockGame, name: string) => byName(g, name).find((c) => c.zone === 'battlefield' && !c.tapped && c.controllerId === 'you')!;
const run = (g: MockGame, ...intents: Intent[]) => intents.reduce(applyIntent, g);
function paying(d: Decision): Extract<Decision, { kind: 'payMana' }> {
  if (d.kind !== 'payMana') throw new Error(`expected payMana, got ${d.kind}`);
  return d;
}

/** Hand-9 table (Sythis in the command zone), your main phase, empty stack. */
const table = () => scenarioById('hand9').build();

describe('manual payment (design pass 4, §2.1)', () => {
  it('casting opens payment mode instead of paying; the card waits in hand', () => {
    const g0 = table();
    const hi = inHand(g0, 'Heroic Intervention');
    const g = applyIntent(g0, { type: 'play', cardId: hi });
    const d = paying(g.decision);
    expect(d).toMatchObject({ sourceCardId: hi, cost: '{1}{G}', remaining: '{1}{G}', tax: 0, canUndoTap: false });
    expect(g.cards[hi]!.zone).toBe('hand');
    const sources = new Set(d.sources.map((s) => g.cards[s.cardId]!.name));
    expect(sources).toEqual(new Set(['Forest', 'Plains', 'Temple Garden', 'Command Tower', 'Krosan Verge']));
    // Tapped lands and the tapped Elvish Mystic cannot pay.
    for (const s of d.sources) expect(g.cards[s.cardId]!.tapped).toBe(false);
  });

  it('each tap pays; the spell goes on the stack once the cost is paid, with no confirm', () => {
    let g = table();
    const hi = inHand(g, 'Heroic Intervention');
    g = applyIntent(g, { type: 'play', cardId: hi });
    const forest = untapped(g, 'Forest').id;
    g = applyIntent(g, { type: 'tapForMana', cardId: forest });
    expect(paying(g.decision)).toMatchObject({ remaining: '{1}', canUndoTap: true });
    expect(g.cards[forest]!.tapped).toBe(true);
    // Once {G} is paid, the Forests still pay the generic part.
    g = applyIntent(g, { type: 'tapForMana', cardId: untapped(g, 'Plains').id });
    expect(g.decision.kind).toBe('priority');
    expect(g.stack.at(-1)?.sourceCardId).toBe(hi);
    expect(g.cards[hi]!.zone).toBe('stack');
  });

  it('a source that no longer helps is not offered; a dual land offers only the kinds that still pay', () => {
    let g = table();
    g = applyIntent(g, { type: 'play', cardId: inHand(g, 'Heroic Intervention') });
    g = applyIntent(g, { type: 'tapForMana', cardId: untapped(g, 'Plains').id }); // pays the {1}
    const d = paying(g.decision);
    expect(d.remaining).toBe('{G}');
    const names = d.sources.map((s) => g.cards[s.cardId]!.name);
    expect(names).not.toContain('Plains');
    expect(names).not.toContain('Krosan Verge');
    const temple = d.sources.find((s) => g.cards[s.cardId]!.name === 'Temple Garden')!;
    expect(temple.colours).toEqual(['G']);
  });

  it('a dual land needs a colour when two kinds still help', () => {
    let g = table();
    g = applyIntent(g, { type: 'play', cardId: inHand(g, 'Heroic Intervention') });
    const temple = untapped(g, 'Temple Garden').id;
    expect(paying(g.decision).sources.find((s) => s.cardId === temple)!.colours).toEqual(['G', 'W']);
    expect(applyIntent(g, { type: 'tapForMana', cardId: temple })).toBe(g);
    g = applyIntent(g, { type: 'tapForMana', cardId: temple, colour: 'W' });
    expect(paying(g.decision).remaining).toBe('{G}');
  });

  it('Z undoes the last tap; Esc cancels: the card goes back and its sources untap', () => {
    let g = table();
    const hi = inHand(g, 'Heroic Intervention');
    g = applyIntent(g, { type: 'play', cardId: hi });
    const forest = untapped(g, 'Forest').id;
    g = applyIntent(g, { type: 'tapForMana', cardId: forest });
    const undone = applyIntent(g, { type: 'undoTap' });
    expect(undone.cards[forest]!.tapped).toBe(false);
    expect(paying(undone.decision)).toMatchObject({ remaining: '{1}{G}', canUndoTap: false });

    const cancelled = applyIntent(g, { type: 'cancel' });
    expect(cancelled.decision.kind).toBe('priority');
    expect(cancelled.cards[forest]!.tapped).toBe(false);
    expect(cancelled.cards[hi]!.zone).toBe('hand');
    expect(cancelled.stack.some((s) => s.sourceCardId === hi)).toBe(false);
  });

  it('pays automatically with exactly the previewed sources', () => {
    let g = table();
    const hi = inHand(g, 'Heroic Intervention');
    g = applyIntent(g, { type: 'play', cardId: hi });
    const d = paying(g.decision);
    expect(d.autoCanPay).toBe(true);
    expect(d.autoTaps).toHaveLength(2);
    // {G} from a Forest first; the generic part never uses a land that adds two colours.
    const names = d.autoTaps.map((id) => g.cards[id]!.name);
    expect(names[0]).toBe('Forest');
    expect(names).not.toContain('Temple Garden');
    expect(names).not.toContain('Command Tower');
    const after = applyIntent(g, { type: 'payAuto' });
    expect(after.decision.kind).toBe('priority');
    for (const id of d.autoTaps) expect(after.cards[id]!.tapped).toBe(true);
    expect(after.stack.at(-1)?.sourceCardId).toBe(hi);
  });

  it('includes the commander tax in the cost', () => {
    let g = table();
    const sythis = g.players[0]!.command[0]!;
    g = applyIntent(g, { type: 'play', cardId: sythis });
    expect(paying(g.decision)).toMatchObject({ cost: '{2}{G}{W}', tax: 2 });
    g = applyIntent(g, { type: 'payAuto' });
    expect(g.cards[sythis]!.zone).toBe('stack');
    expect(g.players[0]!.commanderCasts[sythis]).toBe(2);
  });

  it('asks for X first, then pays the cost with X in it', () => {
    let g = scenarioById('payment').build();
    g = applyIntent(g, { type: 'cancel' }); // leave the Sythis payment the scenario opens on
    const gsz = inHand(g, "Green Sun's Zenith");
    g = applyIntent(g, { type: 'play', cardId: gsz });
    expect(g.decision.kind === 'choice' && g.decision.prompt.shape === 'input').toBe(true);
    const promptId = g.decision.kind === 'choice' ? g.decision.prompt.id : '';
    g = applyIntent(g, { type: 'answer', promptId, answer: { shape: 'input', value: '3' } });
    expect(paying(g.decision)).toMatchObject({ sourceCardId: gsz, cost: '{3}{G}', remaining: '{3}{G}', x: 3 });
  });
});

describe('floating mana', () => {
  it('with priority, tapping a land adds its mana to your pool', () => {
    let g = table();
    const forest = untapped(g, 'Forest').id;
    expect(g.decision.kind === 'priority' && g.decision.manaSources?.some((s) => s.cardId === forest)).toBe(true);
    g = applyIntent(g, { type: 'tapForMana', cardId: forest });
    expect(g.players[0]!.manaPool).toEqual({ G: 1 });
    expect(g.cards[forest]!.tapped).toBe(true);
    expect(g.decision.kind === 'priority' && g.decision.manaSources?.some((s) => s.cardId === forest)).toBe(false);
  });

  it('a dual land asks for its colour, a Sol Ring-like source adds all its mana', () => {
    let g = table();
    const temple = untapped(g, 'Temple Garden').id;
    expect(applyIntent(g, { type: 'tapForMana', cardId: temple })).toBe(g);
    g = applyIntent(g, { type: 'tapForMana', cardId: temple, colour: 'W' });
    expect(g.players[0]!.manaPool).toEqual({ W: 1 });
  });

  it('clicking a pool symbol spends it on the cost; Z gives it back', () => {
    let g = table();
    g = applyIntent(g, { type: 'tapForMana', cardId: untapped(g, 'Forest').id });
    g = applyIntent(g, { type: 'play', cardId: inHand(g, 'Heroic Intervention') });
    expect(paying(g.decision).remaining).toBe('{1}{G}');
    g = applyIntent(g, { type: 'spendPool', colour: 'G' });
    expect(paying(g.decision).remaining).toBe('{1}');
    expect(g.players[0]!.manaPool?.G ?? 0).toBe(0);
    const back = applyIntent(g, { type: 'undoTap' });
    expect(back.players[0]!.manaPool?.G).toBe(1);
    // Spending mana that pays nothing is refused.
    expect(applyIntent(g, { type: 'spendPool', colour: 'W' })).toBe(g);
  });

  it('pay automatically spends the pool first', () => {
    let g = table();
    g = applyIntent(g, { type: 'tapForMana', cardId: untapped(g, 'Forest').id });
    g = applyIntent(g, { type: 'play', cardId: inHand(g, 'Heroic Intervention') });
    expect(paying(g.decision).autoTaps).toHaveLength(1);
    g = applyIntent(g, { type: 'payAuto' });
    expect(g.decision.kind).toBe('priority');
    expect(g.players[0]!.manaPool?.G ?? 0).toBe(0);
  });

  it('cancel returns spent pool mana', () => {
    let g = table();
    g = applyIntent(g, { type: 'tapForMana', cardId: untapped(g, 'Forest').id });
    g = run(g, { type: 'play', cardId: inHand(g, 'Heroic Intervention') }, { type: 'spendPool', colour: 'G' }, { type: 'cancel' });
    expect(g.players[0]!.manaPool).toEqual({ G: 1 });
  });

  it('empties at the end of the step', () => {
    let g = table();
    g = applyIntent(g, { type: 'tapForMana', cardId: untapped(g, 'Forest').id });
    g = applyIntent(g, { type: 'primary' }); // main 1 → combat
    expect(g.players[0]!.manaPool?.G ?? 0).toBe(0);
  });
});

describe('auto-pay switch', () => {
  it('is off in every scenario', () => {
    for (const id of ['priority', 'hand9', 'duel', 'payment']) expect(scenarioById(id).build().autoPay ?? false).toBe(false);
  });

  it('when on, casting pays at once and the log names the lands tapped', () => {
    let g = applyIntent(table(), { type: 'setAutoPay', on: true });
    const hi = inHand(g, 'Heroic Intervention');
    g = applyIntent(g, { type: 'play', cardId: hi });
    expect(g.decision.kind).toBe('priority');
    expect(g.stack.at(-1)?.sourceCardId).toBe(hi);
    expect(g.log.at(-1)?.text).toMatch(/Tapped: Forest, [A-Z][\w ]+\.$/);
  });
});

describe('activating a permanent', () => {
  it('Equip asks for a target, then for payment, then goes on the stack', () => {
    let g = table();
    const boots = byName(g, 'Swiftfoot Boots')[0]!.id;
    g = applyIntent(g, { type: 'activate', cardId: boots });
    expect(g.decision.kind).toBe('chooseTargets');
    const target = g.decision.kind === 'chooseTargets' ? g.decision.legal[0]! : undefined;
    g = run(g, { type: 'toggleTarget', target: target! }, { type: 'primary' });
    expect(paying(g.decision)).toMatchObject({ sourceCardId: boots, ability: 'Equip {1}', cost: '{1}' });
    g = applyIntent(g, { type: 'tapForMana', cardId: untapped(g, 'Forest').id });
    expect(g.stack.at(-1)).toMatchObject({ sourceCardId: boots, kind: 'ability' });
    g = applyIntent(g, { type: 'primary' }); // resolve
    const host = target?.kind === 'card' ? target.id : '';
    expect(g.cards[boots]!.attachedTo).toBe(host);
  });

  it('a permanent with no ability does nothing', () => {
    const g = table();
    const eidolon: CardId = byName(g, 'Eidolon of Blossoms')[0]!.id;
    expect(applyIntent(g, { type: 'activate', cardId: eidolon })).toBe(g);
  });
});
