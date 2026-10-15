/**
 * Client copy of one viewer's stream: the wire objects (snapshot + deltas), the log, and the
 * human-seat input state carried by calls and prompts. `apply` returns 'resync' when the stream
 * broke (seq gap); the caller then asks for a snapshot and the session drops deltas until it comes.
 */
import type { HelloMessage, LogEntry as WireLogEntry, SnapshotMessage, WireObject } from '../wire/generated/wire';
import { hasDrift, schemaDrift, type SchemaDrift } from '../wire/schemaDrift';
import type { PromptMessage, ServerFrame, WireRef } from './protocol';

export const LOG_LIMIT = 400;

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
  ok: Button;
  cancel: Button;
  /** Cards the input accepts (setSelectables). */
  selectable?: { cards: number[]; min: number; max: number };
  /** Players and stack items the input accepts (setSelectableTargets). */
  targets: WireRef[];
  /** Chosen so far (setHighlighted). */
  highlighted: WireRef[];
}

export const NO_INPUT: InputState = {
  message: '',
  ok: { label: '', enabled: false },
  cancel: { label: '', enabled: false },
  targets: [],
  highlighted: [],
};

export type Viewer = SnapshotMessage['viewer'];

export const objectKey = (o: { type: string; id: number; state?: string }) =>
  o.type === 'cardState' ? `cardState:${o.id}:${o.state}` : `${o.type}:${o.id}`;

/** Card refs in calls: numbers are card ids; objects are typed refs. */
function toRefs(v: unknown, plain: WireRef['type']): WireRef[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((x): WireRef[] => {
    if (typeof x === 'number') return [{ type: plain, id: x }];
    if (x && typeof x === 'object' && 'type' in x && 'id' in x && typeof x.id === 'number') {
      const t = x.type;
      if (t === 'card' || t === 'player' || t === 'stackItem') return [{ type: t, id: x.id }];
    }
    return [];
  });
}

const sameRef = (a: WireRef, b: WireRef) => a.type === b.type && a.id === b.id;

export class LiveSession {
  objects = new Map<string, WireObject>();
  hello?: HelloMessage;
  drift?: SchemaDrift;
  viewer?: Viewer;
  game = -1;
  seq = -1;
  log: SessionLogEntry[] = [];
  input: InputState = NO_INPUT;
  prompt?: PromptMessage;
  /** Game over (final delta or finishGame). */
  finished = false;
  /** A gap was seen; deltas are dropped until the next snapshot. */
  awaitingSnapshot = false;
  /** Engine messages (message / showErrorDialog) not yet shown. */
  notices: string[] = [];
  /** Bumped on every change, so views can memoise. */
  version = 0;
  private logSeq = 0;

  get gameObject(): Extract<WireObject, { type: 'game' }> | undefined {
    for (const o of this.objects.values()) if (o.type === 'game') return o;
    return undefined;
  }

  get(type: 'card', id: number): Extract<WireObject, { type: 'card' }> | undefined;
  get(type: 'player', id: number): Extract<WireObject, { type: 'player' }> | undefined;
  get(type: 'stackItem', id: number): Extract<WireObject, { type: 'stackItem' }> | undefined;
  get(type: 'card' | 'player' | 'stackItem', id: number): WireObject | undefined {
    return this.objects.get(`${type}:${id}`);
  }

  cardState(id: number, state: string): Extract<WireObject, { type: 'cardState' }> | undefined {
    return this.objects.get(`cardState:${id}:${state}`) as Extract<WireObject, { type: 'cardState' }> | undefined;
  }

  apply(frame: ServerFrame): 'ok' | 'resync' {
    const r = this.applyInner(frame);
    this.version += 1;
    return r;
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
        this.awaitingSnapshot = false;
        if (newGame) {
          this.input = NO_INPUT;
          this.prompt = undefined;
          this.finished = false;
          this.log = [];
        }
        // The snapshot carries the log tail: replace ours (it may have missed entries).
        this.log = [];
        this.addLog(frame.log);
        return 'ok';
      }
      case 'delta': {
        if (this.awaitingSnapshot) return 'ok';
        if (frame.game !== this.game || frame.seq !== this.seq + 1) {
          this.awaitingSnapshot = true;
          return 'resync';
        }
        this.seq = frame.seq;
        for (const o of frame.new) this.objects.set(objectKey(o), structuredClone(o));
        for (const patch of frame.changed) {
          const cur = this.objects.get(objectKey(patch));
          if (!cur) continue; // a change to an object we never got: harmless, the next snapshot fixes it
          const merged: Record<string, unknown> = { ...cur.props, ...patch.props };
          const props = Object.fromEntries(Object.entries(merged).filter(([, v]) => v !== null));
          this.objects.set(objectKey(patch), { ...cur, props } as WireObject);
        }
        for (const key of frame.removed) this.objects.delete(key);
        this.addLog(frame.log);
        if (frame.final) this.finished = true;
        return 'ok';
      }
      case 'call':
        this.applyCall(frame.method, frame.args);
        return 'ok';
      case 'prompt':
        this.prompt = frame;
        return 'ok';
      case 'promptClosed':
        if (this.prompt?.id === frame.id) this.prompt = undefined;
        return 'ok';
      default:
        return 'ok';
    }
  }

  /** The reply left: stop showing the prompt (the server sends the next one if any). */
  answered(promptId: number) {
    if (this.prompt?.id === promptId) {
      this.prompt = undefined;
      this.version += 1;
    }
  }

  private applyCall(method: string, args: unknown[]) {
    const a = args;
    switch (method) {
      case 'showPromptMessage':
        this.input = {
          ...this.input,
          ownerId: typeof a[0] === 'number' ? a[0] : this.input.ownerId,
          message: typeof a[1] === 'string' ? a[1] : '',
          cardId: typeof a[2] === 'number' && a[2] >= 0 ? a[2] : undefined,
        };
        return;
      case 'updateButtons': {
        const ok = { label: String(a[1] ?? ''), enabled: a[3] === true };
        const cancel = { label: String(a[2] ?? ''), enabled: a[4] === true };
        // Both disabled does not end an input (mandatory targeting waits for a click); awaitNextInput does.
        this.input = { ...this.input, ownerId: typeof a[0] === 'number' ? a[0] : this.input.ownerId, ok, cancel };
        return;
      }
      case 'awaitNextInput':
        // The input ended; the next one re-sends its prompt, buttons and selectables.
        this.input = { ...NO_INPUT, ownerId: this.input.ownerId };
        return;
      case 'setSelectables':
        this.input = {
          ...this.input,
          selectable: {
            cards: toRefs(a[0], 'card').filter((r) => r.type === 'card').map((r) => r.id),
            min: typeof a[1] === 'number' ? a[1] : 0,
            max: typeof a[2] === 'number' ? a[2] : 1,
          },
        };
        return;
      case 'clearSelectables':
        this.input = { ...this.input, selectable: undefined, targets: [], highlighted: [] };
        return;
      case 'setSelectableTargets':
        this.input = { ...this.input, targets: toRefs(a[0], 'player') };
        return;
      case 'setHighlighted': {
        const refs = toRefs(a[0], 'card');
        const on = a[1] === true;
        const rest = this.input.highlighted.filter((h) => !refs.some((r) => sameRef(r, h)));
        this.input = { ...this.input, highlighted: on ? [...rest, ...refs] : rest };
        return;
      }
      case 'message':
      case 'showErrorDialog': {
        const text = [a[1], a[0]].filter((x) => typeof x === 'string' && x).join(': ');
        if (text) this.notices = [...this.notices, text];
        return;
      }
      case 'finishGame':
        this.finished = true;
        return;
      default:
        return;
    }
  }

  private addLog(entries: WireLogEntry[]) {
    const turn = this.gameObject?.props.Turn ?? 0;
    for (const e of entries) {
      this.logSeq += 1;
      this.log.push({ ...e, id: this.logSeq, turn });
    }
    if (this.log.length > LOG_LIMIT) this.log = this.log.slice(-LOG_LIMIT);
  }
}
