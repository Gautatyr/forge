import { describe, expect, it } from 'vitest';
import { applyIntent, type MockGame } from '../../mock/engine';
import { scenarioById } from '../../mock/scenarios';
import type { ChoicePrompt, DistributePrompt, InputPrompt } from '../../model/types';
import { DEFAULT_STOPS } from '../../state/prefs';
import { primaryAction } from '../../state/primaryAction';
import { INITIAL_UI } from '../../state/ui';
import { stepAmount } from './numberLogic';
import { initialDraft, trayConfirm } from './trayLogic';

const promptOf = (g: MockGame): ChoicePrompt => {
  if (g.decision.kind !== 'choice') throw new Error(`no prompt: ${g.decision.kind}`);
  return g.decision.prompt;
};
const answer = (g: MockGame, a: Extract<Parameters<typeof applyIntent>[1], { type: 'answer' }>['answer']) =>
  applyIntent(g, { type: 'answer', promptId: promptOf(g).id, answer: a });

describe('X costs ask the number prompt before payment', () => {
  it("opens on the engine's default and Space pays with that X", () => {
    const g = scenarioById('x-cost').build();
    const p = promptOf(g) as InputPrompt;
    expect(p).toMatchObject({ shape: 'input', kind: 'number', min: 0 });
    expect(p.defaultValue).toBe(String(p.max));
    const main = primaryAction(g, INITIAL_UI, DEFAULT_STOPS);
    expect(main).toMatchObject({ label: 'Continue to payment', enabled: true });
    const paying = applyIntent(g, main.intent!);
    expect(paying.decision).toMatchObject({ kind: 'payMana', x: p.max });
  });

  it('a typed X goes into the cost; out of range keeps the prompt open', () => {
    const g = scenarioById('x-cost').build();
    const p = promptOf(g) as InputPrompt;
    const draft = { ...initialDraft(p), selected: ['2'] };
    const after = answer(g, trayConfirm(p, draft).answer!);
    expect(after.decision).toMatchObject({ kind: 'payMana', cost: '{2}{G}', x: 2 });
    expect(trayConfirm(p, { ...draft, selected: [String(p.max! + 1)] }).enabled).toBe(false);
    expect(answer(g, { shape: 'input', value: String(p.max! + 1) }).decision).toEqual(g.decision);
  });

  it('casting again opens a fresh prompt, so a stale draft is not reused', () => {
    const g = scenarioById('x-cost').build();
    const first = promptOf(g).id;
    const paying = answer(g, { shape: 'input', value: '1' });
    const again = applyIntent(applyIntent(paying, { type: 'cancel' }), { type: 'play', cardId: promptOf(g).sourceCardId! });
    expect(promptOf(again).id).not.toBe(first);
  });
});

describe('combat damage assignment', () => {
  it('trample: opens on lethal to each blocker and the rest to Ana; Space accepts it', () => {
    const g = scenarioById('combat-damage').build();
    const p = promptOf(g) as DistributePrompt;
    expect(p.title).toBe("Assign Knight of Autumn's 6 damage");
    expect(p.recipients.map((r) => [r.label, r.lethal])).toEqual([
      ['Vampire Nighthawk', 3],
      ['Sakura-Tribe Elder', 1],
      ['Ana', undefined],
    ]);
    const c = trayConfirm(p, initialDraft(p));
    expect(c.enabled).toBe(true);
    expect(c.answer).toEqual({ shape: 'distribute', amounts: { [p.recipients[0]!.id]: 3, [p.recipients[1]!.id]: 1, ana: 2 } });
    expect(primaryAction(g, INITIAL_UI, DEFAULT_STOPS).intent).toEqual({ type: 'answer', promptId: p.id, answer: c.answer });
    const after = answer(g, c.answer!);
    expect(after.log.at(-1)!.text).toMatch(/deals 3 damage to .*, 1 to .* and 2 to Ana\.$/);
    expect(after.decision.kind).not.toBe('choice');
  });

  it('deathtouch: every blocker is lethal at 1, no trample row', () => {
    const g = scenarioById('combat-deathtouch').build();
    const p = promptOf(g) as DistributePrompt;
    expect(p.combat).toMatchObject({ deathtouch: true, trampleId: undefined });
    expect(p.recipients.map((r) => r.lethal)).toEqual([1, 1]);
    expect(initialDraft(p).amounts).toEqual({ [p.recipients[0]!.id]: 1, [p.recipients[1]!.id]: 3 });
  });
});

describe('divide damage', () => {
  it('starts at 1 each with 2 left, then confirms at 0 left', () => {
    const g = scenarioById('divide').build();
    const p = promptOf(g) as DistributePrompt;
    const d = initialDraft(p);
    expect(trayConfirm(p, d)).toMatchObject({ enabled: false, label: 'Assign 2 more' });
    expect(primaryAction(g, INITIAL_UI, DEFAULT_STOPS)).toMatchObject({ label: 'Assign 2 more', enabled: false });
    const amounts = stepAmount(p, d.amounts!, 'mira', 2);
    const c = trayConfirm(p, { ...d, amounts });
    expect(c).toMatchObject({ enabled: true, label: 'Divide damage' });
    expect(answer(g, c.answer!).log.at(-1)!.text).toMatch(/deals 1 damage to .*, 1 to .* and 3 to Mira\.$/);
  });
});

describe('name a card', () => {
  it('offers nonland names only and logs the exact name', () => {
    const g = scenarioById('name-card').build();
    const p = promptOf(g) as InputPrompt;
    expect(p.cardNames!.some((n) => n.name === 'Lightning Bolt')).toBe(true);
    expect(p.cardNames!.some((n) => n.name === 'Forest')).toBe(false);
    const d = { ...initialDraft(p), selected: ['lightning bolt'] };
    const c = trayConfirm(p, d);
    expect(c.answer).toEqual({ shape: 'input', value: 'Lightning Bolt' });
    expect(answer(g, c.answer!).log.at(-1)!.text).toBe('You name Lightning Bolt.');
  });
});
