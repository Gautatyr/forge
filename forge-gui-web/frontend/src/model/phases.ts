import type { StepId } from './types';

export interface StepInfo {
  id: StepId;
  /** Word shown on the phase track. */
  label: string;
  /** Full name for tooltips and screen readers. */
  longLabel: string;
  /** Steps of the combat phase are grouped under one heading. */
  combat: boolean;
  /** No player gets priority here, so a stop is meaningless. */
  noPriority?: boolean;
}

export const STEPS: StepInfo[] = [
  { id: 'untap', label: 'Untap', longLabel: 'Untap step', combat: false, noPriority: true },
  { id: 'upkeep', label: 'Upkeep', longLabel: 'Upkeep step', combat: false },
  { id: 'draw', label: 'Draw', longLabel: 'Draw step', combat: false },
  { id: 'main1', label: 'Main 1', longLabel: 'First main phase', combat: false },
  { id: 'beginCombat', label: 'Begin', longLabel: 'Beginning of combat', combat: true },
  { id: 'declareAttackers', label: 'Attack', longLabel: 'Declare attackers', combat: true },
  { id: 'declareBlockers', label: 'Block', longLabel: 'Declare blockers', combat: true },
  { id: 'combatDamage', label: 'Damage', longLabel: 'Combat damage', combat: true },
  { id: 'endCombat', label: 'End', longLabel: 'End of combat', combat: true },
  { id: 'main2', label: 'Main 2', longLabel: 'Second main phase', combat: false },
  { id: 'end', label: 'End step', longLabel: 'End step', combat: false },
  { id: 'cleanup', label: 'Cleanup', longLabel: 'Cleanup step', combat: false, noPriority: true },
];

export function stepInfo(id: StepId): StepInfo {
  const s = STEPS.find((x) => x.id === id);
  if (!s) throw new Error(`unknown step ${id}`);
  return s;
}

export function nextStep(id: StepId): StepId {
  const i = STEPS.findIndex((x) => x.id === id);
  return STEPS[(i + 1) % STEPS.length]!.id;
}
