import { useEffect, useEffectEvent } from 'react';
import { currentDefender } from '../state/focus';
import { gameEndView, watching } from '../state/gameEnd';
import { useMatch } from '../state/MatchContext';
import { primaryAction } from '../state/primaryAction';
import { Arrows } from './Arrows';
import { Board } from './Board';
import { ChoiceTray } from './ChoiceTray';
import { ConcedeDialog, GameOverPanel, LeftMatch, OutToast, YouAreOut } from './GameEnd';
import { Hand } from './Hand';
import { HoverPreview } from './HoverPreview';
import { Inspector } from './Inspector';
import { liveManaChoice, ManaChooser } from './ManaChooser';
import { DevPanel, DisplaySettings, GameMenu, LogDrawer, ShortcutsOverlay } from './Overlays';
import { Rail } from './Rail';
import { StopsPanel } from './StopsPanel';
import { TopBar } from './TopBar';
import styles from './MatchScreen.module.css';

export function MatchScreen() {
  const match = useMatch();
  const { prefs } = match;

  useEffect(() => {
    document.documentElement.style.setProperty('--ui-scale', String(prefs.uiScale));
  }, [prefs.uiScale]);

  const onKey = useEffectEvent((e: KeyboardEvent) => {
    const { game, ui, setUi, send } = match;
    const el = e.target as HTMLElement | null;
    if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT')) {
      if (e.key !== 'Escape') return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    // A game-end dialog or panel owns the keyboard while open (GameEnd.tsx).
    if (gameEndView(game, ui) || ui.leftMatch) return;
    const d = game.decision;
    const key = e.key;
    const manaChoice = liveManaChoice(game, ui);

    if (key === ' ') {
      e.preventDefault();
      const a = primaryAction(game, ui, prefs.stops);
      if (a.enabled && a.intent) send(a.intent);
      return;
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
      else if (d.kind === 'chooseTargets' || d.kind === 'payMana') send({ type: 'cancel' });
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
        if (d.kind === 'declareAttackers') {
          const defenderId = currentDefender(game, ui, prefs.layout);
          if (defenderId) send({ type: 'attackWithAll', defenderId });
        }
        return;
    }
    // A dual land's mana chooser: live only while paying or holding priority, so never alongside the tray.
    if (/^[1-9]$/.test(key) && manaChoice) {
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

  if (match.ui.leftMatch) return <LeftMatch />;

  return (
    <div className={styles.screen}>
      <TopBar />
      <main className={styles.boardArea}>
        <Board />
        <ChoiceTray />
        <StopsPanel />
        <OutToast />
        <YouAreOut />
      </main>
      <Rail />
      <Hand />
      <Arrows />
      <HoverPreview />
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
