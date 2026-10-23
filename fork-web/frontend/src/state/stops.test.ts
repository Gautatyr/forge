import { describe, expect, it } from 'vitest';
import { scenarioById } from '../mock/scenarios';
import type { GameView, StepId } from '../model/types';
import { DEFAULT_STOPS, parsePrefs, type StopPrefs } from './prefs';
import {
  isStop,
  nextStop,
  nextStopLabel,
  opponentCell,
  resetStops,
  setOpponentStop,
  setSharedOpponentStop,
  setYourStop,
  sharedOpponentCell,
  stepHint,
} from './stops';

const OPPS = ['mira', 'theo', 'ana'];

function at(game: GameView, activePlayerId: string, step: StepId): GameView {
  return { ...game, turn: { ...game.turn, activePlayerId, step } };
}

describe('default stops are Forge’s (ForgePreferences PHASE_HUMAN_* / PHASE_AI_*)', () => {
  it('your turn: Main 1, Declare blockers, Main 2', () => {
    expect([...DEFAULT_STOPS.yourTurn].sort()).toEqual(['declareBlockers', 'main1', 'main2'].sort());
  });
  it('opponents’ turns: Beginning of combat, Declare attackers, Declare blockers, End step', () => {
    expect([...DEFAULT_STOPS.opponentsTurn].sort()).toEqual(['beginCombat', 'declareAttackers', 'declareBlockers', 'end'].sort());
  });
  it('starts with no per-opponent rows', () => {
    expect(DEFAULT_STOPS.perOpponent).toEqual({});
  });
});

describe('stops are kept in prefs', () => {
  it('restores both shared rows, drops per-opponent rows (they last one match) and unknown steps', () => {
    const p = parsePrefs(
      JSON.stringify({
        stops: { yourTurn: ['upkeep', 'bogus', 'untap'], opponentsTurn: ['end'], perOpponent: { mira: ['draw'] } },
      }),
    );
    expect(p.stops).toEqual({ yourTurn: ['upkeep'], opponentsTurn: ['end'], perOpponent: {} });
  });
  it('falls back to Forge’s defaults when nothing or garbage is stored', () => {
    expect(parsePrefs(JSON.stringify({ layout: 'table' })).stops).toEqual(DEFAULT_STOPS);
    expect(parsePrefs(JSON.stringify({ stops: 'x' })).stops).toEqual(DEFAULT_STOPS);
    expect(parsePrefs('not json').stops).toEqual(DEFAULT_STOPS);
  });
  it('keeps the rest of the prefs', () => {
    expect(parsePrefs(JSON.stringify({ layout: 'table' })).layout).toBe('table');
  });
});

describe('editing stops', () => {
  it('toggles a cell of your row', () => {
    const s = setYourStop(DEFAULT_STOPS, 'upkeep', true);
    expect(isStop(s, 'you', 'you', 'upkeep')).toBe(true);
    expect(isStop(setYourStop(s, 'upkeep', false), 'you', 'you', 'upkeep')).toBe(false);
  });

  it('a per-opponent cell changes only that opponent, and the shared row then reads Mixed', () => {
    const s = setOpponentStop(DEFAULT_STOPS, 'theo', 'upkeep', true);
    expect(isStop(s, 'you', 'theo', 'upkeep')).toBe(true);
    expect(isStop(s, 'you', 'mira', 'upkeep')).toBe(false);
    expect(opponentCell(s, 'theo', 'upkeep')).toBe('stop');
    expect(sharedOpponentCell(s, OPPS, 'upkeep')).toBe('mixed');
    expect(sharedOpponentCell(s, OPPS, 'end')).toBe('stop');
    expect(sharedOpponentCell(s, OPPS, 'draw')).toBe('pass');
  });

  it('a shared cell sets every opponent, clearing Mixed', () => {
    let s = setOpponentStop(DEFAULT_STOPS, 'theo', 'upkeep', true);
    s = setSharedOpponentStop(s, 'upkeep', true);
    expect(sharedOpponentCell(s, OPPS, 'upkeep')).toBe('stop');
    for (const o of OPPS) expect(isStop(s, 'you', o, 'upkeep')).toBe(true);
    s = setSharedOpponentStop(s, 'upkeep', false);
    for (const o of OPPS) expect(isStop(s, 'you', o, 'upkeep')).toBe(false);
    // Theo's other cells are untouched.
    expect(isStop(s, 'you', 'theo', 'end')).toBe(true);
  });

  it('only current opponents count towards Mixed', () => {
    const s: StopPrefs = { ...DEFAULT_STOPS, perOpponent: { gone: ['upkeep'] } };
    expect(sharedOpponentCell(s, OPPS, 'upkeep')).toBe('pass');
  });

  it('resets to Forge’s defaults', () => {
    const s = setOpponentStop(setYourStop(DEFAULT_STOPS, 'draw', true), 'ana', 'draw', true);
    expect(resetStops()).toEqual(DEFAULT_STOPS);
    expect(s).not.toEqual(DEFAULT_STOPS);
  });
});

describe('next stop', () => {
  const g = scenarioById('priority').build(); // you, Mira, Theo, Ana

  it('from your second main phase with defaults: Mira’s beginning of combat step', () => {
    expect(nextStop(at(g, 'you', 'main2'), DEFAULT_STOPS)).toEqual({ playerId: 'mira', step: 'beginCombat' });
    expect(nextStopLabel(at(g, 'you', 'main2'), DEFAULT_STOPS)).toBe("Mira's beginning of combat step");
  });

  it('later in the same turn comes first', () => {
    expect(nextStop(at(g, 'theo', 'beginCombat'), DEFAULT_STOPS)).toEqual({ playerId: 'theo', step: 'declareAttackers' });
    expect(nextStopLabel(at(g, 'theo', 'beginCombat'), DEFAULT_STOPS)).toBe("Theo's declare attackers step");
  });

  it('wraps to your own turn', () => {
    expect(nextStop(at(g, 'ana', 'end'), DEFAULT_STOPS)).toEqual({ playerId: 'you', step: 'main1' });
    expect(nextStopLabel(at(g, 'ana', 'end'), DEFAULT_STOPS)).toBe('your first main phase');
  });

  it('follows per-opponent rows', () => {
    const s = setOpponentStop(DEFAULT_STOPS, 'mira', 'beginCombat', false);
    expect(nextStop(at(g, 'you', 'main2'), s)).toEqual({ playerId: 'mira', step: 'declareAttackers' });
  });

  it('skips players who have lost', () => {
    const lost = { ...g, players: g.players.map((p) => (p.id === 'mira' ? { ...p, hasLost: true } : p)) };
    expect(nextStop(at(lost, 'you', 'main2'), DEFAULT_STOPS)).toEqual({ playerId: 'theo', step: 'beginCombat' });
  });

  it('comes back to the current step a full round later when it is the only stop', () => {
    const only: StopPrefs = { yourTurn: ['upkeep'], opponentsTurn: [], perOpponent: {} };
    expect(nextStop(at(g, 'you', 'upkeep'), only)).toEqual({ playerId: 'you', step: 'upkeep' });
  });

  it('is undefined with no stops at all', () => {
    expect(nextStop(g, { yourTurn: [], opponentsTurn: [], perOpponent: {} })).toBeUndefined();
  });
});

describe('strip hover text', () => {
  it('says on whose turns the game stops, and how to change it', () => {
    const g = scenarioById('priority').build();
    const s = setYourStop(DEFAULT_STOPS, 'upkeep', true);
    expect(stepHint(g, s, 'upkeep')).toBe("Upkeep step: the game stops here for you on your turns, not on opponents' turns. Click to change.");
    expect(stepHint(g, DEFAULT_STOPS, 'declareBlockers')).toBe(
      "Declare blockers step: the game stops here for you on your turns and on opponents' turns. Click to change.",
    );
    expect(stepHint(g, DEFAULT_STOPS, 'end')).toBe("End step: the game stops here for you on opponents' turns, not on your turns. Click to change.");
    expect(stepHint(g, DEFAULT_STOPS, 'draw')).toBe(
      'Draw step: the game passes this step for you unless something is on the stack. Click to change.',
    );
    const mixed = setOpponentStop(DEFAULT_STOPS, 'theo', 'draw', true);
    expect(stepHint(g, mixed, 'draw')).toBe("Draw step: the game stops here for you on some opponents' turns, not on your turns. Click to change.");
  });

  it('counts “some opponents” as stopping when your own turns stop too', () => {
    const g = scenarioById('priority').build();
    const s = setOpponentStop(setYourStop(DEFAULT_STOPS, 'draw', true), 'ana', 'draw', true);
    expect(stepHint(g, s, 'draw')).toBe("Draw step: the game stops here for you on your turns and on some opponents' turns. Click to change.");
  });

  it('1v1 says “opponent’s turns”', () => {
    const g = scenarioById('duel').build();
    expect(stepHint(g, DEFAULT_STOPS, 'end')).toBe("End step: the game stops here for you on your opponent's turns, not on your turns. Click to change.");
  });
});

describe('auto-pay is kept in prefs', () => {
  it('defaults Off, restores On, ignores garbage', () => {
    expect(parsePrefs('{}').autoPay).toBe(false);
    expect(parsePrefs(JSON.stringify({ autoPay: true })).autoPay).toBe(true);
    expect(parsePrefs(JSON.stringify({ autoPay: 'yes' })).autoPay).toBe(false);
  });
});

describe('“Stop only when I’m involved” (ruling 2026-10-22, memo U1a)', () => {
  const g = scenarioById('priority').build(); // you, Mira, Theo, Ana: Ana plays right before you
  const on: StopPrefs = { ...DEFAULT_STOPS, involvedOnly: true };
  const quiet: StopPrefs = { ...setSharedOpponentStop(DEFAULT_STOPS, 'beginCombat', false), involvedOnly: true };
  const attack = (defenderId: string): GameView['combat'] => ({ attacks: [{ attackerId: 'x', defenderId }], blocks: [] });

  it('is off by default, kept in prefs, and garbage reads as off', () => {
    expect(DEFAULT_STOPS.involvedOnly).toBeFalsy();
    expect(parsePrefs(JSON.stringify({ stops: { ...DEFAULT_STOPS, involvedOnly: true } })).stops.involvedOnly).toBe(true);
    expect(parsePrefs(JSON.stringify({ stops: { ...DEFAULT_STOPS, involvedOnly: 'yes' } })).stops.involvedOnly).toBeFalsy();
    expect(parsePrefs('{}').stops.involvedOnly).toBeFalsy();
  });

  it('leaves the rows sent to the bridge as they are (the bridge decides on the live combat)', () => {
    expect(isStop(on, 'you', 'mira', 'beginCombat')).toBe(true);
    expect(isStop(on, 'you', 'theo', 'end')).toBe(true);
  });

  it('beginning of combat holds as the row is set (memo U1a: one click away in the Stops panel)', () => {
    expect(nextStop(at(g, 'you', 'main2'), on)).toEqual({ playerId: 'mira', step: 'beginCombat' });
    expect(nextStop(at(g, 'you', 'main2'), quiet)).not.toEqual({ playerId: 'mira', step: 'beginCombat' });
  });

  it('next stop skips unknown attacks and the end steps of players not right before you', () => {
    expect(nextStop(at(g, 'you', 'main2'), quiet)).toEqual({ playerId: 'ana', step: 'end' });
    expect(nextStopLabel(at(g, 'you', 'main2'), quiet)).toBe("Ana's end step");
  });

  it('keeps your own turn', () => {
    expect(nextStop(at(g, 'ana', 'end'), on)).toEqual({ playerId: 'you', step: 'main1' });
  });

  it('holds declare blockers when the combat under way attacks you', () => {
    const attacked = { ...at(g, 'theo', 'declareAttackers'), combat: attack('you') };
    expect(nextStop(attacked, on)).toEqual({ playerId: 'theo', step: 'declareBlockers' });
    const other = { ...at(g, 'theo', 'declareAttackers'), combat: attack('mira') };
    expect(nextStop(other, quiet)).toEqual({ playerId: 'ana', step: 'end' });
  });

  it('holds declare blockers when one of your creatures blocks', () => {
    const blockerId = Object.values(g.cards).find((c) => c.controllerId === 'you' && c.zone === 'battlefield')!.id;
    const blocking = {
      ...at(g, 'theo', 'declareAttackers'),
      combat: { attacks: [{ attackerId: 'x', defenderId: 'mira' }], blocks: [{ blockerId, attackerId: 'x' }] },
    };
    expect(nextStop(blocking, on)).toEqual({ playerId: 'theo', step: 'declareBlockers' });
  });

  it('a step set to Pass stays passed', () => {
    const s = setSharedOpponentStop(quiet, 'end', false);
    expect(nextStop(at(g, 'you', 'main2'), s)).toEqual({ playerId: 'you', step: 'main1' });
  });

  it('“right before you” skips players who have lost', () => {
    const lost = { ...g, players: g.players.map((p) => (p.id === 'ana' ? { ...p, hasLost: true } : p)) };
    expect(nextStop(at(lost, 'you', 'main2'), quiet)).toEqual({ playerId: 'theo', step: 'end' });
  });

  it('reset turns it off with the rows', () => {
    expect(resetStops().involvedOnly).toBeFalsy();
  });
});
