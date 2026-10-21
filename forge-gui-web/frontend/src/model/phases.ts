import type { StepId } from './types';

export interface StepInfo {
  id: StepId;
  /**
   * Short name: the official one without its last word ("Declare attackers"). The turn strip
   * shows it only when the full names do not fit (playtest 1 ruling), and the Stops editor.
   */
  label: string;
  /** Official Comprehensive Rules name ("Declare attackers step", "First main phase"): strip, hover text, screen readers. */
  longLabel: string;
  /** Name after "Next stop:" ("Theo's declare attackers step"). */
  stopName: string;
  /** Strip caption of the step's phase; the main phases stand alone. */
  group?: StepGroup;
  /** Steps of the combat phase are grouped under one heading. */
  combat: boolean;
  /** No player gets priority here: not on the strip, no stop. */
  noPriority?: boolean;
}

export type StepGroup = 'beginning' | 'combat' | 'ending';

/** One step: `name` is the CR name (CR 500.1; 505.1 calls the main phases first and second). */
function step(id: StepId, name: string, more: Omit<StepInfo, 'id' | 'label' | 'longLabel' | 'stopName'>): StepInfo {
  return { id, label: name.slice(0, name.lastIndexOf(' ')), longLabel: name, stopName: name.toLowerCase(), ...more };
}

export const STEPS: StepInfo[] = [
  step('untap', 'Untap step', { group: 'beginning', combat: false, noPriority: true }),
  step('upkeep', 'Upkeep step', { group: 'beginning', combat: false }),
  step('draw', 'Draw step', { group: 'beginning', combat: false }),
  step('main1', 'First main phase', { combat: false }),
  step('beginCombat', 'Beginning of combat step', { group: 'combat', combat: true }),
  step('declareAttackers', 'Declare attackers step', { group: 'combat', combat: true }),
  step('declareBlockers', 'Declare blockers step', { group: 'combat', combat: true }),
  step('combatDamage', 'Combat damage step', { group: 'combat', combat: true }),
  step('endCombat', 'End of combat step', { group: 'combat', combat: true }),
  step('main2', 'Second main phase', { combat: false }),
  step('end', 'End step', { group: 'ending', combat: false }),
  step('cleanup', 'Cleanup step', { group: 'ending', combat: false, noPriority: true }),
];

/** Steps where someone gets priority: the turn strip and the Stops editor show only these. */
export const PRIORITY_STEPS: StepInfo[] = STEPS.filter((s) => !s.noPriority);

export const GROUP_CAPTIONS: Record<StepGroup, string> = {
  beginning: 'Beginning phase',
  combat: 'Combat phase',
  ending: 'Ending phase',
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
