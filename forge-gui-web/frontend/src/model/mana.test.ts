import { describe, expect, it } from 'vitest';
import { addGeneric, costPips, formatCost, parseCost, payOne, poolEntries, poolTotal, usefulColours, withX } from './mana';

describe('mana costs', () => {
  it('parses and formats generic and coloured symbols', () => {
    expect(parseCost('{2}{G}{W}')).toEqual({ generic: 2, coloured: ['G', 'W'] });
    expect(parseCost('{C}{C}')).toEqual({ generic: 0, coloured: ['C', 'C'] });
    expect(formatCost({ generic: 3, coloured: ['G'] })).toBe('{3}{G}');
    expect(formatCost({ generic: 0, coloured: [] })).toBe('');
  });

  it('pays coloured symbols first, then generic; useless mana pays nothing', () => {
    const c = parseCost('{1}{G}');
    expect(payOne(c, 'G')).toEqual({ generic: 1, coloured: [] });
    expect(payOne(c, 'W')).toEqual({ generic: 0, coloured: ['G'] });
    expect(payOne({ generic: 0, coloured: ['G'] }, 'W')).toBeUndefined();
    expect(usefulColours({ generic: 0, coloured: ['G'] }, ['G', 'W'])).toEqual(['G']);
    expect(usefulColours({ generic: 1, coloured: [] }, ['G', 'W'])).toEqual(['G', 'W']);
  });

  it('puts X and commander tax into the generic part', () => {
    expect(withX('{X}{G}', 3)).toBe('{3}{G}');
    expect(withX('{X}{G}', 0)).toBe('{G}');
    expect(withX('{2}{G}', 5)).toBe('{2}{G}');
    expect(addGeneric('{G}{W}', 2)).toBe('{2}{G}{W}');
    expect(addGeneric('{1}{G}', 4)).toBe('{5}{G}');
  });

  it('marks the paid pips of a cost against what remains', () => {
    expect(costPips('{2}{G}{W}', '{2}{G}{W}')).toEqual([
      { symbol: '2', paid: false },
      { symbol: 'G', paid: false },
      { symbol: 'W', paid: false },
    ]);
    // One generic paid: the {2} splits into a paid 1 and an unpaid 1.
    expect(costPips('{2}{G}{W}', '{1}{W}')).toEqual([
      { symbol: '1', paid: true },
      { symbol: '1', paid: false },
      { symbol: 'G', paid: true },
      { symbol: 'W', paid: false },
    ]);
    expect(costPips('{G}{G}', '{G}')).toEqual([
      { symbol: 'G', paid: true },
      { symbol: 'G', paid: false },
    ]);
    expect(costPips('{3}{G}', '')).toEqual([
      { symbol: '3', paid: true },
      { symbol: 'G', paid: true },
    ]);
  });

  it('lists a pool in WUBRGC order without empty colours', () => {
    expect(poolEntries({ G: 2, W: 0, C: 1 })).toEqual([
      ['G', 2],
      ['C', 1],
    ]);
    expect(poolTotal({ G: 2, C: 1 })).toBe(3);
    expect(poolTotal(undefined)).toBe(0);
  });
});
