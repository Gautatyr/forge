/** React glue: opens the live or replay source and exposes the view-model and an intent sender. */
import { useCallback, useEffect, useMemo, useReducer, useRef, useState, useSyncExternalStore } from 'react';
import type { Intent } from '../model/intents';
import type { GameView } from '../model/types';
import { DEFAULT_STOPS, type StopPrefs } from '../state/prefs';
import { isStop } from '../state/stops';
import { connectLive, streamUrl, type LiveSource } from './client';
import { autoAnswer, autoPassFrame, autoYieldFrame, intentToFrames, passAfterCastFrame, stopFrames } from './commands';
import { bridgeImageLookup, ImageResolver } from './images';
import { parseRecording, replaySource, RECORDINGS } from './replay';
import type { Notice } from './session';
import type { SourceConfig } from './source';
import { NO_LOCAL, passUntilYourTurnDone, toGameView, type LiveLocal } from './toView';
import { t, type Lang } from '../i18n';

/** Shown until the first snapshot names the players. */
export function placeholderView(what: string): GameView {
  return {
    id: 'live-pending',
    format: 'commander',
    youId: 'pending',
    players: [
      {
        id: 'pending',
        name: t('live.you'),
        seat: 0,
        isYou: true,
        isAi: false,
        life: 0,
        startingLife: 0,
        poison: 0,
        counters: [],
        handCount: 0,
        libraryCount: 0,
        hand: [],
        battlefield: [],
        graveyard: [],
        exile: [],
        command: [],
        commanders: [],
        commanderCasts: {},
        commanderDamageTaken: [],
        landsPlayedThisTurn: 0,
        hasLost: false,
      },
    ],
    cards: {},
    stack: [],
    turn: { number: 0, activePlayerId: 'pending', step: 'untap' },
    decision: { kind: 'waiting', forPlayerId: 'pending', what },
    autoPass: false,
    autoYield: false,
    autoYieldTo: [],
    passingUntilYourTurn: false,
    log: [],
  };
}

const NOOP_SUBSCRIBE = () => () => {};

export interface LiveApi {
  game: GameView;
  canUndo: boolean;
  send: (intent: Intent) => void;
  /** Newest engine message or rejection, shown once in the prompt line. */
  notice?: Notice;
}

/** Undefined for the mock source; hooks run either way. */
export function useLive(
  config: SourceConfig,
  stops: StopPrefs = DEFAULT_STOPS,
  autoPay = false,
  language: Lang = 'en',
  passAfterCast = false,
  autoPass = false,
  autoYield = false,
): LiveApi | undefined {
  const [source, setSource] = useState<LiveSource>();
  const [error, setError] = useState<string>();
  const [imagesVersion, imagesChanged] = useReducer((n: number) => n + 1, 0);
  const [images] = useState(() => new ImageResolver(imagesChanged));
  // Live: the bridge serves every card's image (Scryfall as the fallback); a replay has no bridge.
  const lookup = useMemo(
    () => (config.kind === 'live' ? bridgeImageLookup(config.url, config.token, language) : images.lookup),
    [config, images, language],
  );
  const [localState, setLocal] = useState<LiveLocal>(NO_LOCAL);
  const local = useMemo(() => ({ ...localState, autoPass, autoYield }), [localState, autoPass, autoYield]);

  useEffect(() => {
    if (config.kind === 'mock') return;
    let src: LiveSource | undefined;
    let cancelled = false;
    const ready: Promise<LiveSource> =
      config.kind === 'live'
        ? Promise.resolve(connectLive(streamUrl(config.url, config.token, config.seat)))
        : (RECORDINGS[config.recording]?.() ?? Promise.reject(new Error(t('live.unknownRecording', { name: config.recording })))).then((text) =>
            replaySource(parseRecording(text), { at: config.at, stepMs: config.stepMs }),
          );
    ready
      .then((s) => {
        src = s;
        if (cancelled) s.close();
        else setSource(s);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(String(e));
      });
    return () => {
      cancelled = true;
      src?.close();
    };
  }, [config]);

  const version = useSyncExternalStore(source?.subscribe ?? NOOP_SUBSCRIBE, () => source?.version ?? -1);

  const game = useMemo(() => {
    if (config.kind === 'mock') return undefined;
    if (error) return placeholderView(error);
    if (!source) return placeholderView(t('live.loading'));
    if (!source.session.gameObject?.props.Players?.length) {
      return placeholderView(source.status === 'open' ? t('live.waitStart') : t('live.connecting'));
    }
    return toGameView(source.session, lookup, local, autoPay);
    // version / imagesVersion track every session and image change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, source, error, version, imagesVersion, lookup, local, autoPay, language]);

  // Dev only: the current view-model, for checks from the browser console or Playwright.
  useEffect(() => {
    if (import.meta.env.DEV && game) Object.assign(window, { __liveGame: game });
  }, [game]);

  const send = useCallback(
    (intent: Intent) => {
      if (!source || !game) return;
      if (intent.type === 'passUntilYourTurn') setLocal((l) => ({ ...l, passingUntilYourTurn: true, passFromTurn: game.turn.number }));
      if (intent.type === 'cancelPassUntilYourTurn') setLocal((l) => ({ ...l, passingUntilYourTurn: false }));
      source.send(intentToFrames(intent, source.session, game));
    },
    [source, game],
  );

  // "To my turn" ends when your next turn comes (pressed on your own turn: the one after it).
  // Adjusting state during render: React's pattern for state derived from a change.
  if (game && local.passingUntilYourTurn && passUntilYourTurnDone(game, local.passFromTurn ?? -1)) {
    setLocal((l) => ({ ...l, passingUntilYourTurn: false }));
  }

  // Auto-pay: answer each payment with "Auto" once, when the engine can pay it.
  const paid = useRef<string>(undefined);
  const d = game?.decision;
  // One "Auto" per payment: the key is the payment, not its card or cost (both can change while it settles).
  const payKey = d?.kind === 'payMana' && d.autoCanPay ? String(source?.session.payment?.seq ?? '') : undefined;
  useEffect(() => {
    if (!autoPay || !payKey || paid.current === payKey || !source) return;
    paid.current = payKey;
    source.send([{ t: 'action', method: 'selectButtonOk' }]);
  }, [autoPay, payKey, source]);

  // Inputs with nothing to decide are answered without a prompt, once each (playtest 1).
  const auto = config.kind === 'live' && source ? autoAnswer(source.session) : undefined;
  const answered = useRef<string>(undefined);
  useEffect(() => {
    if (!auto) {
      answered.current = undefined;
      return;
    }
    if (!source || answered.current === auto.key) return;
    answered.current = auto.key;
    source.send(auto.frames);
    // auto.key names the input; its frames do not change while it is shown
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto?.key, source]);

  // Language → the bridge (card text, images): after the greeting of every connection, and on every change.
  const hello = source?.session.hello;
  useEffect(() => {
    if (config.kind !== 'live' || !source || source.status !== 'open' || !hello) return;
    source.send([{ t: 'setLanguage', lang: language }]);
  }, [config.kind, source, source?.status, hello, language]);

  // Pass after casting → the bridge: after the greeting of every connection (it may have restarted), and on every change.
  useEffect(() => {
    if (config.kind !== 'live' || !source || source.status !== 'open' || !hello) return;
    source.send([passAfterCastFrame(passAfterCast)]);
  }, [config.kind, source, source?.status, hello, passAfterCast]);

  // Auto-pass and auto-yield → the bridge: the same, and it applies them to each game of the seat.
  useEffect(() => {
    if (config.kind !== 'live' || !source || source.status !== 'open' || !hello) return;
    source.send([autoPassFrame(autoPass), autoYieldFrame(autoYield)]);
  }, [config.kind, source, source?.status, hello, autoPass, autoYield]);

  // Phase stops → the engine (the bridge skips none until told): on connect, on a new game or player list, on every edit.
  const stopsKey =
    config.kind === 'live' && source?.status === 'open' && game && game.id !== 'live-pending'
      ? `${game.id}|${game.youId}|${game.players.map((p) => p.id).join(',')}|${JSON.stringify(stops)}`
      : undefined;
  const sentStops = useRef<string>(undefined);
  useEffect(() => {
    if (!stopsKey || !source || !game || sentStops.current === stopsKey) return;
    sentStops.current = stopsKey;
    source.send(stopFrames(game, (turnPlayerId, step) => isStop(stops, game.youId, turnPlayerId, step), !!stops.involvedOnly));
    // stopsKey covers game and stops
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stopsKey, source]);

  const canUndo = !!source && source.session.input.cancel.enabled && source.session.input.cancel.label.startsWith('Undo');
  const notice = source?.session.notices.at(-1);
  return useMemo(
    () => (game ? { game, canUndo, send, notice } : undefined),
    [game, canUndo, send, notice],
  );
}
