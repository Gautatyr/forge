/**
 * Which data source the match screen uses, from the page URL:
 * - mock (default): `?scenario=<id>`
 * - live bridge: `?live=<ws url>&token=<token>&seat=<N|spectator>`; `?live=1` (or `?live`) means
 *   `/ws` on this page's host (the bridge's own page, or the Vite dev proxy). The token may also
 *   ride in the fragment (`#token=…`), as in the URL the bridge prints.
 * - recorded stream: `?replay=<recording>&at=<messages>&play=<ms per message>`
 */
export type SourceConfig =
  | { kind: 'mock' }
  | { kind: 'live'; url: string; token: string; seat: number | 'spectator' }
  | { kind: 'replay'; recording: string; at?: number; stepMs?: number };

export function sourceFromLocation(loc: { search: string; hash: string; host: string; protocol: string }): SourceConfig {
  const q = new URLSearchParams(loc.search);
  const replay = q.get('replay');
  if (replay !== null) {
    const at = Number(q.get('at'));
    const play = Number(q.get('play'));
    return {
      kind: 'replay',
      recording: replay || 'commander4',
      ...(q.get('at') && Number.isFinite(at) ? { at } : {}),
      ...(q.get('play') && play > 0 ? { stepMs: play } : {}),
    };
  }
  const live = q.get('live');
  if (live === null) return { kind: 'mock' };
  const sameHost = `${loc.protocol === 'https:' ? 'wss' : 'ws'}://${loc.host}/ws`;
  const url = live === '' || live === '1' ? sameHost : live;
  const token = q.get('token') ?? new URLSearchParams(loc.hash.replace(/^#/, '')).get('token') ?? '';
  const seatParam = q.get('seat');
  const seat = seatParam === 'spectator' ? 'spectator' : Number.isInteger(Number(seatParam ?? '0')) ? Number(seatParam ?? '0') : 0;
  return { kind: 'live', url, token, seat };
}

/** The Mock button, the backtick key and `loadScenario` exist only off the live source: a scenario replaces the game and drops the seat token. */
export function mockScenariosAllowed(kind: SourceConfig['kind']): boolean {
  return kind !== 'live';
}

/** Same page with the live/replay parameters removed: back to the mock scenarios. */
export function mockUrl(href: string, scenarioId: string): string {
  const u = new URL(href);
  for (const k of ['live', 'token', 'seat', 'replay', 'at', 'play']) u.searchParams.delete(k);
  u.searchParams.set('scenario', scenarioId);
  u.hash = '';
  return u.toString();
}
