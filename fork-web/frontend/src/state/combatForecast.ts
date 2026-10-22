/**
 * Combat damage forecasts for the main button (issue #79), from what the engine says: every attack on you or on
 * your planeswalkers and battles (`combat.attacks`), the blocks so far, each attacker's power and keywords. Where an
 * exact figure can't be known (a blocked attacker with trample) it is a range, never a guess.
 */
import type { Block, CardId, CardView, GameView } from '../model/types';
import { t } from '../i18n';

const has = (c: CardView, keyword: string) => c.keywords.some((k) => k.name.toLowerCase() === keyword);

/** Poison counters per combat damage hit to a player: the sum of its Toxic N. */
const toxic = (c: CardView) =>
  c.keywords.filter((k) => k.name.toLowerCase() === 'toxic').reduce((s, k) => s + (Number(/\d+/.exec(k.label)?.[0]) || 0), 0);

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
  /** Attacks on you (the player, not your planeswalkers and battles). */
  onYou: number;
  /** Combat damage to you. */
  you: Range;
  /** Poison counters you get (infect, toxic). */
  poison: Range;
  /** Damage to each of your planeswalkers and battles attacked, in attack order. */
  cards: { cardId: CardId; damage: Range }[];
}

/**
 * What the attackers would deal you with `blocks` declared: an unblocked attacker its strike damage; a blocked one
 * nothing, or with trample from 0 up to the excess over its blockers' lethal damage (the attacker divides it).
 */
export function incoming(game: GameView, blocks: Block[]): Incoming {
  const out: Incoming = { onYou: 0, you: ZERO, poison: ZERO, cards: [] };
  for (const a of game.combat?.attacks ?? []) {
    if (a.defenderId !== game.youId) continue;
    const attacker = game.cards[a.attackerId];
    if (!attacker) continue;
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
      continue;
    }
    out.onYou += 1;
    if (has(attacker, 'infect')) out.poison = add(out.poison, dealt);
    else out.you = add(out.you, dealt);
    // Toxic: N poison counters each time it deals you combat damage (twice with double strike).
    const t = toxic(attacker) * (has(attacker, 'double strike') ? 2 : 1);
    if (t) out.poison = add(out.poison, { min: dealt.min > 0 ? t : 0, max: dealt.max > 0 ? t : 0 });
  }
  return out;
}

const amount = (r: Range) => (r.min === r.max ? `${r.min}` : r.min === 0 ? t('pa.upTo', { max: r.max }) : t('pa.range', { min: r.min, max: r.max }));

/** "You take 9 damage", "You take 2 to 5 damage · Chandra, Torch of Defiance takes 2 damage". */
export function incomingText(game: GameView, f: Incoming): string {
  const parts: string[] = [];
  const onCards = f.cards.length > 0;
  const poison = f.poison.max > 0;
  const onYou = f.onYou > 0;
  if (!(onCards || poison) || (onYou && (f.you.max > 0 || !poison))) parts.push(t('fc.take', { amount: amount(f.you) }));
  if (poison) parts.push(t('fc.poison', { amount: amount(f.poison), count: f.poison.max }));
  for (const c of f.cards) parts.push(t('fc.cardTakes', { name: game.cards[c.cardId]?.name ?? t('fc.yourPermanent'), amount: amount(c.damage) }));
  return parts.join(' · ');
}
