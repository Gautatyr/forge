/**
 * Mock game start and end (design pass 4 §2.4, §2.6, issue #32): the toss,
 * the London mulligan with bottoming, players leaving the game, concede, the
 * result and the next game. Called from engine.ts; as shallow as the rest of
 * the mock engine.
 */
import type { PromptAnswer } from '../model/intents';
import { isCreature, player } from '../model/selectors';
import type { CardView, ChoicePrompt, OutReason, PlayerId, PlayerView } from '../model/types';
import { outReasonText } from '../state/gameEnd';
import { BOTTOM_PROMPT_ID, bottomPrompt, MULLIGAN_PROMPT_ID, mulliganPrompt } from '../state/gameStart';
import { lookup, type CardKey } from './cardDb';
import { priorityDecision, recompute, type MockGame } from './engine';

export interface OpeningState {
  /** Mulligans you took. */
  mulligans: number;
  /** The engine makes the first mulligan free (multiplayer Commander). */
  firstFree: boolean;
  /** Who plays first once hands are kept. */
  starter: PlayerId;
  /** Hands dealt so far (picks the next mock hand). */
  deals: number;
}

export const TOSS_PROMPT_ID = 'toss';
const HAND_SIZE = 7;

/** Your mock opening hands, dealt in turn. */
const HANDS: CardKey[][] = [
  ['Forest', 'Plains', 'Temple Garden', 'Sol Ring', "Enchantress's Presence", 'Path to Exile', 'Doubling Season'],
  ['Forest', 'Eidolon of Blossoms', 'Mesa Enchantress', 'Wrath of God', 'Smothering Tithe', 'Destiny Spinner', 'Generous Gift'],
  ['Forest', 'Plains', 'Command Tower', 'Elvish Mystic', 'Cultivate', 'Sanctum Weaver', 'Heroic Intervention'],
];

function log(g: MockGame, text: string, playerId?: PlayerId) {
  g.seq += 1;
  g.log.push({ id: `l${g.seq}`, turn: g.turn.number, playerId, text });
}

function makeCard(g: MockGame, key: CardKey, ownerId: PlayerId): CardView {
  g.seq += 1;
  const { front, back } = lookup(key);
  const c: CardView = {
    id: `${ownerId}-d${g.seq}`,
    name: front.name,
    front,
    back,
    ownerId,
    controllerId: ownerId,
    zone: 'hand',
    isToken: false,
    isCommander: false,
    tapped: false,
    summoningSick: isCreature({ front } as CardView),
    counters: [],
    damage: 0,
    ptModifiers: [],
    keywords: [],
    attachments: [],
  };
  g.cards[c.id] = c;
  return c;
}

/** Cards shuffled into the library: the mock forgets them. */
function dropCards(g: MockGame, ids: string[]) {
  g.cards = Object.fromEntries(Object.entries(g.cards).filter(([id]) => !ids.includes(id)));
}

/** Shuffle your hand away and draw 7: the next mock hand. */
function deal(g: MockGame, o: OpeningState) {
  const you = player(g, g.youId);
  dropCards(g, you.hand);
  const keys = HANDS[o.deals % HANDS.length]!;
  o.deals += 1;
  you.hand = keys.map((k) => makeCard(g, k, you.id).id);
  you.handCount = you.hand.length;
}

/** Cards that go to the bottom when keeping now. */
const toBottom = (o: OpeningState) => Math.max(0, o.mulligans - (o.firstFree ? 1 : 0));

function mulliganDecision(g: MockGame, o: OpeningState) {
  g.decision = {
    kind: 'choice',
    prompt: mulliganPrompt({ handSize: HAND_SIZE, toBottom: toBottom(o), freeNext: o.firstFree && o.mulligans === 0 }),
  };
}

/**
 * Opening hands: deal yours and ask keep or mulligan. Opponents' tags come
 * from `PlayerView.mulligan`, set by the caller.
 */
export function startOpeningHands(g: MockGame, starter: PlayerId, firstFree = true) {
  g.opening = { mulligans: 0, firstFree, starter, deals: 0 };
  for (const p of g.players) {
    if (p.isYou) continue;
    p.handCount = HAND_SIZE;
    p.mulligan ??= { state: 'deciding' };
  }
  deal(g, g.opening);
  mulliganDecision(g, g.opening);
}

/** The toss winner's question: "You go first. Play first?" */
export function tossPrompt(g: MockGame): ChoicePrompt {
  const other = g.players.find((p) => !p.isYou)!;
  return {
    id: TOSS_PROMPT_ID,
    shape: 'yesNo',
    title: 'You go first. Play first?',
    instruction: '',
    confirmLabel: 'Play first',
    yesLabel: 'Play first',
    noLabel: `Let {player:${other.id}} start`,
  };
}

/** Hands kept: opponents settle, tags clear, turn 1 begins. */
function beginGame(g: MockGame, o: OpeningState) {
  for (const p of g.players) p.mulligan = undefined;
  g.opening = undefined;
  const starter = player(g, o.starter);
  g.turn = { number: 1, activePlayerId: starter.id, step: 'main1', priorityPlayerId: starter.id };
  log(g, `The game begins. ${starter.isYou ? 'You play' : `${starter.name} plays`} first.`, starter.id);
  recompute(g);
  g.decision = starter.isYou
    ? priorityDecision(g)
    : { kind: 'waiting', forPlayerId: starter.id, what: `${starter.name} is taking their turn` };
}

/** Answers to the toss, mulligan and bottoming prompts; false for other prompts. */
export function answerGameStart(g: MockGame, prompt: ChoicePrompt, answer: PromptAnswer): boolean {
  const you = player(g, g.youId);
  if (prompt.id === TOSS_PROMPT_ID && answer.shape === 'yesNo') {
    const starter = answer.yes ? you : g.players.find((p) => !p.isYou)!;
    log(g, answer.yes ? 'You choose to play first.' : `You let ${starter.name} start.`, you.id);
    startOpeningHands(g, starter.id);
    return true;
  }
  const o = g.opening;
  if (!o) return false;
  if (prompt.id === MULLIGAN_PROMPT_ID && answer.shape === 'yesNo') {
    if (!answer.yes) {
      o.mulligans += 1;
      log(g, o.mulligans === 1 && o.firstFree ? 'You take a free mulligan.' : 'You take a mulligan.', you.id);
      deal(g, o);
      mulliganDecision(g, o);
      return true;
    }
    const n = toBottom(o);
    if (n === 0) {
      log(g, `You keep ${HAND_SIZE} cards.`, you.id);
      beginGame(g, o);
    } else {
      g.decision = { kind: 'choice', prompt: bottomPrompt(you.hand, n, (id) => g.cards[id]?.name ?? id) };
    }
    return true;
  }
  if (prompt.id === BOTTOM_PROMPT_ID && answer.shape === 'chooseN') {
    you.hand = you.hand.filter((x) => !answer.optionIds.includes(x));
    dropCards(g, answer.optionIds);
    you.handCount = you.hand.length;
    you.libraryCount += answer.optionIds.length;
    log(g, `You keep ${you.hand.length} cards and put ${answer.optionIds.length} on the bottom of your library.`, you.id);
    beginGame(g, o);
    return true;
  }
  return false;
}

/** All objects a player owns leave the game with them; their commander damage entries go too. */
function removeFromGame(g: MockGame, p: PlayerView) {
  const owned = new Set(Object.values(g.cards).filter((c) => c.ownerId === p.id).map((c) => c.id));
  for (const q of g.players) {
    q.battlefield = q.battlefield.filter((id) => !owned.has(id) && g.cards[id]?.controllerId !== p.id);
    q.commanderDamageTaken = q.commanderDamageTaken.filter((x) => !owned.has(x.commanderId));
  }
  for (const c of Object.values(g.cards)) {
    if (c.attachedTo && owned.has(c.attachedTo)) c.attachedTo = undefined;
    c.attachments = c.attachments.filter((a) => !owned.has(a));
    if (owned.has(c.id)) c.zone = 'exile';
  }
  p.battlefield = [];
  p.hand = [];
  p.handCount = 0;
  p.graveyard = [];
  p.exile = [];
  p.command = [];
  g.stack = g.stack.filter((s) => s.controllerId !== p.id && !owned.has(s.sourceCardId));
  if (g.combat) {
    g.combat = {
      attacks: g.combat.attacks.filter((a) => a.defenderId !== p.id && !owned.has(a.attackerId)),
      blocks: g.combat.blocks.filter((b) => !owned.has(b.blockerId) && !owned.has(b.attackerId)),
    };
  }
}

/** The next live player after `id` in turn order. */
function nextLive(g: MockGame, id: PlayerId): PlayerView | undefined {
  const n = g.players.length;
  const start = g.players.findIndex((p) => p.id === id);
  for (let k = 1; k <= n; k++) {
    const p = g.players[(start + k) % n]!;
    if (!p.hasLost) return p;
  }
  return undefined;
}

/**
 * A player leaves the game. `logLine`: log "<name> is out: <reason>." (a
 * concession logs "<name> concedes." instead).
 */
export function markOut(g: MockGame, p: PlayerView, reason: OutReason, commanderId?: string, logLine = true) {
  p.hasLost = true;
  p.out = { turn: g.turn.number, reason };
  g.outOrder = [...(g.outOrder ?? []), p.id];
  if (logLine) {
    const why =
      reason.kind === 'commanderDamage' && commanderId
        ? `${reason.amount} commander damage from {card:${commanderId}}`
        : outReasonText(reason);
    log(g, `${p.name} is out: ${why}.`, p.id);
  }
  removeFromGame(g, p);
  // Nobody waits on a player who is gone; you, out, only watch.
  const d = g.decision;
  if (p.isYou || (d.kind === 'waiting' && d.forPlayerId === p.id)) {
    const active = player(g, g.turn.activePlayerId);
    const next = active.hasLost ? nextLive(g, active.id) : active;
    if (next && !next.isYou) {
      g.turn.priorityPlayerId = next.id;
      g.decision = { kind: 'waiting', forPlayerId: next.id, what: `${next.name} is taking their turn` };
    }
  }
}

/** State-based losses: life 0 or less, 21 damage from one commander, 10 poison. */
export function checkOut(g: MockGame) {
  if (g.result || g.opening) return;
  for (const p of g.players) {
    if (p.hasLost) continue;
    const cmd = p.commanderDamageTaken.find((x) => x.amount >= 21);
    if (cmd) {
      const name = g.cards[cmd.commanderId]?.name ?? 'a commander';
      markOut(g, p, { kind: 'commanderDamage', amount: cmd.amount, commanderName: name }, cmd.commanderId);
    } else if (p.life <= 0) markOut(g, p, { kind: 'life', life: p.life });
    else if (p.poison >= 10) markOut(g, p, { kind: 'poison', count: p.poison });
  }
  finishIfOver(g);
}

/** One player left (or none): the game is over. Ranking: the winner, then who went out last. */
export function finishIfOver(g: MockGame) {
  const live = g.players.filter((p) => !p.hasLost);
  if (g.result || live.length > 1) return;
  const order = g.outOrder ?? [];
  const out = g.players
    .filter((p) => p.hasLost)
    .sort((a, b) => order.indexOf(b.id) - order.indexOf(a.id) || (b.out?.turn ?? 0) - (a.out?.turn ?? 0));
  const winner = live[0];
  g.result = {
    winnerId: winner?.id,
    reason: 'Last player standing.',
    ranking: [...live, ...out].map((p) => p.id),
    nextGame: (g.gamesLeft ?? 0) > 0,
  };
  g.combat = undefined;
  g.stack = [];
  g.turn.priorityPlayerId = undefined;
  if (winner) log(g, winner.isYou ? 'You win the game.' : `${winner.name} wins the game.`, winner.id);
  g.decision = { kind: 'waiting', forPlayerId: winner?.id ?? g.youId, what: 'The game is over' };
}

/** Concede: you are out; the others keep playing (or the game ends). False when there is nothing to concede. */
export function concede(g: MockGame): boolean {
  const you = player(g, g.youId);
  if (you.hasLost || g.result) return false;
  g.opening = undefined;
  for (const p of g.players) p.mulligan = undefined;
  markOut(g, you, { kind: 'conceded' }, undefined, false);
  log(g, `${you.name} concedes.`, you.id);
  finishIfOver(g);
  return true;
}

/** Game over with more games in the match: a fresh table, same commanders, opening hands. */
export function startNextGame(g: MockGame): boolean {
  if (!g.result?.nextGame) return false;
  const number = (g.gameNumber ?? 1) + 1;
  g.id = `${g.id.replace(/-game\d+$/, '')}-game${number}`;
  g.gameNumber = number;
  g.gamesLeft = Math.max(0, (g.gamesLeft ?? 1) - 1);
  const keep = new Set(g.players.flatMap((p) => p.commanders));
  g.cards = Object.fromEntries(Object.entries(g.cards).filter(([id]) => keep.has(id)));
  for (const c of Object.values(g.cards)) {
    Object.assign(c, { zone: 'command', tapped: false, damage: 0, counters: [], attachments: [], attachedTo: undefined });
  }
  for (const p of g.players) {
    Object.assign(p, {
      life: p.startingLife,
      poison: 0,
      counters: [],
      hasLost: false,
      out: undefined,
      hand: [],
      handCount: p.isYou ? 0 : HAND_SIZE,
      battlefield: [],
      graveyard: [],
      exile: [],
      command: [...p.commanders],
      commanderCasts: {},
      commanderDamageTaken: [],
      landsPlayedThisTurn: 0,
      manaPool: undefined,
      mulligan: undefined,
    } satisfies Partial<PlayerView>);
  }
  g.result = undefined;
  g.outOrder = [];
  g.stack = [];
  g.combat = undefined;
  g.eotEffects = {};
  g.casting = undefined;
  g.log = [];
  g.turn = { number: 1, activePlayerId: g.youId, step: 'main1' };
  log(g, `Game ${number} of the match.`);
  startOpeningHands(g, g.youId);
  return true;
}
