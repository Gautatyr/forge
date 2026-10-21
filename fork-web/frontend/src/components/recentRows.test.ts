import { describe, expect, it } from 'vitest';
import { scenarioById } from '../mock/scenarios';
import type { GameView, LogEntry } from '../model/types';
import { recentRows } from './recentRows';

function withLog(log: LogEntry[]): GameView {
  return { ...scenarioById('priority').build(), log };
}

const e = (id: string, turn: number, turnPlayerId: string | undefined, extra: Partial<LogEntry> = {}): LogEntry => ({
  id,
  turn,
  turnPlayerId,
  text: id,
  ...extra,
});

/** Compact picture of the rows: dividers as "— label —", bold entries as "**id**". */
function picture(g: GameView, limit = 20) {
  return recentRows(g, limit).map((r) =>
    r.kind === 'divider' ? `— ${r.label} —` : r.bold ? `**${r.entry.id}**` : r.entry.id,
  );
}

describe('Recent (design pass 4, P6)', () => {
  it('draws a divider per turn above that turn’s entries, newest first', () => {
    const g = withLog([e('a', 9, 'ana'), e('b', 10, 'you'), e('c', 10, 'you'), e('d', 11, 'mira')]);
    expect(picture(g)).toEqual(['— Mira’s turn 11 —', 'd', '— Your turn 10 —', 'c', 'b', '— Ana’s turn 9 —', 'a']);
  });

  it('gives each divider the seat of the player whose turn it was', () => {
    const g = withLog([e('a', 9, 'theo'), e('b', 10, 'ana')]);
    const seats = recentRows(g, 20).flatMap((r) => (r.kind === 'divider' ? [r.seat] : []));
    expect(seats).toEqual([3, 2]);
  });

  it('falls back to the turn number when the entry does not say whose turn it was', () => {
    const g = withLog([e('a', 7, undefined), e('b', 8, undefined)]);
    expect(picture(g)).toEqual(['— Turn 8 —', 'b', '— Turn 7 —', 'a']);
    const seats = recentRows(g, 20).flatMap((r) => (r.kind === 'divider' ? [r.seat] : []));
    expect(seats).toEqual([undefined, undefined]);
  });

  it('bolds the lines where you lose life or a permanent', () => {
    const g = withLog([
      e('a', 9, 'mira', { youLost: 'life' }),
      e('b', 9, 'mira'),
      e('c', 9, 'mira', { youLost: 'permanent' }),
    ]);
    expect(picture(g)).toEqual(['— Mira’s turn 9 —', '**c**', 'b', '**a**']);
  });

  it('keeps only the newest entries, with the divider of the oldest turn still shown', () => {
    const g = withLog([e('a', 8, 'ana'), e('b', 9, 'you'), e('c', 9, 'you'), e('d', 9, 'you')]);
    expect(picture(g, 2)).toEqual(['— Your turn 9 —', 'd', 'c']);
  });
});
