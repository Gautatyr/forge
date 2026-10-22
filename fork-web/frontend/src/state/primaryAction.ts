import type { Intent, PromptAnswer } from '../model/intents';
import { stepInfo } from '../model/phases';
import { parseCost, poolTotal } from '../model/mana';
import { player, targetName, you } from '../model/selectors';
import type { ChoicePrompt, GameView, StepId } from '../model/types';
import { distributeConfirm, inputConfirm, inputStart, startAmounts } from '../components/tray/numberLogic';
import { trayConfirm, trayDraft } from '../components/tray/trayLogic';
import { attackCapText, overAttackCap } from './attackLimit';
import { incoming, incomingText, strikeDamage } from './combatForecast';
import { watching } from './gameEnd';
import type { StopPrefs } from './prefs';
import { nextStopLabel } from './stops';
import type { ChoiceDraft, UiState } from './ui';
import { t, tDynamic } from '../i18n';

export type Tone = 'priority' | 'attack' | 'block' | 'neutral';

export interface PrimaryAction {
  /** What the button will do, in words. */
  label: string;
  /** One line of consequence under the label. */
  detail?: string;
  enabled: boolean;
  tone: Tone;
  intent?: Intent;
}

/** The draft for a prompt, initialised from the prompt when missing or stale. */
export function draftFor(prompt: ChoicePrompt, draft: ChoiceDraft | undefined): ChoiceDraft {
  if (draft && draft.promptId === prompt.id) return draft;
  const lists: Record<string, string[]> = {};
  if (prompt.shape === 'order') for (const l of prompt.lists) lists[l.id] = l.items.map((i) => i.id);
  return { promptId: prompt.id, selected: [], lists };
}

export function answerFromDraft(prompt: ChoicePrompt, draft: ChoiceDraft): PromptAnswer | undefined {
  switch (prompt.shape) {
    case 'chooseN':
      if (draft.selected.length < prompt.min || draft.selected.length > prompt.max) return undefined;
      return { shape: 'chooseN', optionIds: draft.selected };
    case 'order':
      return { shape: 'order', lists: Object.entries(draft.lists).map(([id, itemIds]) => ({ id, itemIds })) };
    case 'yesNo':
      return { shape: 'yesNo', yes: draft.selected[0] !== 'no' };
    case 'distribute':
      return distributeConfirm(prompt, draft.amounts ?? startAmounts(prompt)).answer;
    case 'input':
      return inputConfirm(prompt, draft.selected[0] ?? inputStart(prompt)).answer;
  }
}

/** Detail line of a pass with an empty stack: where the game will next wait for you. */
function nextStopDetail(game: GameView, stops: StopPrefs): string {
  const at = nextStopLabel(game, stops);
  return at ? t('pa.nextStop', { at }) : t('pa.noStops');
}

export function primaryAction(game: GameView, ui: UiState, stops: StopPrefs): PrimaryAction {
  // Out of the game, or the game is over: nothing to answer (design pass 4 §2.6).
  if (game.result) return { label: t('pa.gameOver'), enabled: false, tone: 'neutral' };
  if (watching(game)) return { label: t('pa.watching'), enabled: false, tone: 'neutral' };
  const d = game.decision;
  switch (d.kind) {
    case 'waiting': {
      const who = player(game, d.forPlayerId);
      return { label: t('pa.waitingFor', { name: who.name }), detail: d.what, enabled: false, tone: 'neutral' };
    }
    case 'priority': {
      const top = game.stack.at(-1);
      if (top) {
        const name = game.cards[top.sourceCardId]?.name ?? t('pa.topItem');
        return {
          label: t('pa.resolve'),
          detail: t('pa.resolveDetail', { name }),
          enabled: true,
          tone: 'priority',
          intent: { type: 'primary' },
        };
      }
      const yours = game.turn.activePlayerId === game.youId;
      if (yours && game.turn.step === 'main1')
        return { label: t('pa.toCombat'), detail: t('pa.toCombatDetail'), enabled: true, tone: 'priority', intent: { type: 'primary' } };
      if (yours && game.turn.step === 'main2')
        return { label: t('pa.endTurn'), detail: nextStopDetail(game, stops), enabled: true, tone: 'priority', intent: { type: 'primary' } };
      return {
        label: t('pa.passPriority'),
        detail: nextStopDetail(game, stops),
        enabled: true,
        tone: 'priority',
        intent: { type: 'primary' },
      };
    }
    case 'chooseTargets': {
      const name = game.cards[d.sourceCardId]?.name ?? t('pa.spell');
      if (d.purpose === 'pick') return pickAction(game, d);
      const ready = d.chosen.length >= d.min;
      const label =
        d.ability === 'activated' ? t('pa.activate', { name }) : d.ability === 'triggered' ? t('pa.confirmTargets') : t('pa.cast', { name });
      const chosen = d.chosen.map((c) => targetName(game, c)).join(', ');
      // Convoke, improvise: what is chosen is tapped to pay, the rest is paid with mana next.
      const detail = d.tapToPay ? (chosen ? t('pa.taps', { names: chosen }) : t('pa.nothingTapped')) : ready ? t('pa.target', { names: chosen }) : d.instruction;
      return {
        label: ready ? label : t('pa.chooseTarget'),
        detail,
        enabled: ready,
        tone: 'priority',
        intent: { type: 'primary' },
      };
    }
    case 'declareAttackers': {
      const n = d.draft.length;
      const damage = d.draft.reduce((s, a) => s + strikeDamage(game.cards[a.attackerId]), 0);
      // The engine refuses more attackers than its cap (Silent Arbiter): say so instead of offering it.
      if (d.max !== undefined && overAttackCap(d)) {
        return { label: t('pa.attackWith', { count: n }), detail: attackCapText(d.max), enabled: false, tone: 'attack' };
      }
      return n === 0
        ? { label: t('pa.skipAttack'), detail: t('pa.noAttackers'), enabled: true, tone: 'neutral', intent: { type: 'primary' } }
        : { label: t('pa.attackWith', { count: n }), detail: t('pa.damageIfUnblocked', { count: damage }), enabled: true, tone: 'attack', intent: { type: 'primary' } };
    }
    case 'declareBlockers': {
      const n = d.draft.length;
      // Every attack on you, also the ones you have no blocker for (issue #79).
      const forecast = incoming(game, [...(game.combat?.blocks ?? []), ...d.draft]);
      return {
        label: n === 0 ? t('pa.noBlocks') : t('pa.blockWith', { count: n }),
        detail: incomingText(game, forecast),
        enabled: true,
        tone: n === 0 ? 'neutral' : 'block',
        intent: { type: 'primary' },
      };
    }
    case 'payMana': {
      const taps = d.autoTaps.map((id) => game.cards[id]?.name ?? '?').join(', ');
      // Auto-pay never sacrifices or pays life (issue #66). Without it, a source per symbol left (at least one mana
      // each) or life may still pay: the player pays by hand.
      const left = parseCost(d.remaining);
      const byHand = d.lifePays || d.sources.length + poolTotal(you(game).manaPool) >= left.generic + left.coloured.length;
      return {
        label: t('pa.payAuto'),
        detail: d.autoCanPay
          ? taps
            ? t('pa.taps', { names: taps })
            : t('pa.usesFloating')
          : byHand
            ? t('pa.payByHand')
            : t('pa.notEnough'),
        enabled: d.autoCanPay,
        tone: 'priority',
        intent: { type: 'payAuto' },
      };
    }
    case 'choice': {
      // Mirrors the tray's confirm: "Sacrifice (1)", "Choose 1 more".
      const c = trayConfirm(d.prompt, trayDraft(d.prompt, ui.choiceDraft));
      return {
        label: c.label,
        detail: d.prompt.title,
        enabled: c.enabled,
        tone: 'priority',
        intent: c.enabled && c.answer ? { type: 'answer', promptId: d.prompt.id, answer: c.answer } : undefined,
      };
    }
  }
}

/** Verbs of the engine's pick messages ("Select creature to sacrifice", "Discard 2 card(s)"), as the button says them. */
const PICK_VERBS = ['discard', 'sacrifice', 'exile', 'return', 'reveal', 'tap', 'untap', 'put'] as const;

/** The first verb of the engine's message the screen knows, else "Choose". */
export function pickVerb(instruction: string): string {
  let best: { at: number; verb: (typeof PICK_VERBS)[number] } | undefined;
  for (const verb of PICK_VERBS) {
    const at = instruction.search(new RegExp(`\\b${verb}\\b`, 'i'));
    if (at >= 0 && (!best || at < best.at)) best = { at, verb };
  }
  return best ? tDynamic(`verb.${best.verb}`) : t('verb.choose');
}

/**
 * Cards or players picked for a cost or an effect (issue #81): "Discard (1)", "Sacrifice 1 more", "Choose 1 more", in
 * the tray's confirm words, never "Cast"; an optional pick says how many it allows.
 */
function pickAction(game: GameView, d: Extract<GameView['decision'], { kind: 'chooseTargets' }>): PrimaryAction {
  const n = d.chosen.length;
  const range = d.min === d.max ? '' : d.min === 0 ? t('pa.upTo', { max: d.max }) : t('pa.range', { min: d.min, max: d.max });
  const withRange = (s: string) => [s, range].filter(Boolean).join(' · ');
  const verb = pickVerb(d.instruction);
  if (n < d.min) return { label: t('pa.pickMore', { verb, count: d.min - n }), detail: withRange(d.instruction), enabled: false, tone: 'priority' };
  return {
    label: n === 0 ? t('pa.pickNone', { verb }) : `${verb} (${n})`,
    detail: withRange(n === 0 ? d.instruction : d.chosen.map((c) => targetName(game, c)).join(', ')),
    enabled: true,
    tone: 'priority',
    intent: { type: 'primary' },
  };
}

/** The Cancel button's words: what declining does when it is a game choice (an "unless" cost, issue #81). */
export function cancelLabel(game: GameView): string {
  const d = game.decision;
  return d.kind === 'chooseTargets' && d.decline ? t('pa.decline', { what: d.decline.replace(/\.$/, '') }) : t('common.cancel');
}

/** Cancel (button and Esc): a half-cast spell or ability, a choice the engine lets you back out of, a combat draft. */
export function canCancel(game: GameView, ui: UiState): boolean {
  const d = game.decision;
  return (
    (d.kind === 'chooseTargets' && (d.purpose !== 'pick' || d.cancellable !== false)) ||
    d.kind === 'payMana' ||
    (d.kind === 'choice' && d.cancellable === true) ||
    ((d.kind === 'declareAttackers' || d.kind === 'declareBlockers') && d.draft.length > 0) ||
    ui.pendingBlocker !== undefined ||
    ui.pendingAttacker !== undefined
  );
}

/** "combat", "upkeep"…: the step as the prompt line names it. */
function stepPhrase(step: StepId): string {
  if (stepInfo(step).combat) return t('phrase.combat');
  switch (step) {
    case 'main1':
    case 'main2':
      return t('phrase.mainPhase');
    case 'draw':
      return t('phrase.drawStep');
    case 'end':
      return t('phrase.endStep');
    default:
      return stepInfo(step).label.toLowerCase();
  }
}

/** What the game is waiting for, in one sentence; empty when you are out or the game is over (no prompts). */
export function promptText(game: GameView): string {
  if (game.result || watching(game)) return '';
  const d = game.decision;
  switch (d.kind) {
    case 'waiting':
      return `${d.what}.`;
    case 'priority': {
      const top = game.stack.at(-1);
      if (top) {
        const card = game.cards[top.sourceCardId]?.name ?? t('pa.spell');
        return top.controllerId === game.youId
          ? t('prompt.topYours', { card })
          : t('prompt.topTheirs', { who: player(game, top.controllerId).name, card });
      }
      const yours = game.turn.activePlayerId === game.youId;
      if (yours && (game.turn.step === 'main1' || game.turn.step === 'main2')) return t('prompt.yourMain');
      const step = stepPhrase(game.turn.step);
      return yours ? t('prompt.yourTurn', { step }) : t('prompt.theirTurn', { name: player(game, game.turn.activePlayerId).name, step });
    }
    case 'chooseTargets': {
      if (d.tapToPay) return `${d.instruction}.`;
      const name = game.cards[d.sourceCardId]?.name;
      if (d.purpose === 'pick') return `${name ? `${name}: ` : ''}${d.instruction.replace(/\.$/, '')}.`;
      return t('prompt.forSpell', { instruction: d.instruction, name: name ?? t('prompt.thisSpell') });
    }
    case 'payMana':
      return t('prompt.pay');
    case 'declareAttackers':
      return t('prompt.attackers');
    case 'declareBlockers':
      return t('prompt.blockers');
    case 'choice':
      return d.prompt.instruction;
  }
}
