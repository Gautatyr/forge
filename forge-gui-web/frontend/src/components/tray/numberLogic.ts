/**
 * Pure rules of the number shapes (design pass 4 §2.3): distribute an amount,
 * combat damage assignment, number (X) and name a card. The bodies stay thin
 * around these; the tray's confirm and the main button both use them.
 */
import type { CardNameOption, DistributePrompt, InputPrompt } from '../../model/types';
import type { Confirm } from './trayLogic';

export type Amounts = Record<string, number>;

/* --- Distribute ----------------------------------------------------------- */

const minOf = (p: DistributePrompt, id: string) => p.recipients.find((r) => r.id === id)?.min ?? 0;
const trampleId = (p: DistributePrompt) => p.combat?.trampleId;

/** Combat: the blockers (every recipient but the trample one). */
export const blockerRows = (p: DistributePrompt) => p.recipients.filter((r) => r.id !== trampleId(p));

export const leftToAssign = (p: DistributePrompt, a: Amounts) =>
  p.total - p.recipients.reduce((s, r) => s + (a[r.id] ?? 0), 0);

export function everyBlockerLethal(p: DistributePrompt, a: Amounts): boolean {
  return blockerRows(p).every((r) => (a[r.id] ?? 0) >= (r.lethal ?? 0));
}

/**
 * The automatic combat damage assignment (Forge's own default): lethal damage to
 * each blocker in order; the rest to the trampled player or planeswalker, or to the
 * last blocker without trample.
 */
export function autoAssign(p: DistributePrompt): Amounts {
  const a: Amounts = Object.fromEntries(p.recipients.map((r) => [r.id, 0]));
  let left = p.total;
  const blockers = blockerRows(p);
  for (const b of blockers) {
    const d = Math.min(b.lethal ?? 0, left);
    a[b.id] = d;
    left -= d;
  }
  const rest = trampleId(p) ?? blockers.at(-1)?.id;
  if (left > 0 && rest !== undefined) a[rest] = (a[rest] ?? 0) + left;
  return a;
}

/** Where the tray opens: the automatic assignment in combat, else each recipient at its minimum. */
export function startAmounts(p: DistributePrompt): Amounts {
  if (p.combat) return autoAssign(p);
  return Object.fromEntries(p.recipients.map((r) => [r.id, r.min ?? 0]));
}

/** The trample row takes damage only once every blocker has lethal damage. */
const gated = (p: DistributePrompt, a: Amounts, id: string) => id === trampleId(p) && !everyBlockerLethal(p, a);

/** Change one row by `by` (±1, ±5), kept between its minimum and what is left to assign. */
export function stepAmount(p: DistributePrompt, a: Amounts, id: string, by: number): Amounts {
  if (gated(p, a, id)) return a;
  const cur = a[id] ?? 0;
  const next = Math.max(minOf(p, id), Math.min(cur + by, cur + leftToAssign(p, a)));
  if (next === cur) return a;
  const out = { ...a, [id]: next };
  // A blocker below lethal sends the trampled player's damage back to the pool.
  const t = trampleId(p);
  if (t !== undefined && (out[t] ?? 0) > 0 && !everyBlockerLethal(p, out)) out[t] = 0;
  return out;
}

export const canStep = (p: DistributePrompt, a: Amounts, id: string, by: number) => stepAmount(p, a, id, by) !== a;

export function distributeConfirm(p: DistributePrompt, a: Amounts): Confirm {
  const left = leftToAssign(p, a);
  const under = p.recipients.some((r) => (a[r.id] ?? 0) < (r.min ?? 0));
  if (left !== 0 || under) return { enabled: false, label: left > 0 ? `Assign ${left} more` : `Assign ${-left} less` };
  const amounts = Object.fromEntries(p.recipients.map((r) => [r.id, a[r.id] ?? 0]));
  return { enabled: true, label: p.confirmLabel, answer: { shape: 'distribute', amounts } };
}

/* --- Number ---------------------------------------------------------------- */

/** What the field holds when the prompt opens. */
export function inputStart(p: InputPrompt): string {
  if (p.defaultValue !== undefined) return p.defaultValue;
  return p.kind === 'number' ? String(p.min ?? 0) : '';
}

export function rangeText(p: InputPrompt): string {
  const lo = p.min ?? 0;
  return p.max === undefined ? `${lo} or more` : `${lo}–${p.max}`;
}

function parseWhole(text: string): number | undefined {
  const t = text.trim();
  return /^-?\d+$/.test(t) ? Number(t) : undefined;
}

const inRange = (p: InputPrompt, n: number) => n >= (p.min ?? 0) && (p.max === undefined || n <= p.max);

/** The field after ↑/↓ (±1) or Shift+↑/↓ (±5), kept in the range. */
export function stepNumber(p: InputPrompt, text: string, by: number): string {
  const lo = p.min ?? 0;
  const n = parseWhole(text);
  if (n === undefined) return String(lo);
  const next = Math.max(lo, n + by);
  return String(p.max === undefined ? next : Math.min(p.max, next));
}

/* --- Name a card ------------------------------------------------------------- */

export const MAX_SUGGESTIONS = 8;

/** Names for the typed text: names starting with it, then a word starting with it, then containing it. */
export function suggestNames(names: CardNameOption[], query: string, limit = MAX_SUGGESTIONS): CardNameOption[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const rank = (n: string) => {
    const s = n.toLowerCase();
    if (s.startsWith(q)) return 0;
    if (s.split(/[\s,\-–—']+/).some((w) => w.startsWith(q))) return 1;
    return s.includes(q) ? 2 : -1;
  };
  return names
    .map((n) => ({ n, r: rank(n.name) }))
    .filter((x) => x.r >= 0)
    .sort((a, b) => a.r - b.r || a.n.name.localeCompare(b.n.name))
    .slice(0, limit)
    .map((x) => x.n);
}

export function exactName(names: CardNameOption[], text: string): CardNameOption | undefined {
  const t = text.trim().toLowerCase();
  return t ? names.find((n) => n.name.toLowerCase() === t) : undefined;
}

/* --- Confirm for the input shape -------------------------------------------- */

export function inputConfirm(p: InputPrompt, text: string): Confirm {
  const ok = (value: string): Confirm => ({ enabled: true, label: p.confirmLabel, answer: { shape: 'input', value } });
  if (p.kind === 'number') {
    if (!text.trim()) return { enabled: false, label: 'Enter a number' };
    const n = parseWhole(text);
    return n !== undefined && inRange(p, n) ? ok(String(n)) : { enabled: false, label: `Choose ${rangeText(p)}` };
  }
  if (p.kind === 'cardName') {
    const n = exactName(p.cardNames ?? [], text);
    return n ? ok(n.name) : { enabled: false, label: 'Choose a card name' };
  }
  return text.trim() ? ok(text.trim()) : { enabled: false, label: 'Type an answer' };
}
