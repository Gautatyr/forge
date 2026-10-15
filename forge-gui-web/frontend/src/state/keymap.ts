/** Keyboard shortcuts, Arena-style where they do not clash (D9). Shown by the ? overlay. */
export interface Shortcut {
  keys: string;
  action: string;
  group: 'Play' | 'Look' | 'Screen';
}

export const SHORTCUTS: Shortcut[] = [
  { keys: 'Space', action: 'Main button: pass, resolve, attack, block, confirm', group: 'Play' },
  { keys: 'Esc', action: 'Cancel a spell being cast, clear a pending choice, close panels', group: 'Play' },
  { keys: 'Shift + Enter', action: 'Pass until my next turn', group: 'Play' },
  { keys: 'Z', action: 'Undo', group: 'Play' },
  { keys: 'A', action: 'Attack all (while declaring attackers)', group: 'Play' },
  { keys: 'P', action: 'Auto-pass when I can’t act: on / off', group: 'Play' },
  { keys: '1 – 9', action: 'Pick an option in the choice tray or a row of the ability menu', group: 'Play' },
  { keys: 'Y / N', action: 'Answer a yes / no question', group: 'Play' },
  { keys: 'Alt + ↑ / ↓', action: 'Move the focused item while ordering', group: 'Play' },
  { keys: 'I', action: 'Inspect the hovered card (or right-click it)', group: 'Look' },
  { keys: 'V', action: 'Peek at the board while a choice is open', group: 'Look' },
  { keys: 'Hold Alt', action: 'Show keywords on permanents in words', group: 'Look' },
  { keys: 'L', action: 'Full game log', group: 'Look' },
  { keys: 'D', action: 'Display options: layout, card size, grouping, scale', group: 'Screen' },
  { keys: '?', action: 'This list', group: 'Screen' },
  { keys: '`', action: 'Mock scenarios (development only)', group: 'Screen' },
];
