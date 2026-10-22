import type { Decision } from '../model/types';

type DeclareAttackers = Extract<Decision, { kind: 'declareAttackers' }>;

/** The engine's refusal of an attack declaration (PhaseHandler): it carries no reason of its own. */
export const ATTACK_INVALID = /^Attack declaration invalid/i;

/** `n` attackers (default: the draft) exceed what the engine lets attack together (Silent Arbiter). */
export const overAttackCap = (d: DeclareAttackers, n: number = d.draft.length) => d.max !== undefined && n > d.max;

/** "Attack all" would declare every candidate: not offered when the engine would refuse that many. */
export const canAttackAll = (d: DeclareAttackers) => !overAttackCap(d, d.candidates.length);

export const attackCapText = (max: number) => `At most ${max} creature${max === 1 ? '' : 's'} can attack together.`;

/** Why the engine refused the declaration, as far as the page can tell (the cap); else what such a refusal means. */
export function attackInvalidReason(d: Decision): string {
  if (d.kind === 'declareAttackers' && d.max !== undefined && overAttackCap(d)) return `Attack not allowed. ${attackCapText(d.max)}`;
  return 'Attack not allowed: a creature is required to attack, or an attack restriction is broken. Change the attackers.';
}
