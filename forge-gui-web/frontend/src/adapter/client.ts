/**
 * WebSocket client for one seat's stream: feeds a LiveSession, asks for a snapshot when the
 * stream breaks (`{"t":"requestResync"}`), reconnects with a bounded backoff (a fresh connection
 * starts with hello + snapshot), and sends replies and commands.
 */
import type { ClientFrame, ServerFrame } from './protocol';
import { LiveSession } from './session';

export type LinkStatus = 'connecting' | 'open' | 'closed';

export interface LiveSource {
  session: LiveSession;
  status: LinkStatus;
  /** Bumped on every change (session or status). */
  version: number;
  send: (frames: ClientFrame[]) => void;
  subscribe: (listener: () => void) => () => void;
  close: () => void;
}

/** Minimal WebSocket surface, so tests can inject a fake. */
export interface SocketLike {
  readyState: number;
  send(data: string): void;
  close(): void;
  onopen: ((ev: unknown) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  onclose: ((ev: unknown) => void) | null;
  onerror: ((ev: unknown) => void) | null;
}

export type SocketFactory = (url: string) => SocketLike;

const OPEN = 1;
const RETRY_MS = [500, 1000, 2000, 5000];

/** `ws://host/ws` + token + seat → the handshake URL (the bridge reads both from the query string). */
export function streamUrl(base: string, token: string, seat: number | 'spectator'): string {
  const u = new URL(base);
  u.searchParams.set('token', token);
  if (seat !== 'spectator') u.searchParams.set('seat', String(seat));
  return u.toString();
}

export function connectLive(
  url: string,
  factory: SocketFactory = (u) => new WebSocket(u) as unknown as SocketLike,
  schedule: (fn: () => void, ms: number) => unknown = (fn, ms) => setTimeout(fn, ms),
): LiveSource {
  const listeners = new Set<() => void>();
  let socket: SocketLike | undefined;
  let attempts = 0;
  let closed = false;

  const source: LiveSource = {
    session: new LiveSession(),
    status: 'connecting',
    version: 0,
    send(frames) {
      if (!socket || socket.readyState !== OPEN) return;
      for (const f of frames) socket.send(JSON.stringify(f));
      for (const f of frames) if (f.t === 'reply') source.session.answered(f.id);
      changed();
    },
    subscribe(l) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    close() {
      closed = true;
      socket?.close();
    },
  };

  function changed() {
    source.version += 1;
    for (const l of listeners) l();
  }

  function open() {
    source.status = 'connecting';
    const ws = factory(url);
    socket = ws;
    ws.onopen = () => {
      attempts = 0;
      source.status = 'open';
      changed();
    };
    ws.onmessage = (ev) => {
      let frame: ServerFrame;
      try {
        frame = JSON.parse(String(ev.data)) as ServerFrame;
      } catch {
        return;
      }
      if (source.session.apply(frame) === 'resync') ws.send(JSON.stringify({ t: 'requestResync' }));
      changed();
    };
    ws.onclose = () => {
      if (socket !== ws) return;
      source.status = 'closed';
      changed();
      if (closed) return;
      const wait = RETRY_MS[Math.min(attempts, RETRY_MS.length - 1)]!;
      attempts += 1;
      schedule(open, wait);
    };
    ws.onerror = () => ws.close();
  }

  open();
  return source;
}
