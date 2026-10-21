// Scripted wire check (Node >= 22, global WebSocket and fetch).
// Opens one WebSocket per viewer (a seat or the spectator), validates every message's shape, rebuilds
// each viewer's state from snapshot + deltas, checks referential integrity and per-viewer visibility
// after every delta, and at the end of the game compares each rebuilt state with the server's /state.
// Usage: node ws-check.mjs --token <spectator token> [--seat-tokens 0=<t0>,1=<t1>] [--url ws://127.0.0.1:7655/ws]
//        [--viewers spectator,0,1] [--min-deltas 20] [--timeout 1800]
// The server prints each token once: "[web] serving http://127.0.0.1:PORT/#token=<spectator token>" and
// "[web] seat N (...): http://127.0.0.1:PORT/#token=<seat token>". A token opens only its own view.
import { Stream } from './stream.mjs';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, all) =>
  v.startsWith('--') ? [...a, [v.slice(2), all[i + 1]]] : a, []));
const url = args.url ?? 'ws://127.0.0.1:7655/ws';
const viewers = (args.viewers ?? 'spectator').split(',').map((v) => v.trim()).filter(Boolean);
const minDeltas = Number(args['min-deltas'] ?? 20);
const timeoutS = Number(args.timeout ?? 1800);
const seatTokens = Object.fromEntries((args['seat-tokens'] ?? '').split(',').filter(Boolean).map((p) => p.split('=')));
const tokenOf = (v) => (v === 'spectator' ? args.token : seatTokens[v]);
for (const v of viewers) if (!tokenOf(v)) { console.error(`no token for viewer ${v}`); process.exit(2); }

const t0 = Date.now();
const streams = viewers.map((v) => new Stream(v, { url, token: tokenOf(v), timeoutS }));
const ends = await Promise.all(streams.map((s) => s.run()));
const secs = (Date.now() - t0) / 1000;
const report = [];
for (let i = 0; i < streams.length; i++) {
  const s = streams[i];
  if (ends[i] === 'final') await s.compareWithServer();
  s.ws.close();
  if (s.deltas < minDeltas) s.fail(`only ${s.deltas} deltas (< ${minDeltas})`);
  if (ends[i] !== 'final') s.fail(`ended by ${ends[i]} before the final delta`);
  if (s.hidden !== 'FULL' && s.placeholdersSeen === 0) s.fail('no hidden card was ever checked');
  report.push({ viewer: s.name, end: ends[i], hidden: s.hidden, game: s.game, seq: s.seq, objects: s.objects.size,
    snapshotBytes: s.snapshotBytes, deltas: s.deltas, deltaBytes: s.bytes, maxDeltaBytes: s.maxBytes,
    avgDeltaBytes: Math.round(s.bytes / Math.max(1, s.deltas)), logLines: s.logLines,
    placeholderChecks: s.placeholdersSeen, hiddenFaceDownChecks: s.faceDownHiddenSeen,
    cardRefChecks: s.cardRefChecks, danglingEngineRefs: s.danglingEngineRefs,
    deltasPerSecond: +(s.deltas / secs).toFixed(2), bytesPerSecond: Math.round(s.bytes / secs),
    latencyMs: s.lat.length ? { avg: +(s.lat.reduce((a, b) => a + b, 0) / s.lat.length).toFixed(1), p95: s.lat.sort((a, b) => a - b)[Math.floor(s.lat.length * 0.95)], max: s.lat[s.lat.length - 1] } : null,
    errors: s.errors });
}
console.log(JSON.stringify({ seconds: secs, streams: report }, null, 1));
process.exit(streams.some((s) => s.errors.length) ? 1 : 0);
