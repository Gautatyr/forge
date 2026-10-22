import type { MockGame } from '../mock/engine';
import { scenarioById } from '../mock/scenarios';

/** A fresh mock scenario that starts with the stored Auto-pay pref, as the live source does (scenarios start at off). */
export function buildScenario(id: string, autoPay: boolean): MockGame {
  return { ...scenarioById(id).build(), autoPay };
}
