import { describe, expect, it } from 'vitest';
import { applyIntent, type MockGame } from '../../mock/engine';
import { SCENARIOS, scenarioById } from '../../mock/scenarios';
import { player } from '../../model/selectors';
import type { ChoicePrompt } from '../../model/types';
import { DEFAULT_STOPS } from '../../state/prefs';
import { primaryAction } from '../../state/primaryAction';
import { INITIAL_UI } from '../../state/ui';
import { cardStatusWithChoice, playerChoice } from './inPlace';
import { initialDraft, inPlaceOptions, inPlaceRefs, keyAction, toggleOption, trayConfirm } from './trayLogic';

const promptOf = (g: MockGame): ChoicePrompt => {
  if (g.decision.kind !== 'choice') throw new Error(`no prompt: ${g.decision.kind}`);
  return g.decision.prompt;
};
const answer = (g: MockGame, a: Extract<Parameters<typeof applyIntent>[1], { type: 'answer' }>['answer']) =>
  applyIntent(g, { type: 'answer', promptId: promptOf(g).id, answer: a });

describe('the main button mirrors the tray confirm (§2.2)', () => {
  it('has the same answer and enablement in every choice scenario, before and after a pick', () => {
    for (const s of SCENARIOS) {
      const g = s.build();
      if (g.decision.kind !== 'choice') continue;
      const p = g.decision.prompt;
      let draft = initialDraft(p);
      const check = () => {
        const main = primaryAction(g, { ...INITIAL_UI, choiceDraft: draft }, DEFAULT_STOPS);
        const tray = trayConfirm(p, draft);
        expect(main.label, s.id).toBe(tray.label);
        expect(main.enabled, s.id).toBe(tray.enabled);
        expect(main.intent, s.id).toEqual(tray.answer ? { type: 'answer', promptId: p.id, answer: tray.answer } : undefined);
      };
      check();
      // No stored draft yet (first render): the main button already answers the engine's default.
      const fresh = primaryAction(g, INITIAL_UI, DEFAULT_STOPS);
      expect([fresh.label, fresh.enabled], s.id).toEqual([trayConfirm(p, draft).label, trayConfirm(p, draft).enabled]);
      if (p.shape === 'chooseN' && p.options[0] && p.max > 0) {
        draft = toggleOption(p, draft, p.options[0].id);
        check();
      }
    }
  });

  it('says why it is disabled, then counts the pick: "Choose 1 more", "Sacrifice (1)"', () => {
    const g = scenarioById('sacrifice').build();
    const p = promptOf(g) as Extract<ChoicePrompt, { shape: 'chooseN' }>;
    expect(primaryAction(g, INITIAL_UI, DEFAULT_STOPS)).toMatchObject({ label: 'Choose 1 more', enabled: false });
    const ui = { ...INITIAL_UI, choiceDraft: toggleOption(p, initialDraft(p), p.options[0]!.id) };
    expect(primaryAction(g, ui, DEFAULT_STOPS)).toMatchObject({ label: 'Sacrifice (1)', enabled: true });
  });
});

describe('choosing in place', () => {
  it('sacrifice: your creatures are lit, a pick takes the selected state, other permanents dim', () => {
    const g = scenarioById('sacrifice').build();
    const p = promptOf(g);
    expect(inPlaceRefs(g, p)).toBeDefined();
    const elf = player(g, 'you').battlefield.find((id) => g.cards[id]!.name === 'Elvish Mystic')!;
    const forest = player(g, 'you').battlefield.find((id) => g.cards[id]!.name === 'Forest')!;
    expect(cardStatusWithChoice(g, INITIAL_UI, elf)).toMatchObject({ actionable: true, selected: false, dimmed: false });
    expect(cardStatusWithChoice(g, INITIAL_UI, forest).dimmed).toBe(true);
    const ui = { ...INITIAL_UI, choiceDraft: toggleOption(p as Extract<ChoicePrompt, { shape: 'chooseN' }>, initialDraft(p), elf) };
    expect(cardStatusWithChoice(g, ui, elf).selected).toBe(true);

    const after = answer(g, { shape: 'chooseN', optionIds: [elf] });
    expect(after.cards[elf]!.zone).toBe('graveyard');
    expect(after.decision.kind).toBe('priority');
  });

  it('keys 1–9 act only where the order is on screen: the tray rows, and your hand in hand order (#112)', () => {
    const key = (k: string) => ({ key: k, alt: false, inInput: false });
    // On the board nothing shows the prompt's order to count from: the digits name nothing.
    const g = scenarioById('sacrifice').build();
    const p = promptOf(g) as Extract<ChoicePrompt, { shape: 'chooseN' }>;
    expect(inPlaceRefs(g, p)).toBeDefined();
    const board = inPlaceOptions(g, p);
    expect(board).toEqual([]);
    expect(keyAction(p, initialDraft(p), board, key('1'))).toBeUndefined();
    // In your hand: the Nth card of the hand, whatever the prompt's option order; a card that is no option is a hole.
    const withHand = SCENARIOS.map((s) => s.build()).find((x) => player(x, 'you').hand.length >= 4)!;
    const hand = player(withHand, 'you').hand;
    const options = [hand[2]!, hand[0]!].map((id) => ({ id: `o${id}`, label: withHand.cards[id]!.name, cardId: id }));
    const hp: Extract<ChoicePrompt, { shape: 'chooseN' }> = { ...p, id: 'discard', options, min: 1, max: 1 };
    const visible = inPlaceOptions(withHand, hp);
    expect(visible.map((o) => o?.cardId)).toEqual(hand.slice(0, 9).map((id, i) => (i === 0 || i === 2 ? id : undefined)));
    const d = initialDraft(hp);
    expect(keyAction(hp, d, visible, key('1'))).toEqual({ kind: 'draft', draft: toggleOption(hp, d, `o${hand[0]}`) });
    expect(keyAction(hp, d, visible, key('2'))).toBeUndefined();
    expect(keyAction(hp, d, visible, key('3'))).toEqual({ kind: 'draft', draft: toggleOption(hp, d, `o${hand[2]}`) });
    // the tray (search) is not in place: the tray's own tiles are what the digits name (trayGroups.test.ts)
    const search = scenarioById('search').build();
    expect(inPlaceOptions(search, promptOf(search))).toEqual([]);
  });

  it('choose a player: plates are options', () => {
    const g = scenarioById('choose-player').build();
    expect(playerChoice(g, INITIAL_UI, 'theo')).toEqual({ chosen: false });
    expect(playerChoice(g, INITIAL_UI, 'you')).toBeUndefined();
  });
});

describe('mock answers', () => {
  it('commander moving zones: the default moves it to the command zone', () => {
    const g = scenarioById('commander-zone').build();
    const p = promptOf(g);
    const a = trayConfirm(p, initialDraft(p)).answer!;
    expect(a).toEqual({ shape: 'yesNo', yes: true });
    const after = answer(g, a);
    const sythis = after.players[0]!.commanders[0]!;
    expect(after.cards[sythis]!.zone).toBe('command');
    expect(player(after, 'you').command).toContain(sythis);
  });

  it('optional trigger: "No" logs the engine label', () => {
    const g = scenarioById('optional').build();
    expect(answer(g, { shape: 'yesNo', yes: false }).log.at(-1)!.text).toBe('You choose: No.');
  });

  it('trigger order: the log line has no doubled full stops', () => {
    const g = scenarioById('triggers').build();
    const p = promptOf(g);
    const text = answer(g, trayConfirm(p, initialDraft(p)).answer!).log.at(-1)!.text;
    expect(text).toMatch(/^Your triggers resolve in this order: .*flying\.$/);
    expect(text).not.toContain('..');
  });

  it('ability menu: a row activates, an empty answer cancels', () => {
    const g = scenarioById('ability-menu').build();
    const verge = promptOf(g).sourceCardId!;
    expect(answer(g, { shape: 'chooseN', optionIds: ['mana'] }).cards[verge]!.tapped).toBe(true);
    const cancelled = answer(g, { shape: 'chooseN', optionIds: [] });
    expect(cancelled.cards[verge]!.tapped).toBe(false);
    expect(cancelled.decision.kind).toBe('priority');
  });

  it("a modal double-faced card asks for its face with the ability menu, and Esc keeps it in hand", () => {
    const g = scenarioById('hand9').build();
    const emeria = player(g, 'you').hand.find((id) => g.cards[id]!.name.startsWith("Emeria's Call"))!;
    const asked = applyIntent(g, { type: 'play', cardId: emeria });
    const p = promptOf(asked);
    expect(p.shape === 'chooseN' && p.abilityMenu).toBe(true);
    const cancelled = answer(asked, { shape: 'chooseN', optionIds: [] });
    expect(cancelled.cards[emeria]!.zone).toBe('hand');
    expect(cancelled.decision.kind).toBe('priority');
  });
});
