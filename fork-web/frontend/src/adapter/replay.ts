/**
 * Plays a recorded stream (JSONL, one server message per line; scripts/record-stream.mjs) into a
 * LiveSession without the engine: `?replay=commander4&at=<message count>&play=<ms per message>`.
 */
import type { LiveSource } from './client';
import type { ServerFrame } from './protocol';
import { LiveSession } from './session';

export const RECORDINGS: Record<string, () => Promise<string>> = {
  // Lazy: the 4-player Commander recording (seat 0, ~80 KB gzipped) loads only in replay mode.
  commander4: async () => gunzipDataUrl((await import('./fixtures/commander4-seat0.jsonl.gz?inline')).default),
};

export async function gunzipDataUrl(dataUrl: string): Promise<string> {
  const body = (await fetch(dataUrl)).body;
  if (!body) throw new Error('empty recording');
  return new Response(body.pipeThrough(new DecompressionStream('gzip'))).text();
}

export function parseRecording(text: string): ServerFrame[] {
  return text
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as ServerFrame);
}

export interface ReplayOptions {
  /** Messages applied at once (default: all). */
  at?: number;
  /** Then one more message every this many ms (default: stop). */
  stepMs?: number;
}

export function replaySource(frames: ServerFrame[], opts: ReplayOptions = {}): LiveSource {
  const listeners = new Set<() => void>();
  let next = 0;
  let timer: ReturnType<typeof setInterval> | undefined;
  const source: LiveSource = {
    session: new LiveSession(),
    status: 'open',
    version: 0,
    send: () => {},
    subscribe(l) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    close() {
      if (timer) clearInterval(timer);
    },
  };
  const step = () => {
    const f = frames[next];
    if (!f) {
      if (timer) clearInterval(timer);
      return;
    }
    source.session.apply(f);
    next += 1;
  };
  const changed = () => {
    source.version += 1;
    for (const l of listeners) l();
  };
  const at = Math.min(opts.at ?? frames.length, frames.length);
  while (next < at) step();
  if (opts.stepMs && opts.stepMs > 0) {
    timer = setInterval(() => {
      step();
      changed();
    }, opts.stepMs);
  }
  return source;
}
