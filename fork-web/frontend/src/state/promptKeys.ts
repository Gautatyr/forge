import type { Intent } from '../model/intents';
import type { UiState } from './ui';

/**
 * A prompt's keys (Space, N, Y, digits 1–9) answer the prompt only while nothing sits over it: an inspector or an
 * overlay (shortcuts, display, dev) owns the keyboard until Esc closes it. Shared by the tray and the screen.
 */
export function promptKeysLive(ui: Pick<UiState, 'inspectId' | 'overlay'>): boolean {
  return !ui.inspectId && !ui.overlay;
}

/**
 * The screen's Space handler. Space is always swallowed (`preventDefault` first, so the browser never clicks a focused
 * button behind an overlay or the inspector); it sends the primary action only while the prompt keys are live, and never
 * an answer that gives something up (U8): that has its own key.
 */
export function handleSpace(
  e: { preventDefault(): void },
  ui: Pick<UiState, 'inspectId' | 'overlay'>,
  action: { enabled: boolean; intent?: Intent; guard?: unknown },
  send: (intent: Intent) => void,
): void {
  e.preventDefault();
  if (!promptKeysLive(ui)) return;
  if (action.enabled && action.intent && !action.guard) send(action.intent);
}
