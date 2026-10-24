import { t } from '../i18n';

/** Keyboard shortcuts, Arena-style where they do not clash (D9). Shown by the ? overlay. */
export interface Shortcut {
  keys: string;
  action: string;
  group: 'Play' | 'Look' | 'Screen';
}

/** Built per call: the words follow the current language. `withMock`: the mock-scenario key works on this page (not in a live game). */
export function shortcuts(withMock = true): Shortcut[] {
  const all: Shortcut[] = [
    { keys: t('key.space'), action: t('sc.space'), group: 'Play' },
    { keys: t('key.esc'), action: t('sc.esc'), group: 'Play' },
    { keys: t('sc.shiftEnter'), action: t('sc.passTurn'), group: 'Play' },
    { keys: t('sc.shiftClick'), action: t('sc.holdPriority'), group: 'Play' },
    { keys: 'Z', action: t('sc.undo'), group: 'Play' },
    { keys: 'A', action: t('sc.attackAll'), group: 'Play' },
    { keys: 'P', action: t('sc.autoPass'), group: 'Play' },
    { keys: '1 – 9', action: t('sc.pick'), group: 'Play' },
    { keys: 'Y / N', action: t('sc.yesNo'), group: 'Play' },
    { keys: 'N', action: t('sc.none'), group: 'Play' },
    { keys: 'M', action: t('sc.mulligan'), group: 'Play' },
    { keys: 'Alt + ↑ / ↓', action: t('sc.move'), group: 'Play' },
    { keys: 'I', action: t('sc.inspect'), group: 'Look' },
    { keys: 'V', action: t('sc.peek'), group: 'Look' },
    { keys: t('sc.holdAlt'), action: t('sc.holdAltAction'), group: 'Look' },
    { keys: 'L', action: t('sc.log'), group: 'Look' },
    { keys: 'D', action: t('sc.display'), group: 'Screen' },
    { keys: '?', action: t('sc.help'), group: 'Screen' },
    { keys: '`', action: t('sc.mock'), group: 'Screen' },
  ];
  return withMock ? all : all.filter((s) => s.keys !== '`');
}
