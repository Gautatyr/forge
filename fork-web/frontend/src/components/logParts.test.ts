import { describe, expect, it } from 'vitest';
import { logParts } from './logParts';

describe('log text parts', () => {
  it('keeps plain text as one part', () => {
    expect(logParts('Mira passes.')).toEqual([{ kind: 'text', text: 'Mira passes.' }]);
  });

  it('turns {card:<id>} into a card part', () => {
    expect(logParts('Mira casts {card:c7}.')).toEqual([
      { kind: 'text', text: 'Mira casts ' },
      { kind: 'card', id: 'c7', at: 11 },
      { kind: 'text', text: '.' },
    ]);
  });

  it('draws mana symbols, not braces: "Mira adds {R}{R}."', () => {
    expect(logParts('Mira adds {R}{R}.')).toEqual([
      { kind: 'text', text: 'Mira adds ' },
      { kind: 'mana', symbol: 'R', at: 10 },
      { kind: 'mana', symbol: 'R', at: 13 },
      { kind: 'text', text: '.' },
    ]);
  });

  it('draws generic and X costs; leaves other braces as text', () => {
    expect(logParts('{2}{X} {T}')).toEqual([
      { kind: 'mana', symbol: '2', at: 0 },
      { kind: 'mana', symbol: 'X', at: 3 },
      { kind: 'text', text: ' {T}' },
    ]);
  });
});
