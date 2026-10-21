/**
 * Just enough fake rules for the mock to feel alive. The real engine owns
 * all of this; nothing here survives into the bridged UI.
 */
import type { CardView, ManaColour } from '../model/types';
import { currentFace, isCreature } from '../model/selectors';

export type TargetSpec = 'creature' | 'permanent' | 'nonlandPermanent' | 'yourCreature';

export interface StaticBonus {
  power: number;
  toughness: number;
  keywords: string[];
}

/** An activated ability the mock knows (clicking the permanent with priority activates it). */
export interface AbilityRule {
  /** Shown while paying and on the stack, e.g. "Equip {1}". */
  label: string;
  /** Mana cost; "" when it has none. */
  cost: string;
  target?: { spec: TargetSpec; instruction: string };
  sorcerySpeed?: boolean;
  /** Sacrificing the permanent is part of the cost. */
  sacrifice?: boolean;
}

export interface CardRule {
  target?: { spec: TargetSpec; instruction: string };
  flash?: boolean;
  /** Bonus to the permanent this card is attached to. */
  attachBonus?: StaticBonus;
  /** Bonus to other permanents its controller controls that match. */
  anthem?: StaticBonus & { applies: (c: CardView) => boolean };
  ability?: AbilityRule;
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
  'Swiftfoot Boots': {
    attachBonus: { power: 0, toughness: 0, keywords: ['Hexproof', 'Haste'] },
    ability: {
      label: 'Equip {1}',
      cost: '{1}',
      target: { spec: 'yourCreature', instruction: 'Choose a creature you control to equip' },
      sorcerySpeed: true,
    },
  },
  'Goblin Chieftain': {
    anthem: { power: 1, toughness: 1, keywords: ['Haste'], applies: (c) => /Goblin/.test(c.front.typeLine) },
  },
  'Avacyn, Angel of Hope': { anthem: { power: 0, toughness: 0, keywords: ['Indestructible'], applies: () => true } },
  'Selfless Spirit': { ability: { label: 'Sacrifice Selfless Spirit', cost: '', sacrifice: true } },
};

export function rule(c: CardView): CardRule {
  return RULES[c.front.name] ?? {};
}

export interface ManaAbility {
  /** Kinds one activation can add; several means you pick one. */
  colours: ManaColour[];
  /** Mana added per activation (Sol Ring: 2). */
  amount: number;
}

const WUBRG: ManaColour[] = ['W', 'U', 'B', 'R', 'G'];

/**
 * The card's "{T}: Add …" ability, read from its oracle text (a line of its
 * own, reminder text included). `identity`: the colours "your commander's
 * color identity" means. Abilities with a variable amount are ignored.
 */
export function manaAbility(c: CardView, identity: ManaColour[] = WUBRG): ManaAbility | undefined {
  const m = /^\(?\{T\}: Add ([^.]+)\./m.exec(currentFace(c).oracleText);
  if (!m) return undefined;
  const what = m[1]!;
  if (/one mana of any color in your commander/i.test(what)) return { colours: identity.length ? identity : WUBRG, amount: 1 };
  if (/one mana of any color/i.test(what)) return { colours: WUBRG, amount: 1 };
  const symbols = [...what.matchAll(/\{([WUBRGC])\}/g)].map((x) => x[1] as ManaColour);
  if (symbols.length === 0) return undefined;
  if (/ or |,/.test(what)) return { colours: [...new Set(symbols)], amount: 1 };
  return { colours: [symbols[0]!], amount: symbols.length };
}

/** Mana the permanent can add right now (0 when tapped or summoning sick). */
export function producesMana(c: CardView): number {
  if (c.tapped || (isCreature(c) && c.summoningSick)) return 0;
  return manaAbility(c)?.amount ?? 0;
}
