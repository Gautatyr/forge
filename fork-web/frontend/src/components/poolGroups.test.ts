import { describe, expect, it } from 'vitest';
import { poolGroups } from './poolGroups';

describe("an opponent's floating mana (pass-3 §2 'Floating mana')", () => {
  it('shows nothing while the pool is empty', () => {
    expect(poolGroups(undefined)).toEqual([]);
    expect(poolGroups({ R: 0 })).toEqual([]);
  });

  it('repeats the symbol for one or two of a colour', () => {
    expect(poolGroups({ R: 2 })).toEqual([{ colour: 'R', symbols: 2 }]);
  });

  it('reads {G}×3 for three or more of a colour, in WUBRGC order', () => {
    expect(poolGroups({ C: 2, G: 3, R: 7 })).toEqual([
      { colour: 'R', symbols: 1, times: 7 },
      { colour: 'G', symbols: 1, times: 3 },
      { colour: 'C', symbols: 2 },
    ]);
  });
});
