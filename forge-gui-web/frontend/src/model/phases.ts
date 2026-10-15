import type { StepId } from './types';

export interface StepInfo {
  id: StepId;
  /** Word shown on the turn strip and in the Stops editor. */
  label: string;
  /** Full name for tooltips and screen readers. */
  longLabel: string;
  /** Name after "Next stop:" and in hover text, e.g. "Attack step". */
  stopName: string;
  /** Strip caption of the step's group; steps without one stand alone. */
  group?: StepGroup;
  /** Steps of the combat phase are grouped under one heading. */
  combat: boolean;
  /** No player gets priority here: not on the strip, no stop. */
  noPriority?: boolean;
}

export type StepGroup = 'beginning' | 'combat';

export const STEPS: StepInfo[] = [
  { id: 'untap', label: 'Untap', longLabel: 'Untap step', stopName: 'Untap step', group: 'beginning', combat: false, noPriority: true },
  { id: 'upkeep', label: 'Upkeep', longLabel: 'Upkeep step', stopName: 'Upkeep', group: 'beginning', combat: false },
  { id: 'draw', label: 'Draw', longLabel: 'Draw step', stopName: 'Draw step', group: 'beginning', combat: false },
  { id: 'main1', label: 'Main 1', longLabel: 'First main phase', stopName: 'Main 1', combat: false },
  { id: 'beginCombat', label: 'Start', longLabel: 'Beginning of combat', stopName: 'Start of combat', group: 'combat', combat: true },
  { id: 'declareAttackers', label: 'Attack', longLabel: 'Declare attackers', stopName: 'Attack step', group: 'combat', combat: true },
  { id: 'declareBlockers', label: 'Block', longLabel: 'Declare blockers', stopName: 'Block step', group: 'combat', combat: true },
  { id: 'combatDamage', label: 'Damage', longLabel: 'Combat damage', stopName: 'Damage step', group: 'combat', combat: true },
  { id: 'endCombat', label: 'End', longLabel: 'End of combat', stopName: 'End of combat', group: 'combat', combat: true },
  { id: 'main2', label: 'Main 2', longLabel: 'Second main phase', stopName: 'Main 2', combat: false },
  { id: 'end', label: 'End step', longLabel: 'End step', stopName: 'End step', combat: false },
  { id: 'cleanup', label: 'Cleanup', longLabel: 'Cleanup step', stopName: 'Cleanup step', combat: false, noPriority: true },
];

/** Steps where someone gets priority: the turn strip and the Stops editor show only these. */
export const PRIORITY_STEPS: StepInfo[] = STEPS.filter((s) => !s.noPriority);

export const GROUP_CAPTIONS: Record<StepGroup, string> = {
  beginning: 'Beginning',
  combat: 'Combat',
};

/** Runs of consecutive priority steps sharing a group (or standing alone), in turn order. */
export interface StepRun {
  group?: StepGroup;
  steps: StepInfo[];
}

export const STEP_RUNS: StepRun[] = PRIORITY_STEPS.reduce<StepRun[]>((runs, s) => {
  const last = runs.at(-1);
  if (last && s.group && last.group === s.group) last.steps.push(s);
  else runs.push({ group: s.group, steps: [s] });
  return runs;
}, []);

export function stepInfo(id: StepId): StepInfo {
  const s = STEPS.find((x) => x.id === id);
  if (!s) throw new Error(`unknown step ${id}`);
  return s;
}

export function nextStep(id: StepId): StepId {
  const i = STEPS.findIndex((x) => x.id === id);
  return STEPS[(i + 1) % STEPS.length]!.id;
}
