/**
 * UI intents → client frames: replies to prompts and `{"t":"action","method",…}` player actions
 * (docs/fork/architecture/web-ui.md, "Bridge: human seat"). Board interaction follows Forge's
 * inputs: a card click is selectCard, a player click selectPlayer, the main button selectButtonOk,
 * cancel selectButtonCancel (InputAttack: selectPlayer picks the defender, a creature click toggles
 * it; InputBlock: click the attacker, then the blocker; InputPayMana: a source click taps it,
 * useMana spends floating mana, OK is "Auto").
 */
import type { Intent } from '../model/intents';
import type { GameView, StepId } from '../model/types';
import type { PhaseType } from '../wire/generated/wire';
import { COLOUR_MASK, type ActionMessage, type ClientFrame } from './protocol';
import { freeMulliganKeep, inputPromptKind, promptViewId, replyValue, targetOfKey } from './prompts';
import type { LiveSession } from './session';

const num = (id: string) => Number(id);
type Method = ActionMessage['method'];
export const action = (method: Method, fields: Omit<ActionMessage, 't' | 'method'> = {}): ActionMessage => ({
  t: 'action',
  method,
  ...fields,
});
const selectCard = (id: string) => action('selectCard', { card: num(id) });
const selectPlayer = (id: string) => action('selectPlayer', { player: num(id) });

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
    case 'tapForMana':
      return [selectCard(intent.cardId)];
    case 'spendPool':
      return [action('useMana', { color: COLOUR_MASK[intent.colour] })];
    case 'payAuto':
      return [action('selectButtonOk')];
    case 'undoTap':
      return [];
    case 'toggleTarget':
      return [intent.target.kind === 'card' ? selectCard(intent.target.id) : selectPlayer(intent.target.id)];
    case 'primary':
      return [action('selectButtonOk')];
    case 'cancel':
      if (d.kind === 'declareBlockers') {
        // InputBlock has no cancel: clicking attacker then blocker removes each block.
        return d.draft.flatMap((b) => [selectCard(b.attackerId), selectCard(b.blockerId)]);
      }
      // Paying, targeting: Cancel. Attacking: the cancel button is "Call Back" once attackers are declared.
      return [action('selectButtonCancel')];
    case 'toggleAttacker':
    case 'setAttackDefender':
      return [selectPlayer(intent.defenderId), selectCard(intent.cardId)];
    case 'attackWithAll':
      return [selectPlayer(intent.defenderId), action('alphaStrike')];
    case 'assignBlock':
      return [selectCard(intent.attackerId), selectCard(intent.blockerId)];
    case 'removeBlock': {
      const block = d.kind === 'declareBlockers' ? d.draft.find((b) => b.blockerId === intent.blockerId) : undefined;
      return block ? [selectCard(block.attackerId), selectCard(intent.blockerId)] : [];
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
    case 'setAutoPass':
    case 'setAutoYield':
    case 'setAutoPay':
    case 'toggleAutoYieldTo':
    case 'leaveMatch':
    case 'nextGame':
      // Client-side (autoPay) or no wire form yet.
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
      const key = (h: { type: string; id: number }) => (h.type === 'card' || h.type === 'player' ? `${h.type[0]}${h.id}` : '');
      const on = s.input.highlighted.map(key).filter(Boolean);
      const want = answer.optionIds.filter((id) => targetOfKey(id));
      const toggle = [...on.filter((id) => !want.includes(id)), ...want.filter((id) => !on.includes(id))];
      const frames = toggle.map((id) => {
        const t = targetOfKey(id)!;
        return t.kind === 'card' ? selectCard(t.id) : selectPlayer(t.id);
      });
      const max = s.input.selectable?.max ?? 1;
      return toggle.length === 0 || want.length < max ? [...frames, action('selectButtonOk')] : frames;
    }
    default: {
      const p = s.prompt;
      if (!p || promptViewId(p.id) !== promptId) return [];
      const value = replyValue(p, answer);
      return value === undefined ? [] : [{ t: 'reply', id: p.id, value }];
    }
  }
}

/**
 * Your input when it has nothing to decide (playtest 1: no prompt then), with the frames that answer
 * it: the London mulligan's "return 0 cards" after a free mulligan. The key stays the same while the
 * input is shown, so the caller answers it once.
 */
export function autoAnswer(s: LiveSession): { key: string; frames: ClientFrame[] } | undefined {
  const input = s.input;
  const you = s.viewer && 'player' in s.viewer ? s.viewer.player : undefined;
  if (you === undefined || input.ownerId !== you || !input.ok.enabled) return undefined;
  if (freeMulliganKeep(input)) return { key: `free-keep|${s.game}`, frames: [action('selectButtonOk')] };
  return undefined;
}

/**
 * Phase stops as SkipPhase yield updates: for every player and step, skip unless the step is a
 * stop (the bridge skips none until told).
 */
export function stopFrames(view: GameView, isStop: (turnPlayerId: string, step: StepId) => boolean): ClientFrame[] {
  const out: ClientFrame[] = [];
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
