import { describe, expect, it } from 'vitest';
import { connectLive, streamUrl, type SocketLike } from './client';
import { mockUrl, sourceFromLocation } from './source';

class FakeSocket implements SocketLike {
  readyState = 0;
  sent: unknown[] = [];
  onopen: SocketLike['onopen'] = null;
  onmessage: SocketLike['onmessage'] = null;
  onclose: SocketLike['onclose'] = null;
  onerror: SocketLike['onerror'] = null;
  readonly url: string;
  constructor(url: string) {
    this.url = url;
  }
  send(d: string) {
    this.sent.push(JSON.parse(d));
  }
  close() {
    this.readyState = 3;
    this.onclose?.({});
  }
  open() {
    this.readyState = 1;
    this.onopen?.({});
  }
  receive(m: unknown) {
    this.onmessage?.({ data: JSON.stringify(m) });
  }
}

const snapshot = { t: 'snapshot', game: 1, seq: 0, label: 'x', viewer: { seat: 0, player: 0 }, objects: [], log: [] };
const delta = (seq: number) => ({ t: 'delta', game: 1, seq, ts: 0, new: [], changed: [], removed: [], log: [], events: [] });

function setup() {
  const sockets: FakeSocket[] = [];
  const timers: (() => void)[] = [];
  const src = connectLive(
    'ws://h/ws?token=t&seat=0',
    (u) => {
      const s = new FakeSocket(u);
      sockets.push(s);
      return s;
    },
    (fn) => timers.push(fn),
  );
  return { src, sockets, timers };
}

describe('connectLive', () => {
  it('applies frames and asks for a resync on a gap', () => {
    const { src, sockets } = setup();
    const ws = sockets[0]!;
    ws.open();
    expect(src.status).toBe('open');
    ws.receive(snapshot);
    ws.receive(delta(1));
    expect(ws.sent).toEqual([]);
    ws.receive(delta(3));
    expect(ws.sent).toEqual([{ t: 'requestResync' }]);
    expect(src.session.awaitingSnapshot).toBe(true);
  });

  it('notifies subscribers and sends frames; a reply clears the prompt', () => {
    const { src, sockets } = setup();
    const ws = sockets[0]!;
    let calls = 0;
    src.subscribe(() => (calls += 1));
    ws.open();
    ws.receive({ t: 'prompt', id: 2, method: 'confirm', title: 'Draw?', choices: [] });
    expect(src.session.prompt?.id).toBe(2);
    src.send([{ t: 'reply', id: 2, value: true }, { t: 'selectButtonOk' }]);
    expect(ws.sent).toEqual([{ t: 'reply', id: 2, value: true }, { t: 'selectButtonOk' }]);
    expect(src.session.prompt).toBeUndefined();
    expect(calls).toBe(3);
  });

  it('reconnects after the socket closes, until closed by the page', () => {
    const { src, sockets, timers } = setup();
    sockets[0]!.open();
    sockets[0]!.close();
    expect(src.status).toBe('closed');
    expect(timers).toHaveLength(1);
    timers[0]!();
    expect(sockets).toHaveLength(2);
    src.close();
    expect(timers).toHaveLength(1);
  });

  it('builds the handshake URL with token and seat', () => {
    expect(streamUrl('ws://127.0.0.1:7655/ws', 'a b', 2)).toBe('ws://127.0.0.1:7655/ws?token=a+b&seat=2');
    expect(streamUrl('ws://127.0.0.1:7655/ws', 't', 'spectator')).toBe('ws://127.0.0.1:7655/ws?token=t');
  });
});

describe('sourceFromLocation', () => {
  const loc = (search: string, hash = '') => ({ search, hash, host: 'localhost:5300', protocol: 'http:' });
  it('defaults to the mock scenarios', () => {
    expect(sourceFromLocation(loc('?scenario=combat'))).toEqual({ kind: 'mock' });
  });
  it('reads a live URL, or this host for ?live=1, with the token from the query or the fragment', () => {
    expect(sourceFromLocation(loc('?live=ws://127.0.0.1:7700/ws&token=abc&seat=1'))).toEqual({
      kind: 'live',
      url: 'ws://127.0.0.1:7700/ws',
      token: 'abc',
      seat: 1,
    });
    expect(sourceFromLocation(loc('?live=1', '#token=xyz'))).toEqual({ kind: 'live', url: 'ws://localhost:5300/ws', token: 'xyz', seat: 0 });
    expect(sourceFromLocation(loc('?live&seat=spectator', '#token=xyz'))).toMatchObject({ seat: 'spectator' });
  });
  it('reads a replay', () => {
    expect(sourceFromLocation(loc('?replay=commander4&at=250&play=200'))).toEqual({ kind: 'replay', recording: 'commander4', at: 250, stepMs: 200 });
    expect(sourceFromLocation(loc('?replay'))).toEqual({ kind: 'replay', recording: 'commander4' });
  });
  it('switches back to a mock scenario without the live parameters', () => {
    expect(mockUrl('http://localhost:5300/?live=1&seat=0&layout=table#token=x', 'combat')).toBe('http://localhost:5300/?layout=table&scenario=combat');
  });
});
