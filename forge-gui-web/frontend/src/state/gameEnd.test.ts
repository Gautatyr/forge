import { describe, expect, it } from 'vitest';
import { GameBuilder } from '../mock/builder';
import type { MockGame } from '../mock/engine';
import {
  boardOpponents,
  gameEndView,
  headline,
  newlyOut,
  ordinal,
  outLine,
  outReasonText,
  rankingRows,
  watching,
  youAreOutText,
} from './gameEnd';
import { scenarioById } from '../mock/scenarios';
import { DEFAULT_STOPS } from './prefs';
import { primaryAction, promptText } from './primaryAction';
import { INITIAL_UI } from './ui';

function table(): MockGame {
  const b = new GameBuilder('t', 'commander');
  b.player('you', 'Hugo', 40).player('mira', 'Mira', 40).player('theo', 'Theo', 40).player('ana', 'Ana', 40);
  return b.done();
}

function out(g: MockGame, id: string, turn: number, reason: NonNullable<MockGame['players'][number]['out']>['reason']) {
  const p = g.players.find((x) => x.id === id)!;
  p.hasLost = true;
  p.out = { turn, reason };
}

const krenko = { kind: 'commanderDamage', amount: 21, commanderName: 'Krenko, Mob Boss' } as const;

describe('out lines (design pass 4 §2.6)', () => {
  it('words each reason, with the short commander name for the ranking', () => {
    expect(outReasonText(krenko)).toBe('21 commander damage from Krenko, Mob Boss');
    expect(outReasonText(krenko, { short: true })).toBe('21 commander damage from Krenko');
    expect(outReasonText({ kind: 'life', life: 0 })).toBe('life down to 0');
    expect(outReasonText({ kind: 'life', life: -3 })).toBe('life down to −3');
    expect(outReasonText({ kind: 'poison', count: 10 })).toBe('10 poison counters');
    expect(outReasonText({ kind: 'conceded' })).toBe('conceded');
    expect(outReasonText({ kind: 'conceded' }, { you: true })).toBe('you conceded');
    expect(outReasonText({ kind: 'other', text: 'lost to an alternate win' })).toBe('lost to an alternate win');
  });

  it('toast and log line: "Theo is out: 21 commander damage from Krenko, Mob Boss."', () => {
    const g = table();
    out(g, 'theo', 12, krenko);
    expect(outLine(g.players[2]!)).toBe('Theo is out: 21 commander damage from Krenko, Mob Boss.');
  });

  it('your dialog: "You\'re out: … The game continues."', () => {
    const g = table();
    out(g, 'you', 12, krenko);
    expect(youAreOutText(g.players[0]!)).toBe("You're out: 21 commander damage from Krenko, Mob Boss. The game continues.");
    out(g, 'you', 12, { kind: 'conceded' });
    expect(youAreOutText(g.players[0]!)).toBe("You're out: you conceded. The game continues.");
  });
});

describe('end of game', () => {
  it('ranks 1st to 4th with turn and reason', () => {
    const g = table();
    out(g, 'theo', 12, krenko);
    out(g, 'ana', 13, { kind: 'life', life: 0 });
    out(g, 'you', 14, { kind: 'conceded' });
    g.result = { winnerId: 'mira', reason: 'Last player standing.', ranking: ['mira', 'you', 'ana', 'theo'], nextGame: false };
    expect(rankingRows(g).map((r) => `${r.ordinal} ${r.name}${r.detail ? `, ${r.detail}` : ''}`)).toEqual([
      '1st Mira',
      '2nd Hugo (you), turn 14, conceded',
      '3rd Ana, turn 13, life down to 0',
      '4th Theo, turn 12, 21 commander damage from Krenko',
    ]);
    expect(headline(g)).toEqual({ playerId: 'mira', text: 'Mira won' });
    g.result.winnerId = 'you';
    expect(headline(g)).toEqual({ playerId: undefined, text: 'You won' });
    g.result.winnerId = undefined;
    expect(headline(g).text).toBe('Draw');
  });

  it('ordinals', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22].map(ordinal)).toEqual(['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd']);
  });
});

describe('who just went out, and the board without them', () => {
  it('lists players live before and out now', () => {
    const g = table();
    out(g, 'theo', 12, krenko);
    expect(newlyOut(['you', 'mira', 'theo', 'ana'], g)).toEqual(['theo']);
    expect(newlyOut(['you', 'mira', 'ana'], g)).toEqual([]);
  });

  it('keeps live opponents plus the ones still leaving, in seat order', () => {
    const g = table();
    out(g, 'theo', 12, krenko);
    expect(boardOpponents(g, []).map((p) => p.id)).toEqual(['mira', 'ana']);
    expect(boardOpponents(g, ['theo']).map((p) => p.id)).toEqual(['mira', 'theo', 'ana']);
  });
});

describe('which game-end view is open', () => {
  it('you are out: dialog, then watching once dismissed', () => {
    const g = table();
    expect(gameEndView(g, INITIAL_UI)).toBeUndefined();
    expect(watching(g)).toBe(false);
    out(g, 'you', 9, krenko);
    expect(watching(g)).toBe(true);
    expect(gameEndView(g, INITIAL_UI)).toBe('out');
    expect(gameEndView(g, { ...INITIAL_UI, watchingGame: g.id })).toBeUndefined();
  });

  it('game over: panel, then the board with a chip; concede confirm comes first', () => {
    const g = table();
    expect(gameEndView(g, { ...INITIAL_UI, overlay: 'concede' })).toBe('concede');
    g.result = { winnerId: 'mira', reason: 'Last player standing.', ranking: ['mira', 'you', 'theo', 'ana'], nextGame: false };
    out(g, 'you', 9, krenko);
    expect(watching(g)).toBe(false);
    expect(gameEndView(g, INITIAL_UI)).toBe('over');
    expect(gameEndView(g, { ...INITIAL_UI, boardViewGame: g.id })).toBeUndefined();
  });
});

describe('the action block once you are out', () => {
  it('reads "Watching" with no prompt, and "Game over" after the game', () => {
    const out = scenarioById('you-out').build();
    expect(primaryAction(out, INITIAL_UI, DEFAULT_STOPS)).toMatchObject({ label: 'Watching', enabled: false });
    expect(promptText(out)).toBe('');
    const over = scenarioById('game-over').build();
    expect(primaryAction(over, INITIAL_UI, DEFAULT_STOPS)).toMatchObject({ label: 'Game over', enabled: false });
    expect(promptText(over)).toBe('');
  });
});
