// Scripted wire check (Node >= 22, global WebSocket and fetch).
// Connects to the spike server, validates every message's shape, rebuilds the state from the
// snapshot + deltas, checks referential integrity and hidden-zone redaction after every delta,
// and at the end of the game compares the rebuilt state with the server's /state.
// Usage: node ws-check.mjs --token <per-launch token> [--url ws://127.0.0.1:7655/ws] [--min-deltas 20] [--timeout 1800]
// The token is in the URL the server prints: "[web] serving http://127.0.0.1:PORT/#token=<token>".
const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, all) =>
  v.startsWith('--') ? [...a, [v.slice(2), all[i + 1]]] : a, []));
const url = args.url ?? 'ws://127.0.0.1:7655/ws';
const minDeltas = Number(args['min-deltas'] ?? 20);
const timeoutS = Number(args.timeout ?? 1800);
const httpBase = url.replace(/^ws/, 'http').replace(/\/ws$/, '');
const token = encodeURIComponent(args.token ?? '');

const errors = [];
const fail = (m) => { if (errors.length < 50) errors.push(m); };
let schema = null, hidden = null, game = null, seq = 0;
const objects = new Map();
const lat = [];
let deltas = 0, bytes = 0, maxBytes = 0, snapshotBytes = 0, logLines = 0, finalSeen = false;
const t0 = Date.now();

const keyOf = (o) => o.state ? `${o.type}:${o.id}:${o.state}` : `${o.type}:${o.id}`;
const isObj = (o) => o && typeof o.type === 'string' && Number.isInteger(o.id) && typeof o.props === 'object'
  && (o.type !== 'cardState' || typeof o.state === 'string');

function refsOf(owner, name, v) {
  const kind = schema[name];
  if (v === null || v === undefined) return [];
  switch (kind) {
    case 'card': return [`card:${v}`];
    case 'player': return [`player:${v}`];
    case 'stack_item': return [`stackItem:${v}`];
    case 'cards': return v.map((id) => `card:${id}`);
    case 'players': return v.map((id) => `player:${id}`);
    case 'stack_items': return v.map((id) => `stackItem:${id}`);
    case 'entity': return v.type ? [`${v.type}:${v.id}`] : [];
    case 'card_state': return owner.type === 'card' ? [`cardState:${owner.id}:${v}`] : [];
    default: return [];
  }
}

// Containment references (zones, stack, states) must resolve; cross references such as
// Controller or EntityAttachedTo may point at objects network play itself never walks.
const CONTAINMENT = new Set(['cards', 'players', 'stack_items', 'card_state']);
function checkIntegrity(where) {
  for (const o of objects.values()) {
    for (const [name, v] of Object.entries(o.props)) {
      if (!(name in schema)) fail(`${where}: unknown property ${name}`);
      if (!CONTAINMENT.has(schema[name])) continue;
      for (const r of refsOf(o, name, v)) if (!objects.has(r)) fail(`${where}: ${keyOf(o)}.${name} -> missing ${r}`);
    }
    if (hidden === 'REDACT' && o.type === 'card' && ['Library', 'Hand'].includes(o.props.Zone)) {
      const extra = Object.keys(o.props).filter((k) => !['Zone', 'Owner', 'Controller'].includes(k));
      if (extra.length) fail(`${where}: hidden card ${keyOf(o)} leaks ${extra.join(',')}`);
    }
  }
}

function onMessage(text) {
  const n = Buffer.byteLength(text);
  const m = JSON.parse(text);
  if (m.t === 'hello') {
    if (typeof m.schema !== 'object' || m.v !== 1) fail('bad hello');
    schema = m.schema; hidden = m.hidden; return;
  }
  if (!schema) fail('message before hello');
  if (m.t === 'snapshot') {
    snapshotBytes = n; game = m.game; seq = m.seq; objects.clear();
    if (!Array.isArray(m.objects) || !Array.isArray(m.log)) fail('bad snapshot');
    for (const o of m.objects) { if (!isObj(o)) fail(`bad object ${JSON.stringify(o).slice(0, 80)}`); objects.set(keyOf(o), structuredClone(o)); }
    checkIntegrity(`snapshot seq=${seq}`);
    console.log(`snapshot game=${game} seq=${seq} objects=${objects.size} bytes=${n}`);
    return;
  }
  if (m.t !== 'delta') { fail(`unknown message ${m.t}`); return; }
  if (m.game !== game) { fail(`delta for game ${m.game} while on ${game}`); return; }
  if (m.seq !== seq + 1) fail(`seq gap ${seq} -> ${m.seq}`);
  if (typeof m.ts === 'number') lat.push(Date.now() - m.ts);
  seq = m.seq; deltas++; bytes += n; maxBytes = Math.max(maxBytes, n);
  for (const f of ['new', 'changed', 'removed', 'log', 'events']) if (!Array.isArray(m[f])) fail(`delta ${seq} missing ${f}`);
  for (const o of m.new) { if (!isObj(o)) fail(`bad new ${JSON.stringify(o).slice(0, 80)}`); objects.set(keyOf(o), structuredClone(o)); }
  for (const c of m.changed) {
    const o = objects.get(keyOf(c));
    if (!o) { fail(`delta ${seq}: change for unknown ${keyOf(c)}`); continue; }
    for (const [k, v] of Object.entries(c.props)) { if (v === null) delete o.props[k]; else o.props[k] = v; }
  }
  for (const k of m.removed) if (!objects.delete(k)) fail(`delta ${seq}: removed unknown ${k}`);
  logLines += m.log.length;
  checkIntegrity(`delta seq=${seq}`);
  if (m.final) finalSeen = true;
}

async function compareWithServer() {
  const s = await (await fetch(`${httpBase}/state?token=${token}`)).json();
  if (s.seq !== seq || s.game !== game) { fail(`/state at game ${s.game} seq ${s.seq}, client at ${game}/${seq}`); return; }
  const server = new Map(s.objects.map((o) => [keyOf(o), o]));
  if (server.size !== objects.size) fail(`object count server=${server.size} client=${objects.size}`);
  for (const [k, o] of server) {
    const mine = objects.get(k);
    if (!mine) { fail(`client lacks ${k}`); continue; }
    if (JSON.stringify(sortKeys(mine.props)) !== JSON.stringify(sortKeys(o.props))) fail(`props differ for ${k}`);
  }
}
const sortKeys = (o) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));

const ws = new WebSocket(`${url}?token=${token}`);
const done = new Promise((resolve) => {
  ws.onmessage = (ev) => { try { onMessage(ev.data); } catch (e) { fail(`exception ${e}`); } if (finalSeen) resolve('final'); };
  ws.onerror = (e) => { fail(`ws error ${e.message ?? e}`); resolve('error'); };
  ws.onclose = () => resolve('closed');
  setTimeout(() => resolve('timeout'), timeoutS * 1000);
});
const why = await done;
if (why === 'final') await compareWithServer();
ws.close();
const secs = (Date.now() - t0) / 1000;
if (deltas < minDeltas) fail(`only ${deltas} deltas (< ${minDeltas})`);
if (why !== 'final') fail(`ended by ${why} before the final delta`);
console.log(JSON.stringify({ end: why, hidden, game, seq, objects: objects.size, snapshotBytes, deltas, deltaBytes: bytes,
  maxDeltaBytes: maxBytes, avgDeltaBytes: Math.round(bytes / Math.max(1, deltas)), logLines, seconds: secs,
  deltasPerSecond: +(deltas / secs).toFixed(2), bytesPerSecond: Math.round(bytes / secs),
  latencyMs: lat.length ? { avg: +(lat.reduce((a, b) => a + b, 0) / lat.length).toFixed(1), p95: lat.sort((a, b) => a - b)[Math.floor(lat.length * 0.95)], max: lat[lat.length - 1] } : null,
  errors }, null, 1));
process.exit(errors.length ? 1 : 0);
