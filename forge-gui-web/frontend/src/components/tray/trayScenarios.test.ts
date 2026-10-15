import { describe, expect, it } from 'vitest';
import { applyIntent, type MockGame } from '../../mock/engine';
import { SCENARIOS, scenarioById } from '../../mock/scenarios';
import { player } from '../../model/selectors';
import type { ChoicePrompt } from '../../model/types';
import { DEFAULT_STOPS } from '../../state/prefs';
import { primaryAction } from '../../state/primaryAction';
import { INITIAL_UI } from '../../state/ui';
import { cardStatusWithChoice, playerChoice } from './inPlace';
import { initialDraft, inPlaceRefs, toggleOption, trayConfirm } from './trayLogic';

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
        expect(main.enabled, s.id).toBe(tray.enabled);
        expect(main.intent, s.id).toEqual(tray.answer ? { type: 'answer', promptId: p.id, answer: tray.answer } : undefined);
      };
      check();
      if (p.shape === 'chooseN' && p.options[0] && p.max > 0) {
        draft = toggleOption(p, draft, p.options[0].id);
        check();
      }
    }
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
