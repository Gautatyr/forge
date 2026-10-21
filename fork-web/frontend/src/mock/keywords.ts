/**
 * Printed keywords for mock cards, read from oracle text. The engine knows
 * them directly (CardStateView.getKeywords); the bridge will send them.
 */
import type { CardKeyword } from '../model/types';

/** Keywords the mock recognises, with how their value is written. */
const PATTERNS: RegExp[] = [
  /^(flying|reach|trample|deathtouch|lifelink|vigilance|haste|first strike|double strike|menace|defender|indestructible|prowess|exalted|shroud|infect|flash|cascade|convoke|changeling|wither|fear|intimidate|shadow|skulk)$/i,
  /^(hexproof)( from \w+)?$/i,
  /^(protection) from .+$/i,
  /^(ward|equip|kicker|flashback|cycling|\w+cycling) \{.+\}$/i,
  /^(toxic|annihilator|afflict|afterlife|bushido|rampage|exploit|fabricate) \d+$/i,
  /^(enchant) .+$/i,
];

function parsePart(part: string): { name: string; label: string } | undefined {
  for (const re of PATTERNS) {
    const m = re.exec(part);
    if (m) {
      const label = part.charAt(0).toUpperCase() + part.slice(1);
      const name = m[1]!.charAt(0).toUpperCase() + m[1]!.slice(1).toLowerCase();
      return { name, label };
    }
  }
  return undefined;
}

/** Keyword lines ("Flying, vigilance", "Ward {2} (reminder…)"); other lines are abilities. */
export function printedKeywords(oracleText: string): CardKeyword[] {
  const out: CardKeyword[] = [];
  for (const raw of oracleText.split('\n')) {
    const reminder = /\(([^)]*)\)\s*$/.exec(raw)?.[1];
    const line = raw.replace(/\s*\([^)]*\)\s*$/, '').trim();
    if (!line) continue;
    const parts = line.split(/,\s*/).map(parsePart);
    if (parts.some((p) => !p)) continue;
    const found = parts as { name: string; label: string }[];
    // A reminder after a line of several keywords explains only the last one.
    found.forEach((p, i) => out.push(reminder && i === found.length - 1 ? { ...p, reminder } : p));
  }
  return out;
}

/** A keyword written as on a card ("Trample", "Ward {2}") as name + label. */
export function keyword(label: string): { name: string; label: string } {
  return parsePart(label) ?? { name: label, label };
}
