import { useEffect, useEffectEvent } from 'react';
import { canAttackAll } from '../state/attackLimit';
import { currentAttackAim } from '../state/focus';
import { gameEndView, watching } from '../state/gameEnd';
import { useMatch } from '../state/MatchContext';
import { primaryAction } from '../state/primaryAction';
import { dropsFocusAfterClick, handleSpace, pickDigitTarget, promptKeysLive, takesKeys } from '../state/promptKeys';
import { NONE_GUARD } from './tray/trayLogic';
import { Arrows } from './Arrows';
import { Board } from './Board';
import { ChoiceTray } from './ChoiceTray';
import { ConcedeDialog, GameOverPanel, LeftMatch, OutToast, YouAreOut } from './GameEnd';
import { Hand } from './Hand';
import { Inspector } from './Inspector';
import { liveManaChoice, ManaChooser } from './ManaChooser';
import { DevPanel, DisplaySettings, GameMenu, LogDrawer, ShortcutsOverlay } from './Overlays';
import { Rail } from './Rail';
import { StopsPanel } from './StopsPanel';
import { TopBar } from './TopBar';
import { ZoneBrowser } from './ZoneBrowser';
import styles from './MatchScreen.module.css';

export function MatchScreen() {
  const match = useMatch();
  const { prefs } = match;

  useEffect(() => {
    document.documentElement.style.setProperty('--ui-scale', String(prefs.uiScale));
  }, [prefs.uiScale]);
  useEffect(() => {
    document.documentElement.lang = prefs.language;
  }, [prefs.language]);

  const onKey = useEffectEvent((e: KeyboardEvent) => {
    const { game, ui, setUi, send } = match;
    const el = e.target as HTMLElement | null;
    // A field takes its own keys (a switch only with keyboard focus: after a click Space still passes, issue #126).
    if (takesKeys(el) && e.key !== 'Escape') return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    // A game-end dialog or panel owns the keyboard while open (GameEnd.tsx).
    if (gameEndView(game, ui) || ui.leftMatch) return;
    const d = game.decision;
    const key = e.key;
    const manaChoice = liveManaChoice(game, ui);
    // The prompt's keys (Space, N, digits) are inert while an inspector or an overlay is open, as in the tray.
    const promptKeys = promptKeysLive(ui);

    if (key === ' ') {
      handleSpace(e, ui, primaryAction(game, ui, prefs.stops), send, (text) =>
        setUi((u) => ({ ...u, promptNote: { id: (u.promptNote?.id ?? 0) + 1, text } })),
      );
      return;
    }
    if (promptKeys && key.toLowerCase() === NONE_GUARD.key && !e.shiftKey) {
      const a = primaryAction(game, ui, prefs.stops);
      if (a.guard === NONE_GUARD && a.enabled && a.intent) {
        e.preventDefault();
        send(a.intent);
        return;
      }
    }
    if (key === 'Enter' && e.shiftKey) {
      e.preventDefault();
      send({ type: 'passUntilYourTurn' });
      return;
    }
    if (key === 'Escape') {
      if (ui.inspectId) setUi({ inspectId: undefined });
      else if (ui.overlay) setUi({ overlay: undefined });
      else if (ui.logOpen) setUi({ logOpen: false });
      else if (manaChoice) setUi({ manaChoice: undefined });
      else if (ui.pendingBlocker || ui.pendingAttacker) setUi({ pendingBlocker: undefined, pendingAttacker: undefined });
      // The Cancel button's Esc: a combat draft is cleared, the declaration goes on (issue #130).
      else if ((d.kind === 'declareAttackers' || d.kind === 'declareBlockers') && d.draft.length > 0) send({ type: 'cancel' });
      else if (d.kind === 'chooseTargets' || d.kind === 'payMana' || (d.kind === 'choice' && d.cancellable)) send({ type: 'cancel' });
      else if (ui.zoneView) setUi({ zoneView: undefined });
      else if (ui.trayPeek) setUi({ trayPeek: false });
      return;
    }
    if (key === '?') return setUi((u) => ({ ...u, overlay: u.overlay === 'shortcuts' ? undefined : 'shortcuts' }));
    if (key === '`') return setUi((u) => ({ ...u, overlay: u.overlay === 'dev' ? undefined : 'dev' }));
    switch (key.toLowerCase()) {
      case 'l':
        return setUi((u) => ({ ...u, logOpen: !u.logOpen }));
      case 'd':
        return setUi((u) => ({ ...u, overlay: u.overlay === 'display' ? undefined : 'display' }));
      case 'i':
        if (ui.inspectId) return setUi({ inspectId: undefined });
        if (ui.hover) return setUi({ inspectId: ui.hover.cardId, hover: undefined });
        return;
      case 'p':
        return send({ type: 'setAutoPass', on: !game.autoPass });
      case 'z':
        if (game.result || watching(game)) return;
        // While paying, Z undoes the last tap (design pass 4, §2.1).
        return send(d.kind === 'payMana' ? { type: 'undoTap' } : { type: 'undo' });
      case 'a':
        if (d.kind === 'declareAttackers' && canAttackAll(d)) {
          const aim = currentAttackAim(game, ui, prefs.layout);
          if (aim) send({ type: 'attackWithAll', ...aim });
        }
        return;
    }
    // A card pick from your hand (discard, imprint): the Nth card of the hand (#121, issue #131).
    if (promptKeys) {
      const target = pickDigitTarget(game, key);
      if (target) return send({ type: 'toggleTarget', target });
    }
    // A dual land's mana chooser: live only while paying or holding priority, so never alongside the tray.
    if (promptKeys && /^[1-9]$/.test(key) && manaChoice) {
      const colour = manaChoice.colours[Number(key) - 1];
      if (colour) {
        setUi({ manaChoice: undefined });
        send({ type: 'tapForMana', cardId: manaChoice.cardId, colour });
      }
      return;
    }
    // A prompt's own keys (1–9, V, Y/N, Space, Esc in the ability menu) are handled by ChoiceTray.
  });

  useEffect(() => {
    const h = (e: KeyboardEvent) => onKey(e);
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  // A switch clicked with the pointer keeps focus, and Space would flip it back instead of passing (issue #126).
  useEffect(() => {
    const h = () => {
      const el = document.activeElement;
      if (el instanceof HTMLElement && dropsFocusAfterClick(el)) el.blur();
    };
    document.addEventListener('click', h);
    return () => document.removeEventListener('click', h);
  }, []);

  if (match.ui.leftMatch) return <LeftMatch />;

  return (
    <div className={styles.screen}>
      <TopBar />
      <main
        className={styles.boardArea}
        // A click on empty board (not a card or a button) drops a half-made block, like Esc.
        onClick={(e) => {
          const { ui, setUi } = match;
          if ((ui.pendingBlocker || ui.pendingAttacker) && !(e.target as HTMLElement).closest('button, a, input, select, textarea')) {
            setUi({ pendingBlocker: undefined, pendingAttacker: undefined });
          }
        }}
      >
        <Board />
        <ChoiceTray />
        <StopsPanel />
        <ZoneBrowser />
        <OutToast />
        <YouAreOut />
      </main>
      <Rail />
      <Hand />
      <Arrows />
      <Inspector />
      <ManaChooser />
      <LogDrawer />
      <DisplaySettings />
      <GameMenu />
      <ShortcutsOverlay />
      <ConcedeDialog />
      <GameOverPanel />
      <DevPanel />
    </div>
  );
}
