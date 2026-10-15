import { PRIORITY_STEPS, STEPS, stepInfo } from '../model/phases';
import type { GameView, PlayerId, StepId } from '../model/types';
import { DEFAULT_STOPS, type StopPrefs } from './prefs';

/** One cell of the Stops editor. "mixed": the shared row while opponents differ. */
export type StopCell = 'stop' | 'pass' | 'mixed';

const has = (list: StepId[], step: StepId) => list.includes(step);

/** Same order as the turn, no duplicates. */
function withStep(list: StepId[], step: StepId, on: boolean): StepId[] {
  return PRIORITY_STEPS.map((s) => s.id).filter((id) => (id === step ? on : list.includes(id)));
}

function opponentRow(stops: StopPrefs, opponentId: PlayerId): StepId[] {
  return stops.perOpponent[opponentId] ?? stops.opponentsTurn;
}

/** Does the game wait for you at `step` of `turnPlayerId`'s turn (stack empty)? */
export function isStop(stops: StopPrefs, youId: PlayerId, turnPlayerId: PlayerId, step: StepId): boolean {
  return has(turnPlayerId === youId ? stops.yourTurn : opponentRow(stops, turnPlayerId), step);
}

export function opponentCell(stops: StopPrefs, opponentId: PlayerId, step: StepId): StopCell {
  return has(opponentRow(stops, opponentId), step) ? 'stop' : 'pass';
}

/** The shared row's cell: "mixed" when the current opponents disagree. */
export function sharedOpponentCell(stops: StopPrefs, opponentIds: PlayerId[], step: StepId): StopCell {
  const cells = new Set(opponentIds.map((id) => opponentCell(stops, id, step)));
  if (cells.size === 0) return has(stops.opponentsTurn, step) ? 'stop' : 'pass';
  return cells.size > 1 ? 'mixed' : [...cells][0]!;
}

export function setYourStop(stops: StopPrefs, step: StepId, on: boolean): StopPrefs {
  return { ...stops, yourTurn: withStep(stops.yourTurn, step, on) };
}

/** Shared row: sets the step for every opponent, including their own rows. */
export function setSharedOpponentStop(stops: StopPrefs, step: StepId, on: boolean): StopPrefs {
  const perOpponent = Object.fromEntries(Object.entries(stops.perOpponent).map(([id, list]) => [id, withStep(list, step, on)]));
  return { ...stops, opponentsTurn: withStep(stops.opponentsTurn, step, on), perOpponent };
}

/** One opponent's row: it starts as a copy of the shared row. */
export function setOpponentStop(stops: StopPrefs, opponentId: PlayerId, step: StepId, on: boolean): StopPrefs {
  return {
    ...stops,
    perOpponent: { ...stops.perOpponent, [opponentId]: withStep(opponentRow(stops, opponentId), step, on) },
  };
}

export function resetStops(): StopPrefs {
  return DEFAULT_STOPS;
}

export interface StopPoint {
  playerId: PlayerId;
  step: StepId;
}

/**
 * Where the game next waits for you if you pass now and the stack stays
 * empty: the rest of this turn, then each following turn, up to this same
 * step one full round later.
 */
export function nextStop(game: GameView, stops: StopPrefs): StopPoint | undefined {
  const order = game.players.filter((p) => !p.hasLost || p.id === game.turn.activePlayerId);
  const start = order.findIndex((p) => p.id === game.turn.activePlayerId);
  if (start < 0) return undefined;
  const current = STEPS.findIndex((s) => s.id === game.turn.step);
  for (let k = 0; k <= order.length; k++) {
    const p = order[(start + k) % order.length]!;
    if (k > 0 && p.hasLost) continue;
    for (const [i, s] of STEPS.entries()) {
      if (s.noPriority) continue;
      if (k === 0 && i <= current) continue;
      if (k === order.length && i > current) break;
      if (isStop(stops, game.youId, p.id, s.id)) return { playerId: p.id, step: s.id };
    }
  }
  return undefined;
}

/** "Theo's Attack step", "your Main 1"; undefined when no stop is set. */
export function nextStopLabel(game: GameView, stops: StopPrefs): string | undefined {
  const at = nextStop(game, stops);
  if (!at) return undefined;
  const p = game.players.find((x) => x.id === at.playerId)!;
  return `${p.id === game.youId ? 'your' : `${p.name}'s`} ${stepInfo(at.step).stopName}`;
}

/** Hover text of a strip step: on whose turns the game stops there. */
export function stepHint(game: GameView, stops: StopPrefs, step: StepId): string {
  const name = stepInfo(step).stopName;
  const opponents = game.players.filter((p) => p.id !== game.youId && !p.hasLost).map((p) => p.id);
  const mine = has(stops.yourTurn, step);
  const theirs = sharedOpponentCell(stops, opponents, step);
  const theirTurns =
    theirs === 'mixed' ? "some opponents' turns" : opponents.length === 1 ? "your opponent's turns" : "opponents' turns";
  let where: string;
  if (!mine && theirs === 'pass') where = 'the game passes this step for you unless something is on the stack';
  else if (!mine) where = `the game stops here for you on ${theirTurns}, not on your turns`;
  else if (theirs === 'pass') where = `the game stops here for you on your turns, not on ${theirTurns}`;
  else where = `the game stops here for you on your turns and on ${theirTurns}`;
  return `${name}: ${where}. Click to change.`;
}
