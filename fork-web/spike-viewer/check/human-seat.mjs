// Scripted human seat (Node >= 22). Plays one human seat of a running server (WebMain --human-seat K)
// through the WebSocket until the game ends: answers every prompt with a legal option (first choices;
// scry: first card to the bottom; combat damage: lethal in order, the rest to the last target), plays
// lands and spells it may play in its main phases (auto-paying mana with OK), attacks with everything,
// picks the first selectable cards an input asks for, otherwise presses OK (pass priority, keep, confirm)
// or Cancel. Validates the seat's stream like ws-check.mjs, and checks that prompts and calls never name
// a card the seat may not see (alias or unseen id only, labelled without its name) and that no prompt
// closes unanswered (timeout or disconnect).
// Usage: node human-seat.mjs --token <seat token> [--seat 0] [--url ws://127.0.0.1:7655/ws] [--timeout 3600]
// Prints a JSON report; exit 0 = the game reached its final delta with no error.
import { Stream, ALIAS_BASE } from './stream.mjs';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, all) =>
  v.startsWith('--') ? [...a, [v.slice(2), all[i + 1]]] : a, []));
const url = args.url ?? 'ws://127.0.0.1:7655/ws';
const HIDDEN_LABELS = new Set(['Hidden card', 'Face-down card']);
const PLACEHOLDER = new Set(['Zone', 'Owner', 'Controller']);

class HumanSeat extends Stream {
  constructor(seat, opts) {
    super(String(seat), opts);
    this.buttons = null; this.message = ''; this.selectables = null; this.targets = []; this.picked = new Set(); this.weakly = [];
    this.prompts = new Map(); this.epoch = 0; this.actedEpoch = -1; this.lastMessageAt = Date.now();
    this.tried = new Set(); this.attacked = new Set(); this.sameState = 0; this.lastState = '';
    this.stats = { prompts: {}, shapes: {}, calls: {}, actions: {}, closed: {}, replyRejected: 0, actionRejected: [], callCardRefs: 0, promptCardRefs: 0, hiddenPromptRefs: 0, revealedCopies: 0, danglingRefs: 0 };
    this.timer = null; this.gameEnded = false; this.lastLog = [];
  }

  bump(map, k) { map[k] = (map[k] ?? 0) + 1; }

  onMessage(text) {
    this.lastMessageAt = Date.now();
    super.onMessage(text);
    if (text.startsWith('{"t":"delta"') || text.startsWith('{"t":"snapshot"')) {
      for (const e of JSON.parse(text).log ?? []) { this.lastLog.push(e.msg); if (this.lastLog.length > 8) this.lastLog.shift(); }
    }
    this.schedule();
  }

  onSeatMessage(m) {
    switch (m.t) {
      case 'call': this.onCall(m); return true;
      case 'prompt': this.onPrompt(m); return true;
      case 'promptClosed':
        this.prompts.delete(m.id);
        this.bump(this.stats.closed, m.reason);
        if (m.reason !== 'answered') this.fail(`prompt ${m.id} closed ${m.reason}`);
        return true;
      case 'replyRejected': this.stats.replyRejected++; this.fail(`reply rejected: ${JSON.stringify(m)}`); return true;
      case 'actionRejected': if (this.stats.actionRejected.length < 20) this.stats.actionRejected.push(m); return true;
      case 'rejected': this.fail(`rejected: ${JSON.stringify(m)}`); return true;
      case 'activateDescription': return true;
      default: return false;
    }
  }

  // A card reference sent to this seat: a hidden card is never named by engine id, and its label never names it.
  // Exception: a copy the engine reveals while the card itself stays hidden (Player.revealFaceDownCards' LKI
  // copies when a player loses) keeps the hidden card's unseen id or alias, carries its name and is flagged
  // revealedCopy; it may only appear where nothing is picked (a reveal, max 0).
  checkRef(ref, label, where, choice, prompt) {
    if (!ref || ref.type !== 'card' || ref.id === -1) return;
    const c = this.objects.get(`card:${ref.id}`);
    const hasState = [...this.objects.keys()].some((k) => k.startsWith(`cardState:${ref.id}:`));
    const placeholder = c && !hasState && Object.keys(c.props).every((k) => PLACEHOLDER.has(k));
    if (choice?.revealedCopy) {
      this.stats.revealedCopies++;
      if (ref.id < ALIAS_BASE) this.fail(`${where}: revealed copy named by engine id ${ref.id}`);
      if (prompt?.shape !== 'choose' || prompt.max !== 0) this.fail(`${where}: revealed copy ${ref.id} in a prompt that picks`);
      return;
    }
    if (ref.id >= ALIAS_BASE) {
      this.stats.hiddenPromptRefs++;
      if (label !== undefined && !HIDDEN_LABELS.has(label)) this.fail(`${where}: hidden card ${ref.id} labelled "${label}"`);
      return;
    }
    if (!c) { this.stats.danglingRefs++; return; }
    if (placeholder) this.fail(`${where}: engine id ${ref.id} names a card this seat may not see`);
  }

  walkRefs(v, where) {
    if (Array.isArray(v)) { v.forEach((x) => this.walkRefs(x, where)); return; }
    if (v && typeof v === 'object') {
      if (v.type === 'card' && Number.isInteger(v.id)) { this.stats.callCardRefs++; this.checkRef(v, undefined, where); }
      Object.values(v).forEach((x) => this.walkRefs(x, where));
    }
  }

  onCall(m) {
    this.bump(this.stats.calls, m.method);
    this.walkRefs(m.args, `call ${m.method}`);
    const a = m.args ?? [];
    switch (m.method) {
      case 'updateButtons':
        this.buttons = { label1: a[1], label2: a[2], ok: a[3], cancel: a[4] }; this.epoch++; break;
      case 'showPromptMessage': this.message = a[1] ?? ''; this.epoch++; break;
      case 'setSelection': {
        // each pick re-sends the input's selection; its end (InputSyncronizedBase.stop) sends one offering nothing
        const sel = a[0] ?? {};
        this.selectables = sel.max > 0
          ? { cards: (sel.cards ?? []).filter((r) => r?.type === 'card').map((r) => r.id), min: sel.min, max: sel.max }
          : null;
        this.targets = (sel.targets ?? []).filter((r) => r?.type === 'player').map((r) => r.id);
        if (!this.selectables && !this.targets.length) this.picked = new Set();
        this.epoch++; break;
      }
      case 'setWeaklySelectable': this.weakly = (a[0] ?? []).filter((r) => r?.type === 'card').map((r) => r.id); break;
      case 'clearWeaklySelectable': this.weakly = []; break;
      case 'finishGame': case 'afterGameEnd': this.gameEnded = true; break;
      default:
    }
  }

  onPrompt(m) {
    this.prompts.set(m.id, m);
    this.bump(this.stats.prompts, m.method);
    this.bump(this.stats.shapes, m.shape);
    for (const c of m.choices ?? []) { if (c.ref?.type === 'card') this.stats.promptCardRefs++; this.checkRef(c.ref, c.label, `prompt ${m.method}`, c, m); }
    for (const c of m.reveal?.cards ?? []) this.checkRef(c.ref, c.label, `prompt ${m.method} reveal`, c, { shape: 'choose', max: 0 });
    if (m.card) this.walkRefs(m.card, `prompt ${m.method} card`);
    this.send({ t: 'reply', id: m.id, value: this.answer(m) });
  }

  // The first legal option of each prompt shape.
  answer(m) {
    const n = (m.choices ?? []).length;
    switch (m.shape) {
      case 'choose': {
        const enabled = m.choices.filter((c) => !c.disabled).map((c) => c.i);
        const count = m.min > 0 ? m.min : (m.max > 0 && enabled.length ? 1 : 0);
        return enabled.slice(0, count);
      }
      case 'confirm': return m.default;
      case 'order':
        if (m.method === 'manipulateCardList') {
          // scry: the first movable card to the bottom, behind the cards that may not move
          const order = [...Array(n).keys()];
          const first = m.choices.findIndex((c) => c.movable);
          if (m.toBottom && first >= 0 && m.choices.some((c) => !c.movable)) { order.splice(first, 1); order.push(first); }
          return order;
        }
        if (m.method === 'sideboard') return m.choices.filter((c) => c.inDest).map((c) => c.i);
        return { order: [...Array(n - m.remainingMin).keys()], remember: false };
      case 'distribute': {
        const out = new Array(n).fill(0);
        let left = m.amount;
        if (m.choices.every((c) => Number.isInteger(c.lethal))) {
          // combat: lethal damage to each target in order, the rest to the last (the defender when it is one)
          for (let i = 0; i < n && left > 0; i++) { out[i] = Math.min(m.choices[i].lethal, left); left -= out[i]; }
          if (n) out[n - 1] += left;
          return out;
        }
        if (m.atLeastOne) for (let i = 0; i < n && left > 0; i++) { out[i] = 1; left--; }
        for (let i = 0; i < n && left > 0; i++) { const add = Math.min((m.choices[i].max ?? m.amount) - out[i], left); out[i] += add; left -= add; }
        return out;
      }
      case 'text':
        if (m.options?.length) return m.options[0];
        if (m.numeric) return /^-?\d+$/.test(m.initial ?? '') ? m.initial : '0';
        return m.initial ?? '';
      default:
        this.fail(`unknown prompt shape ${m.shape}`);
        return null;
    }
  }

  send(msg) {
    if (this.ws?.readyState === 1) this.ws.send(JSON.stringify(msg));
  }

  act(method, extra = {}) {
    this.bump(this.stats.actions, method);
    this.actedEpoch = this.epoch;
    this.send({ t: 'action', method, ...extra });
  }

  schedule() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.decide(false), 15);
  }

  gameObj() { return [...this.objects.values()].find((o) => o.type === 'game'); }

  decide(force) {
    if (this.finalSeen || this.prompts.size || !this.buttons) return;
    if (this.actedEpoch === this.epoch && !force) return;
    const state = `${this.epoch}|${this.message}|${this.buttons.label1}|${this.buttons.label2}|${this.buttons.ok}|${this.buttons.cancel}`;
    this.sameState = state === this.lastState ? this.sameState + 1 : 0;
    this.lastState = state;
    // ~200 s without any message and nothing to do: report it and stop instead of waiting forever
    if (this.sameState > 200) { this.fail(`input stuck: ${state}`); this.ws.close(); return; }
    const me = this.viewer?.player;
    const g = this.gameObj()?.props ?? {};
    const mine = this.objects.get(`player:${me}`)?.props ?? {};
    const myTurn = g.PlayerTurn === me;
    const stackEmpty = (g.Stack ?? []).length === 0;
    if (this.sameState > 20 && this.buttons.cancel) { this.act('selectButtonCancel'); return; }
    // play what may be played from hand or the command zone, once per card and turn
    if (myTurn && ['MAIN1', 'MAIN2'].includes(g.Phase) && stackEmpty && this.buttons.ok && !this.selectables) {
      // every own card once per turn (playable-card hints are off by default: UI_SHOW_ACTIONABLE_HIGHLIGHTS)
      const own = [...(mine.Hand ?? []), ...(mine.Command ?? [])].filter((id) => id < ALIAS_BASE);
      const next = own.find((id) => !this.tried.has(`${g.Turn}:${id}`));
      if (next !== undefined) { this.tried.add(`${g.Turn}:${next}`); this.act('selectCard', { card: next }); return; }
    }
    if (myTurn && g.Phase === 'COMBAT_DECLARE_ATTACKERS' && !this.attacked.has(g.Turn) && this.buttons.ok) {
      this.attacked.add(g.Turn); this.act('alphaStrike'); this.actedEpoch = -1; return;
    }
    const sel = this.selectables;
    if (sel && sel.cards.length) {
      const next = sel.cards.find((id) => !this.picked.has(id));
      if (next !== undefined && this.picked.size < sel.max && (!this.buttons.ok || this.picked.size < sel.min)) {
        this.picked.add(next); this.act('selectCard', { card: next }); return;
      }
    }
    // players the input names (setSelection targets): opponents first, once each per input
    if (this.targets.length && !this.buttons.ok) {
      const order = [...this.targets.filter((id) => id !== me), ...this.targets.filter((id) => id === me)];
      const next = order.find((id) => !this.picked.has(`p${id}`));
      if (next !== undefined) { this.picked.add(`p${next}`); this.act('selectPlayer', { player: next }); return; }
    }
    if (this.buttons.ok) this.act('selectButtonOk');
    else if (this.buttons.cancel) this.act('selectButtonCancel');
  }

  async play() {
    const watchdog = setInterval(() => { if (Date.now() - this.lastMessageAt > 3000) this.decide(true); }, 1000);
    const end = await this.run();
    clearInterval(watchdog);
    if (end === 'final') await this.compareWithServer(); // before a server started with --exit stops
    await new Promise((r) => setTimeout(r, 500)); // trailing calls (finishGame) and closes
    return end;
  }
}

const seat = new HumanSeat(Number(args.seat ?? 0), { url, token: args.token, timeoutS: Number(args.timeout ?? 3600) });
const t0 = Date.now();
const end = await seat.play();
seat.ws.close();
if (end !== 'final') seat.fail(`ended by ${end} before the final delta`);
if (seat.prompts.size) seat.fail(`${seat.prompts.size} prompt(s) still open at the end`);
const g = seat.gameObj()?.props ?? {};
const players = (g.Players ?? []).map((id) => seat.objects.get(`player:${id}`)?.props ?? {});
console.log(JSON.stringify({
  seconds: (Date.now() - t0) / 1000, end, viewer: seat.viewer, deltas: seat.deltas, turn: g.Turn,
  players: players.map((p) => ({ name: p.Name, life: p.Life ?? 0, lost: !!p.HasLost })),
  stats: seat.stats, placeholderChecks: seat.placeholdersSeen, cardRefChecks: seat.cardRefChecks,
  lastLog: seat.lastLog, errors: seat.errors,
}, null, 1));
process.exit(seat.errors.length ? 1 : 0);
