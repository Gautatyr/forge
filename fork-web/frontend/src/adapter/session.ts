/**
 * Client copy of one viewer's stream: the wire objects (snapshot + deltas), the log, and the
 * human-seat input state carried by calls and prompts (docs/fork/architecture/web-ui.md, "Bridge:
 * human seat"). `apply` returns 'resync' when the stream broke (seq gap); the caller then asks for a
 * snapshot and the session drops deltas until it comes.
 */
import type { AttackOptionsMessage, BlockOptionsMessage, HelloMessage, InputInfo, LogEntry as WireLogEntry, SnapshotMessage, WireObject } from '../wire/generated/wire';
import { hasDrift, schemaDrift, type SchemaDrift } from '../wire/schemaDrift';
import { engineNotice } from './engineText';
import { asRef, type PromptMessage, type SeatRef, type ServerFrame } from './protocol';
import { t } from '../i18n';

export const LOG_LIMIT = 400;

/** The bridge's reason for a message type it does not know. */
const UNKNOWN_MESSAGE = 'unknown message type';

export interface SessionLogEntry extends WireLogEntry {
  id: number;
  /** GameView.Turn when the entry arrived. */
  turn: number;
}

export interface Button {
  label: string;
  enabled: boolean;
}

/** What Forge's current Input shows this seat (showPromptMessage, updateButtons, selectables). */
export interface InputState {
  /** Player the buttons belong to; undefined = no input shown. */
  ownerId?: number;
  message: string;
  cardId?: number;
  /** The input names a card (cardId, or -1 for one this view can't resolve, e.g. a spell being cast). */
  namesCard: boolean;
  ok: Button;
  cancel: Button;
  /** Cards the input accepts, and how many (setSelection; absent when it picks none: max 0). */
  selectable?: { cards: number[]; min: number; max: number };
  /** Players and stack items the input accepts (setSelection targets). */
  targets: SeatRef[];
  /** Chosen so far (setSelection chosen). */
  highlighted: SeatRef[];
  /** What a selection input asks, sent with its message (issue #81): targets or a pick. */
  info?: InputInfo;
  /**
   * InputLondonMulligan: the cards it asks for, counted at its first message (left + chosen). Later
   * messages can't tell: its end (done: resetCardHighlights, then stop) reads "Return 0", nothing chosen.
   */
  london?: number;
}

/** InputLondonMulligan's message: "Return N card(s) to the bottom of your library" (N left to choose). */
export function londonLeft(message: string): number | undefined {
  const m = /^Return (\d+) card\(s\) to the bottom/.exec(message.trim());
  return m ? Number(m[1]) : undefined;
}

export const NO_INPUT: InputState = {
  message: '',
  namesCard: false,
  ok: { label: '', enabled: false },
  cancel: { label: '', enabled: false },
  targets: [],
  highlighted: [],
};

export interface Notice {
  id: number;
  text: string;
}

export type Viewer = SnapshotMessage['viewer'];

export const objectKey = (o: { type: string; id: number; state?: string }) =>
  o.type === 'cardState' ? `cardState:${o.id}:${o.state}` : `${o.type}:${o.id}`;

/** Refs in call args: `{type,id}` objects; a bare number is read as `plain`. */
function toRefs(v: unknown, plain: SeatRef['type']): SeatRef[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((x): SeatRef[] => {
    if (typeof x === 'number') return [{ type: plain, id: x }];
    const r = asRef(x);
    return r ? [r] : [];
  });
}

/** A player or card argument: a ref, or a bare id. */
function refId(v: unknown): number | undefined {
  if (typeof v === 'number') return v;
  return asRef(v)?.id;
}

/** "Turn 6 (AI 2 (Deck))" → 6. */
function turnOf(e: WireLogEntry): number | undefined {
  const m = e.type === 'TURN' ? /^Turn (\d+)/.exec(e.msg) : null;
  return m ? Number(m[1]) : undefined;
}

export class LiveSession {
  objects = new Map<string, WireObject>();
  hello?: HelloMessage;
  drift?: SchemaDrift;
  viewer?: Viewer;
  game = -1;
  seq = -1;
  log: SessionLogEntry[] = [];
  /** The bridge's round count (snapshot, then the deltas that change it); undefined before turn 1. */
  round?: number;
  input: InputState = NO_INPUT;
  /** Open prompts, oldest first. */
  prompts: PromptMessage[] = [];
  /** Prompts whose reply left; hidden unless the server rejects the reply. */
  answering = new Set<number>();
  /**
   * setWeaklySelectable: card id → strength. With the bridge's actionable highlights on, the cards
   * you may play now (priority), the mana sources (paying; 2 = in the auto-pay plan), attack candidates.
   */
  weakly = new Map<number, number>();
  /** blockOptions: while you declare blockers, the blocks the engine allows now (issue #48). */
  blockOptions?: BlockOptionsMessage['attackers'];
  /** attackOptions: while you declare attackers, what the engine lets you attack (issue #65). */
  attackOptions?: AttackOptionsMessage['defenders'];
  /** attackOptions.max: the most creatures that may attack together (Silent Arbiter). */
  attackMax?: number;
  /** showRevealedCards: cards the engine shows you until the input ends (e.g. an opponent's hand). */
  revealed: number[] = [];
  /** Last card this client clicked (selectCard): names the spell being paid for when the engine's ref is unknown. */
  lastCard?: number;
  /** That card's zone when clicked: a commander cast from the command zone pays its tax (issue #67). */
  lastCardFrom?: string;
  /** That card's objects while it is in no zone (cast, being paid for). */
  limbo = new Map<string, WireObject>();
  /**
   * The spell being cast as the engine's targeting message names it ("Lightning Bolt (27) - …") when its ref is
   * unknown (-1): names it when no click did, e.g. after a page reload (issue #62). Kept until you have priority again.
   */
  castNamed?: { id: number; name: string };
  /** This client conceded the game (the view has no loss reason). */
  conceded = false;
  /** Game over (final delta or finishGame). */
  finished = false;
  /** The payment being made: its full cost, as the first "Pay Mana Cost" message of the input showed it. */
  payment?: { cardId?: number; cost: string; seq: number; /** What activated ability it pays for ("Equip {2}"). */ ability?: string };
  private paymentSeq = 0;
  /** The X you just announced for a card ("Choose X for <card>"): the next payment for that card shows it. */
  announcedX?: { card: string; value: number };
  /** A number past a list's "Other…" entry: typed into the engine's follow-up prompt for you (commands.ts autoAnswer). */
  pendingNumber?: { value: number; after: number };
  /** Player → turn when they were first seen out, and the order they went out in. */
  lostAt = new Map<number, number>();
  lostOrder = new Map<number, number>();
  /** Player → life before turn 1 (the format's starting life). */
  startingLife = new Map<number, number>();
  /** A gap was seen; deltas are dropped until the next snapshot. */
  awaitingSnapshot = false;
  /** Engine messages and rejections, newest last. */
  notices: Notice[] = [];
  /** Bumped on every change, so views can memoise. */
  version = 0;
  private logSeq = 0;
  /** Turn of the newest log entry. */
  private logTurn?: number;
  private noticeSeq = 0;

  get gameObject(): Extract<WireObject, { type: 'game' }> | undefined {
    for (const o of this.objects.values()) if (o.type === 'game') return o;
    return undefined;
  }

  /** The prompt to show: the oldest open one not being answered. */
  get prompt(): PromptMessage | undefined {
    return this.prompts.find((p) => !this.answering.has(p.id));
  }

  get(type: 'card', id: number): Extract<WireObject, { type: 'card' }> | undefined;
  get(type: 'player', id: number): Extract<WireObject, { type: 'player' }> | undefined;
  get(type: 'stackItem', id: number): Extract<WireObject, { type: 'stackItem' }> | undefined;
  get(type: 'card' | 'player' | 'stackItem', id: number): WireObject | undefined {
    return this.objects.get(`${type}:${id}`);
  }

  cardState(id: number, state: string): Extract<WireObject, { type: 'cardState' }> | undefined {
    const key = `cardState:${id}:${state}`;
    return (this.objects.get(key) ?? this.limbo.get(key)) as Extract<WireObject, { type: 'cardState' }> | undefined;
  }

  /** This client sent selectCard: remember the card it casts or activates (a click with priority, not a target or a mana source). */
  clicked(card: number) {
    if (!/^Priority:/.test(this.input.message)) return;
    // A repeat click keeps the limbo and the cast name, but the card may have changed zone since (issue #75).
    const zone = this.get('card', card)?.props.Zone;
    if (card === this.lastCard) {
      if (zone !== undefined) this.lastCardFrom = zone;
      return;
    }
    this.lastCard = card;
    this.lastCardFrom = zone;
    this.limbo = new Map();
    this.castNamed = undefined;
  }

  /** A card the client clicked that is in no zone now (a spell being cast). */
  limboCard(id: number): Extract<WireObject, { type: 'card' }> | undefined {
    return this.limbo.get(`card:${id}`) as Extract<WireObject, { type: 'card' }> | undefined;
  }

  apply(frame: ServerFrame): 'ok' | 'resync' {
    const r = this.applyInner(frame);
    this.version += 1;
    return r;
  }

  /** Shown once in the prompt line (engine messages, rejections, link problems). */
  notice(text: string) {
    this.noticeSeq += 1;
    this.notices = [...this.notices.slice(-19), { id: this.noticeSeq, text }];
    this.version += 1;
  }

  private applyInner(frame: ServerFrame): 'ok' | 'resync' {
    switch (frame.t) {
      case 'hello':
        this.hello = frame;
        this.drift = schemaDrift(frame.schema);
        if (hasDrift(this.drift)) console.warn('[live] wire schema differs from this build', this.drift);
        return 'ok';
      case 'snapshot': {
        const newGame = frame.game !== this.game;
        this.objects = new Map(frame.objects.map((o) => [objectKey(o), structuredClone(o)]));
        this.viewer = frame.viewer;
        this.game = frame.game;
        this.seq = frame.seq;
        this.round = frame.round;
        this.awaitingSnapshot = false;
        // Every snapshot (connect, reconnect, resync) is followed by the seat's greeting, which re-sends the
        // current input and the prompts still open: drop ours, or a prompt closed meanwhile stays forever.
        this.input = NO_INPUT;
        this.prompts = [];
        this.answering.clear();
        this.revealed = [];
        this.weakly = new Map();
        this.blockOptions = undefined;
        this.attackOptions = undefined;
        this.attackMax = undefined;
        if (newGame) {
          this.lastCard = undefined;
          this.lastCardFrom = undefined;
          this.limbo = new Map();
          this.castNamed = undefined;
          this.conceded = false;
          this.finished = false;
          this.payment = undefined;
          this.lostAt = new Map();
          this.lostOrder = new Map();
          this.startingLife = new Map();
        }
        this.trackPlayers();
        // The snapshot carries the log tail: replace ours (it may have missed entries).
        this.log = [];
        this.logTurn = undefined;
        this.addLog(frame.log, true);
        return 'ok';
      }
      case 'delta': {
        if (this.awaitingSnapshot) return 'ok';
        if (frame.game !== this.game || frame.seq !== this.seq + 1) {
          this.awaitingSnapshot = true;
          return 'resync';
        }
        this.seq = frame.seq;
        if (frame.round !== undefined) this.round = frame.round;
        for (const o of frame.new) this.objects.set(objectKey(o), structuredClone(o));
        for (const patch of frame.changed) {
          const cur = this.objects.get(objectKey(patch));
          if (!cur) continue; // a change to an object we never got: harmless, the next snapshot fixes it
          const merged: Record<string, unknown> = { ...cur.props, ...patch.props };
          const props = Object.fromEntries(Object.entries(merged).filter(([, v]) => v !== null));
          this.objects.set(objectKey(patch), { ...cur, props } as WireObject);
        }
        for (const key of frame.removed) {
          // A spell being cast leaves every zone until it is paid for: keep the clicked card to name it meanwhile.
          const o = this.objects.get(key);
          if (o && o.id === this.lastCard && (o.type === 'card' || o.type === 'cardState')) this.limbo.set(key, o);
          this.objects.delete(key);
        }
        for (const key of this.limbo.keys()) if (this.objects.has(key)) this.limbo.delete(key);
        this.trackPlayers();
        this.addLog(frame.log);
        if (frame.final) this.finished = true;
        return 'ok';
      }
      case 'call':
        this.applyCall(frame.method, frame.args, frame.input);
        return 'ok';
      case 'prompt':
        // A reconnect greeting re-sends open prompts: replace, never duplicate.
        this.prompts = [...this.prompts.filter((p) => p.id !== frame.id), frame];
        return 'ok';
      case 'promptClosed':
        this.prompts = this.prompts.filter((p) => p.id !== frame.id);
        this.answering.delete(frame.id);
        return 'ok';
      case 'replyRejected':
        if (frame.id !== undefined) this.answering.delete(frame.id);
        this.notice(t('session.answerRefused', { reason: frame.reason }));
        return 'ok';
      case 'actionRejected':
        this.notice(t('session.actionRefused', { method: frame.method ?? t('session.action'), reason: frame.reason }));
        return 'ok';
      case 'blockOptions':
        this.blockOptions = frame.attackers;
        return 'ok';
      case 'attackOptions':
        this.attackOptions = frame.defenders;
        this.attackMax = frame.max;
        return 'ok';
      case 'rejected':
        // A bridge without per-seat language (setLanguage) answers it "unknown message type": nothing to tell the player.
        if (frame.reason !== UNKNOWN_MESSAGE) this.notice(frame.reason);
        return 'ok';
      default:
        return 'ok';
    }
  }

  /** The reply left: stop showing the prompt (it comes back if the server rejects the reply). */
  answered(promptId: number) {
    if (this.prompts.some((p) => p.id === promptId)) {
      this.answering.add(promptId);
      this.version += 1;
    }
  }

  private applyCall(method: string, args: unknown[], info?: InputInfo) {
    const a = args;
    switch (method) {
      case 'showPromptMessage': {
        const card = refId(a[2]);
        const pay = typeof a[1] === 'string' ? /Pay Mana Cost:\s*(\S+)/.exec(a[1]) : null;
        if (!pay) {
          // The payment is over (the spell is on the stack, or it was cancelled): its X is spent.
          if (this.payment) this.announcedX = undefined;
          this.payment = undefined;
        } else if (!this.payment || this.payment.cardId !== card) this.payment = { cardId: card, cost: pay[1]!, seq: ++this.paymentSeq };
        // What the payment is for (InputInfo kind 'pay'): sent with each of its messages.
        if (pay && info?.kind === 'pay' && info.payFor) this.payment = { ...this.payment!, ability: info.payFor };
        const message = typeof a[1] === 'string' ? a[1] : '';
        // InputSelectTargets: "<host card> - …", the card printed "Name (id)"
        const spell = /^(.+?) \((\d+)\) - /.exec(message.split('\n')[0] ?? '');
        if (/^Priority:/.test(message)) this.castNamed = undefined;
        else if (card === -1 && spell) this.castNamed = { id: Number(spell[2]), name: spell[1]! };
        const left = londonLeft(message);
        const chosen = this.input.highlighted.filter((h) => h.type === 'card').length;
        this.input = {
          ...this.input,
          ownerId: refId(a[0]) ?? this.input.ownerId,
          message,
          cardId: card !== undefined && card >= 0 ? card : undefined,
          namesCard: card !== undefined,
          london: left === undefined ? undefined : (this.input.london ?? left + chosen),
          info,
        };
        return;
      }
      case 'updateButtons': {
        const ok = { label: String(a[1] ?? ''), enabled: a[3] === true };
        const cancel = { label: String(a[2] ?? ''), enabled: a[4] === true };
        // Both disabled does not end an input (mandatory targeting waits for a click); awaitNextInput does.
        this.input = { ...this.input, ownerId: refId(a[0]) ?? this.input.ownerId, ok, cancel };
        return;
      }
      case 'awaitNextInput':
        // The input ended; the next one re-sends its prompt and buttons. Its selection comes only when it differs from the
        // last one (ProtocolGuiGame.setSelection), so the last one stays.
        this.input = {
          ...NO_INPUT,
          ownerId: this.input.ownerId,
          selectable: this.input.selectable,
          targets: this.input.targets,
          highlighted: this.input.highlighted,
        };
        this.blockOptions = undefined;
        this.attackOptions = undefined;
        this.attackMax = undefined;
        return;
      case 'setSelection': {
        // Replaces every mark: cards to pick (none to pick when max is 0), players and stack items, chosen so far.
        const sel = (a[0] ?? {}) as { cards?: unknown; min?: unknown; max?: unknown; targets?: unknown; chosen?: unknown };
        const max = typeof sel.max === 'number' ? sel.max : 0;
        this.input = {
          ...this.input,
          selectable:
            max > 0
              ? {
                  cards: toRefs(sel.cards, 'card').filter((r) => r.type === 'card').map((r) => r.id),
                  min: typeof sel.min === 'number' ? sel.min : 0,
                  max,
                }
              : undefined,
          targets: toRefs(sel.targets, 'player'),
          highlighted: toRefs(sel.chosen, 'card'),
        };
        return;
      }
      case 'setWeaklySelectable': {
        const m = new Map<number, number>();
        for (const r of toRefs(a[0], 'card')) if (r.type === 'card') m.set(r.id, (m.get(r.id) ?? 0) + 1);
        this.weakly = m;
        return;
      }
      case 'clearWeaklySelectable':
        // Also InputBlock.onStop and InputAttack.onStop: their options end with them.
        this.weakly = new Map();
        this.blockOptions = undefined;
        this.attackOptions = undefined;
        this.attackMax = undefined;
        return;
      case 'showRevealedCards':
        this.revealed = toRefs(a[0], 'card').flatMap((r) => (r.type === 'card' ? [r.id] : []));
        return;
      case 'hideRevealedCards':
        this.revealed = [];
        return;
      case 'message':
      case 'showErrorDialog': {
        // message(text, title): the engine's default title "Forge" is no title.
        const text = engineNotice(typeof a[0] === 'string' ? a[0] : '', typeof a[1] === 'string' ? a[1] : undefined);
        if (text) this.notice(text);
        return;
      }
      case 'finishGame':
        this.finished = true;
        return;
      default:
        return;
    }
  }

  /** Starting life before turn 1; when each player went out. */
  private trackPlayers() {
    const g = this.gameObject?.props;
    for (const pid of g?.Players ?? []) {
      const p = this.get('player', pid)?.props;
      if (!p) continue;
      if (!g?.Turn && p.Life !== undefined && !this.startingLife.has(pid)) this.startingLife.set(pid, p.Life);
      if (p.HasLost && !this.lostAt.has(pid)) {
        this.lostAt.set(pid, g?.Turn ?? 0);
        this.lostOrder.set(pid, this.lostOrder.size + 1);
      }
    }
  }

  /**
   * An entry belongs to the turn of the last "Turn N (…)" line before it. In a snapshot's tail, entries
   * before its first such line belong to the turn before; with no such line, to the current turn.
   */
  private addLog(entries: WireLogEntry[], tail = false) {
    if (this.logTurn === undefined) {
      const first = tail ? entries.map(turnOf).find((n) => n !== undefined) : undefined;
      this.logTurn = first !== undefined ? Math.max(0, first - 1) : (this.gameObject?.props.Turn ?? 0);
    }
    for (const e of entries) {
      this.logTurn = turnOf(e) ?? this.logTurn;
      this.logSeq += 1;
      this.log.push({ ...e, id: this.logSeq, turn: this.logTurn });
    }
    if (this.log.length > LOG_LIMIT) this.log = this.log.slice(-LOG_LIMIT);
  }
}
