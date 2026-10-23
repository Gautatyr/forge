/**
 * UI intents → client frames: replies to prompts and `{"t":"action","method",…}` player actions
 * (docs/fork/architecture/web-ui.md, "Bridge: human seat"). Board interaction follows Forge's
 * inputs: a card click is selectCard, a player click selectPlayer, a stack item selectStackItem, the
 * main button selectButtonOk, cancel selectButtonCancel (InputAttack: selectPlayer picks the defender, selectCard a planeswalker or battle defender,
 * a creature click toggles it; InputBlock: click the attacker, then the blocker (again: removes the block);
 * InputPayMana: a source click taps it, useMana spends floating mana, OK is "Auto").
 */
import type { Intent } from '../model/intents';
import type { GameView, StepId, TargetRef } from '../model/types';
import type { PhaseType } from '../wire/generated/wire';
import { COLOUR_MASK, type ActionMessage, type ClientFrame, type PromptMessage } from './protocol';
import { cancelValue, freeMulliganKeep, inputPromptKind, promptViewId, replyValue, targetKey, targetOfKey } from './prompts';
import type { LiveSession } from './session';
import { numberList, pickedNumber, rangeOfNumberPrompt } from './trayWords';

const num = (id: string) => Number(id);
type Method = ActionMessage['method'];
export const action = (method: Method, fields: Omit<ActionMessage, 't' | 'method'> = {}): ActionMessage => ({
  t: 'action',
  method,
  ...fields,
});
const selectCard = (id: string) => action('selectCard', { card: num(id) });
const selectPlayer = (id: string) => action('selectPlayer', { player: num(id) });
/** A target click as the input takes it: a stack item is picked with selectStackItem (InputSelectStackItems). */
const selectTarget = (t: TargetRef) =>
  t.kind === 'card' ? selectCard(t.id) : t.kind === 'player' ? selectPlayer(t.id) : action('selectStackItem', { stackItem: num(t.id) });

/** InputAttack's defender: a player by selectPlayer, a planeswalker or battle by selectCard (issue #65). */
const selectDefender = (d: { defenderId: string; defenderCardId?: string }) =>
  d.defenderCardId !== undefined ? selectCard(d.defenderCardId) : selectPlayer(d.defenderId);

/** Phases of a view-model step (combat damage covers first strike too). */
export const PHASES_OF: Record<StepId, PhaseType[]> = {
  untap: ['UNTAP'],
  upkeep: ['UPKEEP'],
  draw: ['DRAW'],
  main1: ['MAIN1'],
  beginCombat: ['COMBAT_BEGIN'],
  declareAttackers: ['COMBAT_DECLARE_ATTACKERS'],
  declareBlockers: ['COMBAT_DECLARE_BLOCKERS'],
  combatDamage: ['COMBAT_FIRST_STRIKE_DAMAGE', 'COMBAT_DAMAGE'],
  endCombat: ['COMBAT_END'],
  main2: ['MAIN2'],
  end: ['END_OF_TURN'],
  cleanup: ['CLEANUP'],
};

/** Frames for one intent; [] = nothing to send (client-side settings, or nothing to answer). */
export function intentToFrames(intent: Intent, s: LiveSession, view: GameView): ClientFrame[] {
  const d = view.decision;
  switch (intent.type) {
    case 'play':
    case 'activate':
      // hold: keep the priority the cast gets back, whatever "Pass priority after casting" says (Shift + click).
      return [intent.hold ? action('selectCard', { card: num(intent.cardId), hold: true }) : selectCard(intent.cardId)];
    case 'tapForMana':
      return [selectCard(intent.cardId)];
    case 'spendPool':
      return [action('useMana', { color: COLOUR_MASK[intent.colour] })];
    case 'payAuto':
      return [action('selectButtonOk')];
    case 'payLife':
      // InputPayManaOfCostPayment: a click on your own player pays 2 life for one Phyrexian symbol.
      return [selectPlayer(view.youId)];
    case 'undoTap':
      return [];
    case 'toggleTarget':
      return [selectTarget(intent.target)];
    case 'primary':
      return [action('selectButtonOk')];
    case 'cancel':
      if (d.kind === 'declareBlockers') {
        // InputBlock has no cancel: clicking attacker then blocker removes each block.
        return d.draft.flatMap((b) => [selectCard(b.attackerId), selectCard(b.blockerId)]);
      }
      // A prompt the engine lets you back out of (a number asked with "none" allowed): its empty answer.
      if (d.kind === 'choice' && s.prompt && promptViewId(s.prompt.id) === d.prompt.id) {
        const none = cancelValue(s.prompt);
        return none === undefined ? [] : [{ t: 'reply', id: s.prompt.id, value: none }];
      }
      // Paying, targeting: Cancel. Attacking: the cancel button is "Call Back" once attackers are declared.
      return [action('selectButtonCancel')];
    case 'toggleAttacker':
    case 'setAttackDefender':
      return [selectDefender(intent), selectCard(intent.cardId)];
    case 'attackWithAll':
      return [selectDefender(intent), action('alphaStrike')];
    case 'assignBlock':
      return [selectCard(intent.attackerId), selectCard(intent.blockerId)];
    case 'removeBlock': {
      // InputBlock: clicking an attacker, then a creature already blocking it, removes that block.
      const blocks = d.kind === 'declareBlockers' ? d.draft : [];
      return blocks
        .filter((b) => b.blockerId === intent.blockerId && (intent.attackerId === undefined || b.attackerId === intent.attackerId))
        .flatMap((b) => [selectCard(b.attackerId), selectCard(b.blockerId)]);
    }
    case 'answer':
      return answerFrames(intent.promptId, intent.answer, s);
    case 'passUntilYourTurn': {
      // A yield marker at your upkeep: the engine passes for you until then (stops and the stack still interrupt).
      // Pressed on your own turn at or past your upkeep, the marker is for your next turn (YieldController.setMarker).
      const atOrPast = view.turn.activePlayerId === view.youId && view.turn.step !== 'untap' && !view.starting;
      const marker = action('sendYieldUpdate', {
        update: { kind: 'SetMarker', phaseOwner: num(view.youId), phase: 'UPKEEP', atOrPastAtClick: atOrPast },
      });
      return d.kind === 'priority' ? [marker, action('selectButtonOk')] : [marker];
    }
    case 'cancelPassUntilYourTurn':
      return [action('sendYieldUpdate', { update: { kind: 'ClearMarker' } })];
    case 'undo':
      return [action('undoLastAction')];
    case 'concede':
      // The engine marks the loss; it is applied once the game moves on, so give up priority too.
      return d.kind === 'priority' ? [action('concede'), action('selectButtonOk')] : [action('concede')];
    case 'toggleAutoYieldTo': {
      // "Always yield to this": the engine yields to abilities by their text; the bridge reads it off the stack item.
      const item = view.stack.find((it) => it.yieldKey === intent.key);
      return item ? [action('sendYieldUpdate', { update: { kind: 'AutoYieldTo', stackItem: num(item.id), active: !view.autoYieldTo.includes(intent.key) } })] : [];
    }
    case 'setAutoPass':
    case 'setAutoYield':
    case 'setAutoPay':
    case 'leaveMatch':
    case 'nextGame':
      // Settings kept by the client: autoPay stays here; auto-pass and auto-yield go to the bridge from useLive (autoPassFrame).
      return [];
  }
}

function answerFrames(promptId: string, answer: Extract<Intent, { type: 'answer' }>['answer'], s: LiveSession): ClientFrame[] {
  switch (inputPromptKind(promptId)) {
    case 'mulligan':
    case 'buttons':
      return answer.shape === 'yesNo' ? [action(answer.yes ? 'selectButtonOk' : 'selectButtonCancel')] : [];
    case 'ok':
      return [action('selectButtonOk')];
    case 'cancel':
      return [action('selectButtonCancel')];
    case 'bottom': {
      // InputLondonMulligan: toggle the cards that differ from the server's selection, then OK.
      if (answer.shape !== 'chooseN') return [];
      const on = new Set(s.input.highlighted.filter((h) => h.type === 'card').map((h) => String(h.id)));
      const want = new Set(answer.optionIds);
      const toggle = [...[...want].filter((id) => !on.has(id)), ...[...on].filter((id) => !want.has(id))];
      return [...toggle.map(selectCard), action('selectButtonOk')];
    }
    case 'select': {
      // A card / player list (InputSelectEntitiesFromList, InputSelectTargets): unpick what the answer drops,
      // pick what is new, then OK. The engine ends the input itself on the pick that reaches its maximum:
      // an OK after that would answer the next input.
      if (answer.shape !== 'chooseN') return [];
      const on = s.input.highlighted.map((h) => targetKey({ kind: h.type, id: String(h.id) }));
      const want = answer.optionIds.filter((id) => targetOfKey(id));
      const toggle = [...on.filter((id) => !want.includes(id)), ...want.filter((id) => !on.includes(id))];
      const frames = toggle.map((id) => selectTarget(targetOfKey(id)!));
      const max = s.input.selectable?.max ?? 1;
      return toggle.length === 0 || want.length < max ? [...frames, action('selectButtonOk')] : frames;
    }
    default: {
      const p = s.prompt;
      if (!p || promptViewId(p.id) !== promptId) return [];
      const value = replyValue(p, answer);
      if (value === undefined) return [];
      rememberNumber(s, p, answer);
      return [{ t: 'reply', id: p.id, value }];
    }
  }
}

/**
 * What a number answer needs later: the X announced for a card (the payment shows it), and a number past a list's
 * "Other…" entry (the engine then asks for it in a second prompt: autoAnswer types it).
 */
function rememberNumber(s: LiveSession, p: PromptMessage, answer: Extract<Intent, { type: 'answer' }>['answer']) {
  if (p.shape !== 'choose' || p.method !== 'getChoices' || answer.shape !== 'input') return;
  const n = Number(answer.value);
  if (!Number.isInteger(n)) return;
  const x = /^Choose X for (.+)$/.exec((p.message ?? '').trim());
  if (x) s.announcedX = { card: x[1]!, value: n };
  const nums = numberList(p.choices, p.min, p.max);
  s.pendingNumber = nums && nums.other !== undefined && pickedNumber(nums, n) === nums.other ? { value: n, after: p.id } : undefined;
}

/**
 * Your input when it has nothing to decide (playtest 1: no prompt then), with the frames that answer
 * it: the London mulligan's "return 0 cards" after a free mulligan. The key stays the same while the
 * input is shown, so the caller answers it once.
 */
export function autoAnswer(s: LiveSession): { key: string; frames: ClientFrame[] } | undefined {
  const typed = s.pendingNumber;
  const open = s.prompt;
  if (typed && open && open.shape === 'text' && open.numeric && open.id > typed.after) {
    // The "Other…" follow-up ("Enter a number between 0 and 14:"): the number you typed, once, when it is in range.
    const r = rangeOfNumberPrompt(open.message);
    if (r && typed.value >= (r.min ?? -Infinity) && typed.value <= (r.max ?? Infinity)) {
      return { key: `number|${open.id}`, frames: [{ t: 'reply', id: open.id, value: String(typed.value) }] };
    }
  }
  const input = s.input;
  const you = s.viewer && 'player' in s.viewer ? s.viewer.player : undefined;
  if (you === undefined || input.ownerId !== you || !input.ok.enabled) return undefined;
  if (freeMulliganKeep(input)) return { key: `free-keep|${s.game}`, frames: [action('selectButtonOk')] };
  return undefined;
}

/** "Auto-pass when I can't act" and "Auto-yield" for this seat; the bridge keeps them for the seat's later games. */
export const autoPassFrame = (on: boolean): ClientFrame => ({ t: 'setAutoPass', on });
export const autoYieldFrame = (on: boolean): ClientFrame => ({ t: 'setAutoYield', on });

/** "Pass priority after casting" for this seat; the bridge keeps it for the seat's later games. */
export const passAfterCastFrame = (on: boolean): ClientFrame => ({ t: 'setPassAfterCast', on });

/**
 * Phase stops as SkipPhase yield updates: for every player and step, skip unless the step is a
 * stop (the bridge skips none until told). First, the fork's InvolvedStops update: whether those stops on opponents'
 * turns hold only when you are involved (the bridge decides that on the live combat).
 */
export function stopFrames(view: GameView, isStop: (turnPlayerId: string, step: StepId) => boolean, involvedOnly = false): ClientFrame[] {
  const out: ClientFrame[] = [action('sendYieldUpdate', { update: { kind: 'InvolvedStops', active: involvedOnly } })];
  for (const p of view.players) {
    for (const step of Object.keys(PHASES_OF) as StepId[]) {
      if (step === 'untap' || step === 'cleanup') continue;
      const skip = !isStop(p.id, step);
      for (const phase of PHASES_OF[step]) {
        out.push(action('sendYieldUpdate', { update: { kind: 'SkipPhase', turnPlayer: num(p.id), phase, skip } }));
      }
    }
  }
  return out;
}
