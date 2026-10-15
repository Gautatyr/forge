/**
 * UI intents → client frames (replies and the 16 IGameController commands). Board interaction
 * follows Forge's inputs: a card click is selectCard, a player click selectPlayer, the main button
 * selectButtonOk, cancel selectButtonCancel (InputAttack: selectPlayer picks the defender, a
 * creature click toggles it; InputBlock: click the attacker, then the blocker).
 */
import type { Intent } from '../model/intents';
import type { GameView } from '../model/types';
import type { ClientFrame, CommandMessage } from './protocol';
import { INPUT_PROMPT_PREFIX, promptViewId, replyValue } from './prompts';
import type { LiveSession } from './session';

const num = (id: string) => Number(id);
const cmd = (t: CommandMessage['t'], ...args: (number | string)[]): CommandMessage => (args.length ? { t, args } : { t });

/** Frames for one intent; [] = nothing to send (settings the bridge has no wire form for yet). */
export function intentToFrames(intent: Intent, s: LiveSession, view: GameView): ClientFrame[] {
  switch (intent.type) {
    case 'play':
      return [cmd('selectCard', num(intent.cardId))];
    case 'toggleTarget':
      return [intent.target.kind === 'card' ? cmd('selectCard', num(intent.target.id)) : cmd('selectPlayer', num(intent.target.id))];
    case 'primary':
      return [cmd('selectButtonOk')];
    case 'cancel':
      return [cmd('selectButtonCancel')];
    case 'toggleAttacker':
    case 'setAttackDefender':
      return [cmd('selectPlayer', num(intent.defenderId)), cmd('selectCard', num(intent.cardId))];
    case 'attackWithAll':
      return [cmd('selectPlayer', num(intent.defenderId)), cmd('alphaStrike')];
    case 'assignBlock':
      return [cmd('selectCard', num(intent.attackerId)), cmd('selectCard', num(intent.blockerId))];
    case 'removeBlock': {
      const d = view.decision;
      const block = d.kind === 'declareBlockers' ? d.draft.find((b) => b.blockerId === intent.blockerId) : undefined;
      return block ? [cmd('selectCard', num(block.attackerId)), cmd('selectCard', num(intent.blockerId))] : [];
    }
    case 'answer': {
      if (intent.promptId.startsWith(INPUT_PROMPT_PREFIX)) {
        return intent.answer.shape === 'yesNo' ? [cmd(intent.answer.yes ? 'selectButtonOk' : 'selectButtonCancel')] : [];
      }
      const p = s.prompt;
      if (!p || promptViewId(p.id) !== intent.promptId) return [];
      const value = replyValue(p, intent.answer);
      return value === undefined ? [] : [{ t: 'reply', id: p.id, value }];
    }
    case 'passUntilYourTurn':
      // InputPassPriority's second button is "End Turn" unless an undo is possible.
      return s.input.cancel.enabled && s.input.cancel.label === 'End Turn' ? [cmd('selectButtonCancel')] : [];
    case 'undo':
      return [cmd('undoLastAction')];
    case 'cancelPassUntilYourTurn':
    case 'setAutoPass':
    case 'setAutoYield':
    case 'toggleAutoYieldTo':
      // Yield settings travel as YieldUpdate (sendYieldUpdate), which has no wire form yet.
      return [];
  }
}
