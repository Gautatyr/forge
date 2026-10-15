/**
 * Just enough fake rules for the mock to feel alive. The real engine owns
 * all of this; nothing here survives into the bridged UI.
 */
import type { CardView } from '../model/types';
import { isCreature } from '../model/selectors';

export type TargetSpec = 'creature' | 'permanent' | 'nonlandPermanent' | 'yourCreature';

export interface StaticBonus {
  power: number;
  toughness: number;
  keywords: string[];
}

export interface CardRule {
  target?: { spec: TargetSpec; instruction: string };
  flash?: boolean;
  /** Bonus to the permanent this card is attached to. */
  attachBonus?: StaticBonus;
  /** Bonus to other permanents its controller controls that match. */
  anthem?: StaticBonus & { applies: (c: CardView) => boolean };
  /** Mana it adds when tapped by the fake auto-payer (lands are 1 by default). */
  mana?: number;
  /** Alternative cost to cast from the graveyard. */
  flashback?: string;
}

export const RULES: Record<string, CardRule> = {
  'Lightning Bolt': { target: { spec: 'creature', instruction: 'Choose a creature to deal 3 damage to' } },
  'Swords to Plowshares': { target: { spec: 'creature', instruction: 'Choose a creature to exile' } },
  'Path to Exile': { target: { spec: 'creature', instruction: 'Choose a creature to exile' } },
  'Beast Within': { target: { spec: 'permanent', instruction: 'Choose a permanent to destroy' } },
  'Generous Gift': { target: { spec: 'permanent', instruction: 'Choose a permanent to destroy' } },
  'Ram Through': { target: { spec: 'yourCreature', instruction: 'Choose a creature you control' } },
  "Moment's Peace": { flashback: '{2}{G}' },
  Rancor: { attachBonus: { power: 2, toughness: 0, keywords: ['Trample'] } },
  'Swiftfoot Boots': { attachBonus: { power: 0, toughness: 0, keywords: ['Hexproof', 'Haste'] } },
  'Goblin Chieftain': {
    anthem: { power: 1, toughness: 1, keywords: ['Haste'], applies: (c) => /Goblin/.test(c.front.typeLine) },
  },
  'Avacyn, Angel of Hope': { anthem: { power: 0, toughness: 0, keywords: ['Indestructible'], applies: () => true } },
  'Sol Ring': { mana: 2 },
  'Arcane Signet': { mana: 1 },
  'Elvish Mystic': { mana: 1 },
  'Llanowar Elves': { mana: 1 },
  'Noble Hierarch': { mana: 1 },
};

export function rule(c: CardView): CardRule {
  return RULES[c.front.name] ?? {};
}

export function producesMana(c: CardView): number {
  const r = rule(c);
  if (r.mana !== undefined) return isCreature(c) && c.summoningSick ? 0 : r.mana;
  return /\bLand\b/.test((c.transformed && c.back ? c.back : c.front).typeLine) ? 1 : 0;
}
