import { createContext, use, useCallback, useMemo, useReducer, useState, type ReactNode } from 'react';
import { mockUrl, sourceFromLocation, type SourceConfig } from '../adapter/source';
import { useLive } from '../adapter/useLive';
import type { Intent } from '../model/intents';
import type { CardId, GameView, PlayerId } from '../model/types';
import { applyIntent, type MockGame } from '../mock/engine';
import { blockClick } from './blockClick';
import { currentDefender, focusForIntent, focusOnTurnChange } from './focus';
import { scenarioById } from '../mock/scenarios';
import { loadPrefs, savePrefs, type Prefs } from './prefs';
import { INITIAL_UI, type UiState } from './ui';

interface MatchApi {
  game: GameView;
  ui: UiState;
  prefs: Prefs;
  /** Mock scenario id, or 'live' / 'replay' when the game comes from the bridge (src/adapter/). */
  scenarioId: string;
  canUndo: boolean;
  send: (intent: Intent) => void;
  setUi: (patch: Partial<UiState> | ((u: UiState) => UiState)) => void;
  setPrefs: (patch: Partial<Prefs>) => void;
  loadScenario: (id: string) => void;
  /** Click on a card: what it means depends on the current decision. */
  activateCard: (id: CardId) => void;
  /** Click on a player (targets, attack defender). */
  activatePlayer: (id: PlayerId) => void;
}

const Ctx = createContext<MatchApi | null>(null);

interface History {
  scenarioId: string;
  game: MockGame;
  past: MockGame[];
}

type HistoryAction = { type: 'intent'; intent: Intent } | { type: 'load'; id: string };

function historyReducer(h: History, a: HistoryAction): History {
  if (a.type === 'load') return { scenarioId: a.id, game: scenarioById(a.id).build(), past: [] };
  if (a.intent.type === 'undo') {
    const prev = h.past.at(-1);
    return prev ? { ...h, game: prev, past: h.past.slice(0, -1) } : h;
  }
  const next = applyIntent(h.game, a.intent);
  if (next === h.game) return h;
  // Only real game actions are undoable, not settings toggles.
  const undoable = !['setAutoPass', 'setAutoYield', 'setAutoPay', 'toggleAutoYieldTo'].includes(a.intent.type);
  return { ...h, game: next, past: undoable ? [...h.past, h.game].slice(-30) : h.past };
}

function initialScenario(): string {
  return new URLSearchParams(location.search).get('scenario') ?? 'priority';
}

function initialPrefs(): Prefs {
  const p = loadPrefs();
  const q = new URLSearchParams(location.search);
  const layout = q.get('layout');
  return {
    ...p,
    ...(layout === 'columns' || layout === 'table' || layout === 'focus' ? { layout } : {}),
  };
}

export function MatchProvider({ children }: { children: ReactNode }) {
  const [h, dispatch] = useReducer(historyReducer, undefined, () => {
    const id = initialScenario();
    return { scenarioId: id, game: scenarioById(id).build(), past: [] };
  });
  const [ui, setUiState] = useState<UiState>(INITIAL_UI);
  const [prefs, setPrefsState] = useState<Prefs>(initialPrefs);
  const [source, setSource] = useState<SourceConfig>(() => sourceFromLocation(location));
  const live = useLive(source, prefs.stops);
  const liveSend = live?.send;

  const setUi = useCallback((patch: Partial<UiState> | ((u: UiState) => UiState)) => {
    setUiState((u) => (typeof patch === 'function' ? patch(u) : { ...u, ...patch }));
  }, []);

  const setPrefs = useCallback((patch: Partial<Prefs>) => {
    setPrefsState((p) => {
      const next = { ...p, ...patch };
      savePrefs(next);
      return next;
    });
  }, []);

  const send = useCallback((intent: Intent) => {
    if (liveSend) liveSend(intent);
    else dispatch({ type: 'intent', intent });
    if (['primary', 'cancel', 'undo', 'answer', 'play'].includes(intent.type)) {
      setUiState((u) => ({ ...u, pendingAttacker: undefined, pendingBlocker: undefined, trayPeek: false }));
    }
    const focus = focusForIntent(intent);
    if (focus) setUiState((u) => ({ ...u, focusOpponentId: focus }));
  }, [liveSend]);

  const loadScenario = useCallback((id: string) => {
    setSource({ kind: 'mock' });
    dispatch({ type: 'load', id });
    setUiState({ ...INITIAL_UI });
    history.replaceState(null, '', mockUrl(location.href, id));
  }, []);

  const game = live?.game ?? h.game;
  const scenarioId = source.kind === 'mock' ? h.scenarioId : source.kind;

  // Live: engine messages and rejected answers or actions show in the prompt line, like any neutral note.
  const notice = live?.notice;
  const [seenNotice, setSeenNotice] = useState(notice?.id);
  if (notice && seenNotice !== notice.id) {
    setSeenNotice(notice.id);
    setUiState((u) => ({ ...u, promptNote: { id: (u.promptNote?.id ?? 0) + 1, text: notice.text } }));
  }

  // Focus layout: when the turn passes, focus follows it (see focus.ts).
  // Adjusting state during render is React's pattern for "state derived from a change".
  const turnKey = `${scenarioId}|${game.turn.number}|${game.turn.activePlayerId}`;
  const [seenTurnKey, setSeenTurnKey] = useState(turnKey);
  if (seenTurnKey !== turnKey) {
    setSeenTurnKey(turnKey);
    setUiState((u) => ({ ...u, focusOpponentId: focusOnTurnChange(game, u.focusOpponentId) }));
  }

  const activateCard = useCallback(
    (id: CardId) => {
      const d = game.decision;
      switch (d.kind) {
        case 'priority':
          // Live: the engine decides what a click does (play, activate, or nothing).
          if (live || d.playable.includes(id)) send({ type: 'play', cardId: id });
          return;
        case 'chooseTargets':
          send({ type: 'toggleTarget', target: { kind: 'card', id } });
          return;
        case 'declareAttackers': {
          if (!d.candidates.includes(id)) return;
          const defender = currentDefender(game, ui, prefs.layout);
          if (defender) send({ type: 'toggleAttacker', cardId: id, defenderId: defender });
          return;
        }
        case 'declareBlockers': {
          const r = blockClick(d, { pendingBlocker: ui.pendingBlocker, pendingAttacker: ui.pendingAttacker }, id);
          if (r.intent) send(r.intent);
          setUi(r.pending);
          return;
        }
        case 'choice':
          // Live two-button inputs (pay mana, mulligan…) also take card clicks: 'play' is selectCard.
          if (live && d.prompt.id.startsWith('input:')) send({ type: 'play', cardId: id });
          return;
        default:
          return;
      }
    },
    [game, ui, prefs.layout, send, setUi, live],
  );

  const activatePlayer = useCallback(
    (id: PlayerId) => {
      const d = game.decision;
      if (d.kind === 'chooseTargets') send({ type: 'toggleTarget', target: { kind: 'player', id } });
      if (d.kind === 'declareAttackers' && d.defenders.includes(id)) setUi({ attackDefender: id, focusOpponentId: id });
    },
    [game.decision, send, setUi],
  );

  const api = useMemo<MatchApi>(
    () => ({
      game,
      ui,
      prefs,
      scenarioId,
      canUndo: live ? live.canUndo : h.past.length > 0,
      send,
      setUi,
      setPrefs,
      loadScenario,
      activateCard,
      activatePlayer,
    }),
    [game, ui, prefs, scenarioId, live, h.past.length, send, setUi, setPrefs, loadScenario, activateCard, activatePlayer],
  );

  return <Ctx value={api}>{children}</Ctx>;
}

export function useMatch(): MatchApi {
  const v = use(Ctx);
  if (!v) throw new Error('useMatch outside MatchProvider');
  return v;
}
