// Scripted wire check (Node >= 22, global WebSocket and fetch).
// Opens one WebSocket per viewer (a seat or the spectator), validates every message's shape, rebuilds
// each viewer's state from snapshot + deltas, checks referential integrity and per-viewer visibility
// after every delta, and at the end of the game compares each rebuilt state with the server's /state.
// Usage: node ws-check.mjs --token <per-launch token> [--url ws://127.0.0.1:7655/ws] [--viewers spectator,0,1] [--min-deltas 20] [--timeout 1800]
// The token is in the URL the server prints: "[web] serving http://127.0.0.1:PORT/#token=<token>".
const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, all) =>
  v.startsWith('--') ? [...a, [v.slice(2), all[i + 1]]] : a, []));
const url = args.url ?? 'ws://127.0.0.1:7655/ws';
const viewers = (args.viewers ?? 'spectator').split(',').map((v) => v.trim()).filter(Boolean);
const minDeltas = Number(args['min-deltas'] ?? 20);
const timeoutS = Number(args.timeout ?? 1800);
const httpBase = url.replace(/^ws/, 'http').replace(/\/ws$/, '');
const token = encodeURIComponent(args.token ?? '');
const ALIAS_BASE = 2 ** 30;
const PLACEHOLDER = new Set(['Zone', 'Owner', 'Controller']);
const FACE_HIDING = ['AlternateState', 'LeftSplitState', 'RightSplitState', 'PaperCardBackup'];
// Containment references (zone lists, players, stack, states) must resolve; cross references such as
// Controller or EntityAttachedTo may point at objects network play itself never walks, and other card
// references name a hidden card by an unseen id that resolves to nothing.
const CONTAINMENT = new Set(['players', 'stack_items', 'card_state']);
const ZONE_LISTS = new Set(['Hand', 'Library', 'Graveyard', 'Battlefield', 'Exile', 'Flashback', 'Command', 'Sideboard',
  'Ante', 'SchemeDeck', 'PlanarDeck', 'AttractionDeck', 'Junkyard', 'ContraptionDeck', 'StickerSheets']);

const keyOf = (o) => o.state ? `${o.type}:${o.id}:${o.state}` : `${o.type}:${o.id}`;
const isObj = (o) => o && typeof o.type === 'string' && Number.isInteger(o.id) && typeof o.props === 'object'
  && (o.type !== 'cardState' || typeof o.state === 'string');
const sortKeys = (o) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));

class Stream {
  constructor(name) {
    this.name = name; // 'spectator' or a seat index
    this.query = name === 'spectator' ? `?token=${token}` : `?token=${token}&seat=${name}`;
    this.errors = [];
    this.schema = null; this.hidden = null; this.viewer = null; this.game = null; this.seq = 0;
    this.objects = new Map();
    this.lat = []; this.deltas = 0; this.bytes = 0; this.maxBytes = 0; this.snapshotBytes = 0;
    this.logLines = 0; this.finalSeen = false; this.placeholdersSeen = 0; this.faceDownHiddenSeen = 0;
    this.cardRefChecks = 0; this.danglingEngineRefs = 0;
  }
  fail(m) { if (this.errors.length < 50) this.errors.push(m); }

  refsOf(owner, name, v) {
    const kind = this.schema[name];
    if (v === null || v === undefined) return [];
    switch (kind) {
      case 'card': return [`card:${v}`];
      case 'player': return [`player:${v}`];
      case 'stack_item': return [`stackItem:${v}`];
      case 'cards': return v.filter((id) => id !== -1).map((id) => `card:${id}`);
      case 'players': return v.map((id) => `player:${id}`);
      case 'stack_items': return v.map((id) => `stackItem:${id}`);
      case 'entity': return v.type ? [`${v.type}:${v.id}`] : [];
      case 'card_state': return owner.type === 'card' ? [`cardState:${owner.id}:${v}`] : [];
      default: return [];
    }
  }

  // What this viewer may know, from the properties it was sent (same rules as CardView.canBeShownTo).
  mayLook(card) {
    const look = card.props.PlayerMayLook ?? [];
    if (this.viewer?.spectator) {
      const players = this.players();
      return players.length > 0 && players.every((p) => look.includes(p));
    }
    return look.includes(this.viewer?.player);
  }
  players() {
    const g = [...this.objects.values()].find((o) => o.type === 'game');
    return g?.props.Players ?? [];
  }

  checkIntegrity(where) {
    const statesOf = new Map();
    for (const o of this.objects.values()) {
      if (o.type === 'cardState') statesOf.set(o.id, [...(statesOf.get(o.id) ?? []), o.state]);
    }
    for (const o of this.objects.values()) {
      for (const [name, v] of Object.entries(o.props)) {
        if (!(name in this.schema)) this.fail(`${where}: unknown property ${name}`);
        const zoneList = o.type === 'player' && ZONE_LISTS.has(name);
        if (!zoneList && this.hidden !== 'FULL') this.checkCardRefs(o, name, v, statesOf, where);
        if (!CONTAINMENT.has(this.schema[name]) && !zoneList) continue;
        for (const r of this.refsOf(o, name, v)) if (!this.objects.has(r)) this.fail(`${where}: ${keyOf(o)}.${name} -> missing ${r}`);
      }
      if (o.type !== 'card' || this.hidden === 'FULL') continue;
      this.checkCard(o, statesOf.get(o.id) ?? [], where);
    }
  }

  // Outside zone lists, a card reference never names a placeholder (a hidden card is an unseen id),
  // and the reveal history never names an alias that resolves (face-down or placeholder).
  checkCardRefs(o, name, v, statesOf, where) {
    const kind = this.schema[name];
    let ids = [];
    if (kind === 'card' && Number.isInteger(v)) ids = [v];
    else if (kind === 'cards' && Array.isArray(v)) ids = v;
    else if (kind === 'entity' && v?.type === 'card') ids = [v.id];
    else if (kind === 'combat' && Array.isArray(v)) {
      for (const b of v) ids.push(...(b.attackers ?? []), ...(b.blockers ?? []), ...(b.defender?.type === 'card' ? [b.defender.id] : []));
    }
    for (const id of ids) {
      if (id === -1) continue;
      this.cardRefChecks++;
      const c = this.objects.get(`card:${id}`);
      if (!c) { if (id < ALIAS_BASE) this.danglingEngineRefs++; continue; }
      if (!statesOf.has(id) && Object.keys(c.props).every((k) => PLACEHOLDER.has(k))) this.fail(`${where}: ${keyOf(o)}.${name} names placeholder card:${id}`);
      if (name === 'RevealedCardsCollection' && id >= ALIAS_BASE) this.fail(`${where}: reveal history names alias card:${id}`);
    }
  }

  checkCard(o, states, where) {
    const p = o.props;
    const extra = Object.keys(p).filter((k) => !PLACEHOLDER.has(k));
    const isPlaceholder = extra.length === 0 && states.length === 0;
    if ('Remembered' in p) this.fail(`${where}: ${keyOf(o)} carries Remembered`);
    if (isPlaceholder) {
      this.placeholdersSeen++;
      if (o.id < ALIAS_BASE) this.fail(`${where}: placeholder ${keyOf(o)} uses an engine id`);
      return;
    }
    if (['Hand', 'Library'].includes(p.Zone)) {
      const own = !this.viewer?.spectator && p.Zone === 'Hand' && p.Controller === this.viewer?.player;
      if (!own && !this.mayLook(o)) this.fail(`${where}: ${p.Zone} card ${keyOf(o)} sent in full (${extra.join(',')})`);
    }
    if (p.Facedown) {
      const own = !this.viewer?.spectator && p.Controller === this.viewer?.player && ['Battlefield', 'Stack'].includes(p.Zone);
      const faceKnown = own || this.mayLook(o);
      const leaks = FACE_HIDING.filter((k) => k in p).concat(states.filter((s) => s !== 'FaceDown').map((s) => `state ${s}`));
      if (!faceKnown && leaks.length) this.fail(`${where}: face-down ${keyOf(o)} leaks ${leaks.join(',')}`);
      if (!faceKnown) {
        this.faceDownHiddenSeen++;
        if (o.id < ALIAS_BASE) this.fail(`${where}: face-down ${keyOf(o)} uses an engine id`);
      }
      return;
    }
    if (o.id >= ALIAS_BASE) this.fail(`${where}: full card under an alias ${keyOf(o)}`);
  }

  onMessage(text) {
    const n = Buffer.byteLength(text);
    const m = JSON.parse(text);
    if (m.t === 'hello') {
      if (typeof m.schema !== 'object' || m.v !== 2) this.fail('bad hello');
      this.schema = m.schema; this.hidden = m.hidden; return;
    }
    if (!this.schema) this.fail('message before hello');
    if (m.t === 'snapshot') {
      this.snapshotBytes = n; this.game = m.game; this.seq = m.seq; this.viewer = m.viewer; this.objects.clear();
      if (!Array.isArray(m.objects) || !Array.isArray(m.log) || typeof m.viewer !== 'object') this.fail('bad snapshot');
      if (this.name === 'spectator' ? !m.viewer.spectator : m.viewer.seat !== Number(this.name)) {
        if (m.game > 0) this.fail(`snapshot for viewer ${JSON.stringify(m.viewer)}, asked ${this.name}`);
      }
      for (const o of m.objects) { if (!isObj(o)) this.fail(`bad object ${JSON.stringify(o).slice(0, 80)}`); this.objects.set(keyOf(o), structuredClone(o)); }
      this.checkIntegrity(`snapshot seq=${this.seq}`);
      console.error(`[${this.name}] snapshot game=${this.game} seq=${this.seq} objects=${this.objects.size} bytes=${n}`);
      return;
    }
    if (m.t !== 'delta') { this.fail(`unknown message ${m.t}`); return; }
    if (m.game !== this.game) { this.fail(`delta for game ${m.game} while on ${this.game}`); return; }
    if (m.seq !== this.seq + 1) this.fail(`seq gap ${this.seq} -> ${m.seq}`);
    if (typeof m.ts === 'number') this.lat.push(Date.now() - m.ts);
    this.seq = m.seq; this.deltas++; this.bytes += n; this.maxBytes = Math.max(this.maxBytes, n);
    for (const f of ['new', 'changed', 'removed', 'log', 'events']) if (!Array.isArray(m[f])) this.fail(`delta ${this.seq} missing ${f}`);
    for (const o of m.new) { if (!isObj(o)) this.fail(`bad new ${JSON.stringify(o).slice(0, 80)}`); this.objects.set(keyOf(o), structuredClone(o)); }
    for (const c of m.changed) {
      const o = this.objects.get(keyOf(c));
      if (!o) { this.fail(`delta ${this.seq}: change for unknown ${keyOf(c)}`); continue; }
      for (const [k, v] of Object.entries(c.props)) { if (v === null) delete o.props[k]; else o.props[k] = v; }
    }
    for (const k of m.removed) if (!this.objects.delete(k)) this.fail(`delta ${this.seq}: removed unknown ${k}`);
    this.logLines += m.log.length;
    this.checkIntegrity(`delta seq=${this.seq}`);
    if (m.final) this.finalSeen = true;
  }

  async compareWithServer() {
    const s = await (await fetch(`${httpBase}/state${this.query}`)).json();
    if (s.seq !== this.seq || s.game !== this.game) { this.fail(`/state at game ${s.game} seq ${s.seq}, client at ${this.game}/${this.seq}`); return; }
    const server = new Map(s.objects.map((o) => [keyOf(o), o]));
    if (server.size !== this.objects.size) this.fail(`object count server=${server.size} client=${this.objects.size}`);
    for (const [k, o] of server) {
      const mine = this.objects.get(k);
      if (!mine) { this.fail(`client lacks ${k}`); continue; }
      if (JSON.stringify(sortKeys(mine.props)) !== JSON.stringify(sortKeys(o.props))) this.fail(`props differ for ${k}`);
    }
  }

  run() {
    const ws = new WebSocket(url + this.query);
    this.ws = ws;
    return new Promise((resolve) => {
      ws.onmessage = (ev) => { try { this.onMessage(ev.data); } catch (e) { this.fail(`exception ${e}`); } if (this.finalSeen) resolve('final'); };
      ws.onerror = (e) => { this.fail(`ws error ${e.message ?? e}`); resolve('error'); };
      ws.onclose = () => resolve('closed');
      setTimeout(() => resolve('timeout'), timeoutS * 1000);
    });
  }
}

const t0 = Date.now();
const streams = viewers.map((v) => new Stream(v));
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
