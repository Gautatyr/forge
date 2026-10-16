import type { ManaColour, ManaPool } from './types';

/** Pool and chooser order. */
export const MANA_ORDER: ManaColour[] = ['W', 'U', 'B', 'R', 'G', 'C'];

const isColour = (s: string): s is ManaColour => (MANA_ORDER as string[]).includes(s);

/** A cost split for arithmetic: generic mana plus coloured (and {C}) symbols in cost order. */
export interface CostParts {
  generic: number;
  coloured: ManaColour[];
}

/**
 * "{2}{G}{W}" → parts. {X} counts as nothing (substitute it first with `withX`).
 * Hybrid and Phyrexian symbols count as their first colour: enough for the mock.
 */
export function parseCost(cost: string): CostParts {
  const out: CostParts = { generic: 0, coloured: [] };
  for (const m of cost.matchAll(/\{([^}]+)\}/g)) {
    const s = m[1]!.toUpperCase();
    if (/^\d+$/.test(s)) out.generic += Number(s);
    else if (s === 'X') continue;
    else {
      const first = s.split('/')[0]!;
      if (isColour(first)) out.coloured.push(first);
      else out.generic += 1;
    }
  }
  return out;
}

export function formatCost(p: CostParts): string {
  return (p.generic > 0 ? `{${p.generic}}` : '') + p.coloured.map((c) => `{${c}}`).join('');
}

export const isPaid = (p: CostParts) => p.generic === 0 && p.coloured.length === 0;

/** Pay one mana of `colour`: its own symbol first, else one generic. Undefined when it pays nothing. */
export function payOne(p: CostParts, colour: ManaColour): CostParts | undefined {
  const i = p.coloured.indexOf(colour);
  if (i >= 0) return { generic: p.generic, coloured: p.coloured.filter((_, j) => j !== i) };
  if (p.generic > 0) return { generic: p.generic - 1, coloured: p.coloured };
  return undefined;
}

/** The colours among `colours` that still pay something. */
export function usefulColours(p: CostParts, colours: ManaColour[]): ManaColour[] {
  return colours.filter((c) => payOne(p, c) !== undefined);
}

/** Replace {X} with the chosen number, folded into the generic part. */
export function withX(cost: string, x: number): string {
  if (!/\{X\}/i.test(cost)) return cost;
  return addGeneric(cost.replace(/\{X\}/gi, ''), x);
}

/** Add generic mana (commander tax, X) to a cost. */
export function addGeneric(cost: string, n: number): string {
  const p = parseCost(cost);
  return formatCost({ ...p, generic: p.generic + n });
}

export interface CostPip {
  /** "2", "G", "W/U"… as written between braces. */
  symbol: string;
  paid: boolean;
}

/**
 * Pips of `cost` with their paid state, given what is left (`remaining`, same
 * notation). The generic number splits into a paid and an unpaid pip while
 * only part of it is paid; other symbols are matched one for one.
 */
export function costPips(cost: string, remaining: string): CostPip[] {
  const symbols = (s: string) => [...s.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]!.toUpperCase());
  const left = symbols(remaining);
  const leftGeneric = left.filter((s) => /^\d+$/.test(s)).reduce((n, s) => n + Number(s), 0);
  const all = symbols(cost);
  const count = (list: string[], s: string) => list.filter((x) => x === s).length;
  // Of identical symbols ({G}{G}), the first ones read as paid, so the ✓s fill left to right.
  const paidSoFar = new Map<string, number>();
  const out: CostPip[] = [];
  for (const s of all) {
    if (/^\d+$/.test(s)) {
      const total = Number(s);
      const unpaid = Math.min(total, leftGeneric);
      if (total - unpaid > 0) out.push({ symbol: String(total - unpaid), paid: true });
      if (unpaid > 0) out.push({ symbol: String(unpaid), paid: false });
      if (total === 0) out.push({ symbol: '0', paid: true });
      continue;
    }
    const quota = count(all, s) - count(left, s);
    const done = paidSoFar.get(s) ?? 0;
    paidSoFar.set(s, done + 1);
    out.push({ symbol: s, paid: done < quota });
  }
  return out;
}

/** Non-empty colours of a pool, in WUBRGC order. */
export function poolEntries(pool: ManaPool | undefined): [ManaColour, number][] {
  return MANA_ORDER.flatMap((c) => ((pool?.[c] ?? 0) > 0 ? [[c, pool![c]!] as [ManaColour, number]] : []));
}

export function poolTotal(pool: ManaPool | undefined): number {
  return poolEntries(pool).reduce((n, [, k]) => n + k, 0);
}
