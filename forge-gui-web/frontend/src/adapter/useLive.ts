/** React glue: opens the live or replay source and exposes the view-model and an intent sender. */
import { useCallback, useEffect, useMemo, useReducer, useState, useSyncExternalStore } from 'react';
import type { Intent } from '../model/intents';
import type { GameView } from '../model/types';
import { connectLive, streamUrl, type LiveSource } from './client';
import { intentToFrames } from './commands';
import { ImageResolver } from './images';
import { parseRecording, replaySource, RECORDINGS } from './replay';
import type { SourceConfig } from './source';
import { toGameView } from './toView';

/** Shown until the first snapshot names the players. */
export function placeholderView(what: string): GameView {
  return {
    id: 'live-pending',
    format: 'commander',
    youId: 'pending',
    players: [
      {
        id: 'pending',
        name: 'You',
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
}

/** Undefined for the mock source; hooks run either way. */
export function useLive(config: SourceConfig): LiveApi | undefined {
  const [source, setSource] = useState<LiveSource>();
  const [error, setError] = useState<string>();
  const [imagesVersion, imagesChanged] = useReducer((n: number) => n + 1, 0);
  const [images] = useState(() => new ImageResolver(imagesChanged));

  useEffect(() => {
    if (config.kind === 'mock') return;
    let src: LiveSource | undefined;
    let cancelled = false;
    const ready: Promise<LiveSource> =
      config.kind === 'live'
        ? Promise.resolve(connectLive(streamUrl(config.url, config.token, config.seat)))
        : (RECORDINGS[config.recording]?.() ?? Promise.reject(new Error(`Unknown recording "${config.recording}"`))).then((text) =>
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
    if (!source) return placeholderView('Loading');
    if (!source.session.gameObject?.props.Players?.length) {
      return placeholderView(source.status === 'open' ? 'Waiting for the game to start' : 'Connecting to the bridge');
    }
    return toGameView(source.session, images.lookup);
    // version / imagesVersion track every session and image change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, source, error, version, imagesVersion, images]);

  const send = useCallback(
    (intent: Intent) => {
      if (!source || !game) return;
      source.send(intentToFrames(intent, source.session, game));
    },
    [source, game],
  );

  const canUndo = !!source && source.session.input.cancel.enabled && source.session.input.cancel.label.startsWith('Undo');
  return useMemo(() => (game ? { game, canUndo, send } : undefined), [game, canUndo, send]);
}
