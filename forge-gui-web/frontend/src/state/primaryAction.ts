import type { Intent, PromptAnswer } from '../model/intents';
import { stepInfo } from '../model/phases';
import { player } from '../model/selectors';
import type { ChoicePrompt, GameView, StepId } from '../model/types';
import { trayConfirm, trayDraft } from '../components/tray/trayLogic';
import type { StopPrefs } from './prefs';
import { nextStopLabel } from './stops';
import type { ChoiceDraft, UiState } from './ui';

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
      return { shape: 'distribute', amounts: {} };
    case 'input':
      return { shape: 'input', value: draft.selected[0] ?? '' };
  }
}

/** Detail line of a pass with an empty stack: where the game will next wait for you. */
function nextStopDetail(game: GameView, stops: StopPrefs): string {
  const at = nextStopLabel(game, stops);
  return at ? `Next stop: ${at}` : 'No stops set: you act again when something is on the stack';
}

export function primaryAction(game: GameView, ui: UiState, stops: StopPrefs): PrimaryAction {
  const d = game.decision;
  switch (d.kind) {
    case 'waiting': {
      const who = player(game, d.forPlayerId);
      return { label: `Waiting for ${who.name}`, detail: d.what, enabled: false, tone: 'neutral' };
    }
    case 'priority': {
      const top = game.stack.at(-1);
      if (top) {
        const name = game.cards[top.sourceCardId]?.name ?? 'the top item';
        return {
          label: 'Resolve',
          detail: `Pass priority: ${name} resolves if everyone passes`,
          enabled: true,
          tone: 'priority',
          intent: { type: 'primary' },
        };
      }
      const yours = game.turn.activePlayerId === game.youId;
      if (yours && game.turn.step === 'main1')
        return { label: 'Go to combat', detail: 'Pass priority with an empty stack', enabled: true, tone: 'priority', intent: { type: 'primary' } };
      if (yours && game.turn.step === 'main2')
        return { label: 'End turn', detail: nextStopDetail(game, stops), enabled: true, tone: 'priority', intent: { type: 'primary' } };
      return {
        label: 'Pass priority',
        detail: nextStopDetail(game, stops),
        enabled: true,
        tone: 'priority',
        intent: { type: 'primary' },
      };
    }
    case 'chooseTargets': {
      const name = game.cards[d.sourceCardId]?.name ?? 'spell';
      const ready = d.chosen.length >= d.min;
      return {
        label: ready ? `Cast ${name}` : 'Choose a target',
        detail: ready ? `Target: ${d.chosen.map((t) => (t.kind === 'card' ? game.cards[t.id]?.name : player(game, t.id).name)).join(', ')}` : d.instruction,
        enabled: ready,
        tone: 'priority',
        intent: { type: 'primary' },
      };
    }
    case 'declareAttackers': {
      const n = d.draft.length;
      const power = d.draft.reduce((s, a) => s + (game.cards[a.attackerId]?.power ?? 0), 0);
      return n === 0
        ? { label: 'Skip attack', detail: 'No creatures attack this turn', enabled: true, tone: 'neutral', intent: { type: 'primary' } }
        : { label: `Attack with ${n}`, detail: `${power} power in total`, enabled: true, tone: 'attack', intent: { type: 'primary' } };
    }
    case 'declareBlockers': {
      const n = d.draft.length;
      const unblocked = d.attackers.filter((a) => !d.draft.some((b) => b.attackerId === a));
      const dmg = unblocked.reduce((s, a) => s + (game.cards[a]?.power ?? 0), 0);
      return {
        label: n === 0 ? 'No blocks' : `Block with ${n}`,
        detail: `You take ${dmg} damage from unblocked attackers`,
        enabled: true,
        tone: n === 0 ? 'neutral' : 'block',
        intent: { type: 'primary' },
      };
    }
    case 'payMana': {
      const taps = d.autoTaps.map((id) => game.cards[id]?.name ?? '?').join(', ');
      return {
        label: 'Pay automatically',
        detail: !d.autoCanPay ? 'Not enough untapped mana' : taps ? `Taps: ${taps}` : 'Uses your floating mana',
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

/** "combat", "upkeep"…: the step as the prompt line names it. */
function stepPhrase(step: StepId): string {
  if (stepInfo(step).combat) return 'combat';
  switch (step) {
    case 'main1':
    case 'main2':
      return 'main phase';
    case 'draw':
      return 'draw step';
    case 'end':
      return 'end step';
    default:
      return stepInfo(step).label.toLowerCase();
  }
}

/** What the game is waiting for, in one sentence. */
export function promptText(game: GameView): string {
  const d = game.decision;
  switch (d.kind) {
    case 'waiting':
      return `${d.what}.`;
    case 'priority': {
      const top = game.stack.at(-1);
      if (top) {
        const who = top.controllerId === game.youId ? 'Your' : `${player(game, top.controllerId).name}'s`;
        return `${who} ${game.cards[top.sourceCardId]?.name ?? 'spell'} is on top of the stack. Respond, or let it resolve.`;
      }
      const yours = game.turn.activePlayerId === game.youId;
      if (yours && (game.turn.step === 'main1' || game.turn.step === 'main2')) return 'Your main phase.';
      const whose = yours ? 'Your' : `${player(game, game.turn.activePlayerId).name}'s`;
      return `${whose} turn · ${stepPhrase(game.turn.step)}.`;
    }
    case 'chooseTargets':
      return `${d.instruction} for ${game.cards[d.sourceCardId]?.name ?? 'this spell'}.`;
    case 'payMana':
      return 'Click your lands or creatures that add mana.';
    case 'declareAttackers':
      return 'Click creatures to attack with them. Click an opponent first to change who they attack.';
    case 'declareBlockers':
      return 'Click your creature, then the attacker it blocks — or the attacker first, then your creature.';
    case 'choice':
      return d.prompt.instruction;
  }
}
