export type LogPart =
  | { kind: 'text'; text: string }
  | { kind: 'card'; id: string; at: number }
  | { kind: 'mana'; symbol: string; at: number };

const TOKEN = /\{card:([^}]+)\}|\{([WUBRGCX]|\d+)\}/g;

/** Splits log text: {card:<id>} → card name, {R} / {2} / {X} → mana symbol; other braces stay text. `at` keys the part. */
export function logParts(text: string): LogPart[] {
  const parts: LogPart[] = [];
  let last = 0;
  for (const m of text.matchAll(TOKEN)) {
    if (m.index > last) parts.push({ kind: 'text', text: text.slice(last, m.index) });
    parts.push(m[1] !== undefined ? { kind: 'card', id: m[1], at: m.index } : { kind: 'mana', symbol: m[2]!, at: m.index });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ kind: 'text', text: text.slice(last) });
  return parts;
}
