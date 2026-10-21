import { poolEntries } from '../model/mana';
import type { ManaColour, ManaPool } from '../model/types';

export interface PoolGroup {
  colour: ManaColour;
  /** Symbols drawn: the count for one or two, a single one from three. */
  symbols: number;
  /** Set from three of a colour: "{G}×3". */
  times?: number;
}

/** Floating mana as drawn (pass-3 §2): {R}{R}, but {G}×3 from three of a colour. Empty pool, no groups. */
export function poolGroups(pool: ManaPool | undefined): PoolGroup[] {
  return poolEntries(pool).map(([colour, n]) => (n >= 3 ? { colour, symbols: 1, times: n } : { colour, symbols: n }));
}
