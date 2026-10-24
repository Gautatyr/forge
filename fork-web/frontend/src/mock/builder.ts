import { isCreature } from '../model/selectors';
import type { CardView, Counter, LogEntry, PlayerId, PlayerView, StepId, Zone } from '../model/types';
import { lookup, type CardKey } from './cardDb';
import { priorityDecision, recompute, refreshOtherZoneCasts, type MockGame } from './engine';

export interface CardOpts {
  tapped?: boolean;
  sick?: boolean;
  counters?: Counter[];
  damage?: number;
  commander?: boolean;
  attachTo?: string;
  token?: boolean;
  transformed?: boolean;
  controller?: PlayerId;
}

/** Small helper to assemble a mock game with readable scenario code. */
export class GameBuilder {
  readonly g: MockGame;
  private n = 0;

  constructor(id: string, format: MockGame['format']) {
    this.g = {
      id,
      format,
      youId: 'you',
      players: [],
      cards: {},
      stack: [],
      turn: { number: 1, activePlayerId: 'you', step: 'main1', priorityPlayerId: 'you' },
      decision: { kind: 'priority', playable: [] },
      autoPass: false,
      autoPay: false,
      autoYield: false,
      autoYieldTo: [],
      passingUntilYourTurn: false,
      log: [],
      eotEffects: {},
      seq: 1000,
    };
  }

  player(id: PlayerId, name: string, life: number, opts: Partial<PlayerView> = {}): this {
    this.g.players.push({
      id,
      name,
      seat: this.g.players.length,
      isYou: id === 'you',
      isAi: id !== 'you',
      life,
      startingLife: this.g.format === 'commander' ? 40 : 20,
      poison: 0,
      counters: [],
      handCount: 0,
      libraryCount: 60,
      library: [],
      hand: [],
      battlefield: [],
      graveyard: [],
      exile: [],
      command: [],
      commanders: [],
      commanderCasts: {},
      commanderDamageTaken: [],
      landsPlayedThisTurn: 0,
      hasLost: false,
      ...opts,
    });
    return this;
  }

  card(key: CardKey, ownerId: PlayerId, zone: Zone, o: CardOpts = {}): string {
    this.n += 1;
    const { front, back } = lookup(key);
    const id = `${ownerId}-${front.name.toLowerCase().replace(/[^a-z]+/g, '-')}-${this.n}`;
    const c: CardView = {
      id,
      name: o.transformed && back ? back.name : front.name,
      front,
      back,
      transformed: o.transformed,
      ownerId,
      controllerId: o.controller ?? ownerId,
      zone,
      isToken: o.token ?? false,
      isCommander: o.commander ?? false,
      tapped: o.tapped ?? false,
      summoningSick: o.sick ?? false,
      counters: o.counters ?? [],
      damage: o.damage ?? 0,
      ptModifiers: [],
      keywords: [],
      attachments: [],
    };
    this.g.cards[id] = c;
    const p = this.p(c.controllerId);
    const owner = this.p(ownerId);
    switch (zone) {
      case 'hand':
        owner.hand.push(id);
        owner.handCount = owner.hand.length;
        break;
      case 'battlefield':
        p.battlefield.push(id);
        break;
      case 'graveyard':
        owner.graveyard.push(id);
        break;
      case 'exile':
        owner.exile.push(id);
        break;
      case 'command':
        owner.command.push(id);
        break;
      default:
        break;
    }
    if (o.commander) owner.commanders.push(id);
    if (o.attachTo) {
      c.attachedTo = o.attachTo;
      this.g.cards[o.attachTo]!.attachments.push(id);
    }
    return id;
  }

  /** Several copies, e.g. lands or tokens. Returns their ids. */
  many(count: number, key: CardKey, ownerId: PlayerId, zone: Zone, o: CardOpts = {}): string[] {
    return Array.from({ length: count }, () => this.card(key, ownerId, zone, o));
  }

  p(id: PlayerId): PlayerView {
    const p = this.g.players.find((x) => x.id === id);
    if (!p) throw new Error(`no player ${id}`);
    return p;
  }

  turn(number: number, activePlayerId: PlayerId, step: StepId, priorityPlayerId?: PlayerId): this {
    this.g.turn = { number, activePlayerId, step, priorityPlayerId };
    return this;
  }

  /** `youLost`: the event cost you life or a permanent (bold in Recent). */
  log(text: string, playerId?: PlayerId, turn?: number, youLost?: LogEntry['youLost']): this {
    this.g.seq += 1;
    this.g.log.push({ id: `l${this.g.seq}`, turn: turn ?? this.g.turn.number, playerId, text, ...(youLost ? { youLost } : {}) });
    return this;
  }

  /** Finish: recompute P/T and, when you hold priority, what is playable. */
  done(): MockGame {
    for (const c of Object.values(this.g.cards)) {
      if (!isCreature(c)) c.summoningSick = false;
    }
    recompute(this.g);
    refreshOtherZoneCasts(this.g);
    // Whose turn each entry was: players take turns in seat order, so count back from the current turn.
    const n = this.g.players.length;
    const active = this.g.players.findIndex((p) => p.id === this.g.turn.activePlayerId);
    for (const e of this.g.log) {
      if (e.turnPlayerId || n === 0 || active < 0) continue;
      const back = this.g.turn.number - e.turn;
      e.turnPlayerId = this.g.players[(((active - back) % n) + n) % n]!.id;
    }
    if (this.g.decision.kind === 'priority') {
      this.g.decision = priorityDecision(this.g);
    }
    return this.g;
  }
}

export const ref = (id: string) => `{card:${id}}`;
