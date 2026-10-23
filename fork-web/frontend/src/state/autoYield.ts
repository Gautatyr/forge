import type { Intent } from '../model/intents';

/** "Always yield to this" does nothing while auto-yield is off: adding an ability switches it on, removing one never does. */
export function switchesAutoYieldOn(intent: Intent, autoYield: boolean, autoYieldTo: readonly string[]): boolean {
  return intent.type === 'toggleAutoYieldTo' && !autoYield && !autoYieldTo.includes(intent.key);
}
