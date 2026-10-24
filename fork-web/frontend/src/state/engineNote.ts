import type { Decision } from '../model/types';
import { ATTACK_INVALID, attackInvalidReason } from './attackLimit';
import type { UiState } from './ui';

type Note = NonNullable<UiState['promptNote']>;

/**
 * The prompt-line note for an engine message. A refused attack declaration says why and is sticky. A message that arrives
 * while a target pick is open is the pick's refusal ("The selected card is not a player."): it belongs to that pick (`pick`).
 */
export function engineNote(prev: UiState['promptNote'], text: string, decision: Decision): Note {
  const id = (prev?.id ?? 0) + 1;
  if (ATTACK_INVALID.test(text)) return { id, text: attackInvalidReason(decision), sticky: true };
  if (decision.kind === 'chooseTargets') return { id, text, pick: true };
  return { id, text };
}

/** The player acted: a sticky note and a pick's refusal have done their job (the next pick, valid or not, answers it). */
export function noteAfterAction(note: UiState['promptNote']): UiState['promptNote'] {
  return note?.sticky || note?.pick ? undefined : note;
}

/** A sticky attack note outlives only its declaration; a pick's refusal only its pick. */
export function noteOver(note: UiState['promptNote'], decision: Decision): boolean {
  if (note?.sticky) return decision.kind !== 'declareAttackers';
  if (note?.pick) return decision.kind !== 'chooseTargets';
  return false;
}
