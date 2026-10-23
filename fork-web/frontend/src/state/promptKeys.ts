import type { UiState } from './ui';

/**
 * A prompt's keys (Space, N, Y, digits 1–9) answer the prompt only while nothing sits over it: an inspector or an
 * overlay (shortcuts, display, dev) owns the keyboard until Esc closes it. Shared by the tray and the screen.
 */
export function promptKeysLive(ui: Pick<UiState, 'inspectId' | 'overlay'>): boolean {
  return !ui.inspectId && !ui.overlay;
}
