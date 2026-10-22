/**
 * Combat damage forecasts for the main button (issue #79), from what the engine says: every attack on you or on
 * your planeswalkers and battles (`combat.attacks`), the blocks so far, each attacker's power and keywords. Where an
 * exact figure can't be known (a blocked attacker with trample) it is a range, never a guess.
 */
import type { Block, CardId, CardView, GameView } from '../model/types';

const has = (c: CardView, keyword: string) => c.keywords.some((k) => k.name.toLowerCase() === keyword);

/** Combat damage the creature deals if nothing stops it: its power, twice with double strike. */
export function strikeDamage(c: CardView | undefined): number {
  if (!c) return 0;
  const power = Math.max(0, c.power ?? 0);
  return has(c, 'double strike') ? 2 * power : power;
}

/** Damage still lethal to a blocker: its toughness less the damage marked, 1 when the attacker has deathtouch. */
function lethal(blocker: CardView | undefined, attacker: CardView): number {
  const left = Math.max(0, (blocker?.toughness ?? 0) - (blocker?.damage ?? 0));
  return left > 0 && has(attacker, 'deathtouch') ? 1 : left;
}

export interface Range {
  min: number;
  max: number;
}

const add = (a: Range, b: Range): Range => ({ min: a.min + b.min, max: a.max + b.max });
const ZERO: Range = { min: 0, max: 0 };

export interface Incoming {
  /** Attacks on you or on your planeswalkers and battles. */
  attacks: number;
  /** Combat damage to you. */
  you: Range;
  /** Poison counters you get (infect). */
  poison: Range;
  /** Damage to each of your planeswalkers and battles attacked, in attack order. */
  cards: { cardId: CardId; damage: Range }[];
}

/**
 * What the attackers would deal you with `blocks` declared: an unblocked attacker its strike damage; a blocked one
 * nothing, or with trample from 0 up to the excess over its blockers' lethal damage (the attacker divides it).
 */
export function incoming(game: GameView, blocks: Block[]): Incoming {
  const out: Incoming = { attacks: 0, you: ZERO, poison: ZERO, cards: [] };
  for (const a of game.combat?.attacks ?? []) {
    if (a.defenderId !== game.youId) continue;
    const attacker = game.cards[a.attackerId];
    if (!attacker) continue;
    out.attacks += 1;
    const blockers = blocks.filter((b) => b.attackerId === a.attackerId).map((b) => game.cards[b.blockerId]);
    const total = strikeDamage(attacker);
    const dealt: Range = !blockers.length
      ? { min: total, max: total }
      : has(attacker, 'trample')
        ? { min: 0, max: Math.max(0, total - blockers.reduce((s, b) => s + lethal(b, attacker), 0)) }
        : ZERO;
    if (a.defenderCardId) {
      const prev = out.cards.find((x) => x.cardId === a.defenderCardId);
      if (prev) prev.damage = add(prev.damage, dealt);
      else out.cards.push({ cardId: a.defenderCardId, damage: dealt });
    } else if (has(attacker, 'infect')) out.poison = add(out.poison, dealt);
    else out.you = add(out.you, dealt);
  }
  return out;
}

const amount = (r: Range) => (r.min === r.max ? `${r.min}` : r.min === 0 ? `up to ${r.max}` : `${r.min} to ${r.max}`);

/** "You take 9 damage", "You take 2 to 5 damage · Chandra, Torch of Defiance takes 2 damage". */
export function incomingText(game: GameView, f: Incoming): string {
  const parts: string[] = [];
  const onCards = f.cards.length > 0;
  const poison = f.poison.max > 0;
  const onYou = f.attacks > f.cards.length;
  if (!(onCards || poison) || (onYou && (f.you.max > 0 || !poison))) parts.push(`You take ${amount(f.you)} damage`);
  if (poison) parts.push(`You get ${amount(f.poison)} poison counter${f.poison.max === 1 ? '' : 's'}`);
  for (const c of f.cards) parts.push(`${game.cards[c.cardId]?.name ?? 'Your permanent'} takes ${amount(c.damage)} damage`);
  return parts.join(' · ');
}
