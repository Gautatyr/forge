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

  it('notifies subscribers and sends frames; a reply hides the prompt until the server closes or rejects it', () => {
    const { src, sockets } = setup();
    const ws = sockets[0]!;
    let calls = 0;
    src.subscribe(() => (calls += 1));
    ws.open();
    const prompt = { t: 'prompt', id: 2, method: 'confirm', shape: 'confirm', message: 'Draw?', yes: 'Yes', no: 'No', default: true };
    ws.receive(prompt);
    expect(src.session.prompt?.id).toBe(2);
    src.send([{ t: 'reply', id: 2, value: true }, { t: 'action', method: 'selectButtonOk' }]);
    expect(ws.sent).toEqual([{ t: 'reply', id: 2, value: true }, { t: 'action', method: 'selectButtonOk' }]);
    expect(src.session.prompt).toBeUndefined();
    expect(calls).toBe(3);
    ws.receive({ t: 'replyRejected', id: 2, reason: 'pick between 1 and 1' });
    expect(src.session.prompt?.id).toBe(2);
    expect(src.session.notices.at(-1)?.text).toContain('pick between 1 and 1');
    ws.receive({ t: 'promptClosed', id: 2, reason: 'answered' });
    expect(src.session.prompts).toEqual([]);
  });

  it('remembers the card clicked to cast, not the mana sources clicked to pay for it', () => {
    const { src, sockets } = setup();
    const ws = sockets[0]!;
    ws.open();
    ws.receive(snapshot);
    ws.receive({ t: 'call', method: 'showPromptMessage', args: [{ type: 'player', id: 0 }, 'Priority: You\nTurn: 3 (You)', null] });
    src.send([{ t: 'action', method: 'selectCard', card: 6 }]);
    ws.receive({ t: 'call', method: 'showPromptMessage', args: [{ type: 'player', id: 0 }, 'Siege - Choose target\n\nSelect target creature', null] });
    src.send([{ t: 'action', method: 'selectCard', card: 20 }]);
    ws.receive({ t: 'call', method: 'showPromptMessage', args: [{ type: 'player', id: 0 }, 'Siege\n\nPay Mana Cost: {2}{U}', { type: 'card', id: -1 }] });
    src.send([{ t: 'action', method: 'selectCard', card: 10 }]);
    expect(src.session.lastCard).toBe(6);
    expect(src.session.payment).toMatchObject({ cost: '{2}{U}' });
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
  it("reads the desktop launcher's seat URL (forge-gui-desktop-web WebMatchHost.seatUrl)", () => {
    const launcher = { search: '?live=1&seat=2', hash: '#token=t0k', host: '127.0.0.1:41234', protocol: 'http:' };
    expect(sourceFromLocation(launcher)).toEqual({ kind: 'live', url: 'ws://127.0.0.1:41234/ws', token: 't0k', seat: 2 });
  });
  it('reads a replay', () => {
    expect(sourceFromLocation(loc('?replay=commander4&at=250&play=200'))).toEqual({ kind: 'replay', recording: 'commander4', at: 250, stepMs: 200 });
    expect(sourceFromLocation(loc('?replay'))).toEqual({ kind: 'replay', recording: 'commander4' });
  });
  it('switches back to a mock scenario without the live parameters', () => {
    expect(mockUrl('http://localhost:5300/?live=1&seat=0&layout=table#token=x', 'combat')).toBe('http://localhost:5300/?layout=table&scenario=combat');
  });
});
