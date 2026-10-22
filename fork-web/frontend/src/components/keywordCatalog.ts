/**
 * Keyword icons on permanents (spec: product-decisions-pass-3.md §3; approved
 * set and lines: docs/fork/design/keyword-icons.html). Glyphs come from the
 * Mana font 1.18.0 (Arena ability symbols); a test checks every codepoint
 * against the package's stylesheet and the reference sheet.
 */
import type { CardKeyword } from '../model/types';
import { tDynamic, t, type MsgKey } from '../i18n';

/** Mana font class (without "ms-") → codepoint. */
export const MANA_GLYPHS = {
  'ability-flying': 0xe952,
  'ability-reach': 0xe960,
  'ability-trample': 0xe964,
  'ability-deathtouch': 0xe94b,
  'ability-lifelink': 0xea4b,
  'ability-vigilance': 0xe968,
  'ability-haste': 0xe953,
  'ability-first-strike': 0xe950,
  'ability-double-strike': 0xe94d,
  'ability-menace': 0xe95d,
  'ability-defender': 0xe94c,
  'ability-hexproof': 0xe954,
  'ability-indestructible': 0xe95a,
  'ability-ward': 0xe992,
  'ability-toxic': 0xe9bf,
  'ability-prowess': 0xe982,
  'ability-exalted': 0xea33,
  'ability-afflict': 0xe977,
  'ability-afterlife': 0xe978,
  'ability-enlist': 0xe9ba,
  'ability-training': 0xe9b0,
  'ability-hexproof-white': 0xe959,
  'ability-hexproof-blue': 0xe956,
  'ability-hexproof-black': 0xe955,
  'ability-hexproof-red': 0xe958,
  'ability-hexproof-green': 0xe957,
  'ability-static': 0xe962,
  'ability-triggered': 0xe966,
} as const;

export type ManaGlyph = keyof typeof MANA_GLYPHS;

/** Display order after "added by another card": evasion, combat, protection, the rest. */
type Group = 'evasion' | 'combat' | 'protection' | 'other';
const GROUP_ORDER: Group[] = ['evasion', 'combat', 'protection', 'other'];

interface KeywordDef {
  glyph: ManaGlyph;
  group: Group;
  /** Catalogue key of the one-line explanation. */
  line: MsgKey;
}

const hexproofFrom = (colour: 'white' | 'blue' | 'black' | 'red' | 'green', line: MsgKey): KeywordDef => ({
  glyph: `ability-hexproof-${colour}`,
  group: 'protection',
  line,
});

/**
 * The approved set, keyed by lower-case label (for "Hexproof from …") or name.
 * Giving a long-tail keyword its own icon later is one entry here.
 */
const SET: Record<string, KeywordDef> = {
  flying: { glyph: 'ability-flying', group: 'evasion', line: 'kw.flying' },
  menace: { glyph: 'ability-menace', group: 'evasion', line: 'kw.menace' },
  reach: { glyph: 'ability-reach', group: 'combat', line: 'kw.reach' },
  trample: {
    glyph: 'ability-trample',
    group: 'combat',
    line: 'kw.trample',
  },
  deathtouch: { glyph: 'ability-deathtouch', group: 'combat', line: 'kw.deathtouch' },
  'first strike': {
    glyph: 'ability-first-strike',
    group: 'combat',
    line: 'kw.firstStrike',
  },
  'double strike': {
    glyph: 'ability-double-strike',
    group: 'combat',
    line: 'kw.doubleStrike',
  },
  lifelink: { glyph: 'ability-lifelink', group: 'combat', line: 'kw.lifelink' },
  vigilance: { glyph: 'ability-vigilance', group: 'combat', line: 'kw.vigilance' },
  haste: { glyph: 'ability-haste', group: 'combat', line: 'kw.haste' },
  defender: { glyph: 'ability-defender', group: 'combat', line: 'kw.defender' },
  toxic: {
    glyph: 'ability-toxic',
    group: 'combat',
    line: 'kw.toxic',
  },
  hexproof: { glyph: 'ability-hexproof', group: 'protection', line: 'kw.hexproof' },
  'hexproof from white': hexproofFrom('white', 'kw.hexproofWhite'),
  'hexproof from blue': hexproofFrom('blue', 'kw.hexproofBlue'),
  'hexproof from black': hexproofFrom('black', 'kw.hexproofBlack'),
  'hexproof from red': hexproofFrom('red', 'kw.hexproofRed'),
  'hexproof from green': hexproofFrom('green', 'kw.hexproofGreen'),
  indestructible: { glyph: 'ability-indestructible', group: 'protection', line: 'kw.indestructible' },
  ward: {
    glyph: 'ability-ward',
    group: 'protection',
    line: 'kw.ward',
  },
  prowess: {
    glyph: 'ability-prowess',
    group: 'other',
    line: 'kw.prowess',
  },
  exalted: {
    glyph: 'ability-exalted',
    group: 'other',
    line: 'kw.exalted',
  },
  afflict: {
    glyph: 'ability-afflict',
    group: 'other',
    line: 'kw.afflict',
  },
  afterlife: {
    glyph: 'ability-afterlife',
    group: 'other',
    line: 'kw.afterlife',
  },
  enlist: {
    glyph: 'ability-enlist',
    group: 'other',
    line: 'kw.enlist',
  },
  training: {
    glyph: 'ability-training',
    group: 'other',
    line: 'kw.training',
  },
};

/** Keywords that only work off the battlefield, plus enchant/equip: no icon (the inspector lists them). */
const NO_ICON = new Set(['flash', 'cycling', 'kicker', 'multikicker', 'flashback', 'cascade', 'convoke', 'enchant', 'equip']);

/** Long-tail keywords that trigger; every other one gets the generic "static" icon. */
const TRIGGERED = new Set([
  'annihilator',
  'battle cry',
  'bushido',
  'dethrone',
  'evolve',
  'exploit',
  'extort',
  'fabricate',
  'flanking',
  'ingest',
  'melee',
  'mentor',
  'myriad',
  'persist',
  'poisonous',
  'rampage',
  'renown',
  'soulshift',
  'undying',
]);

/** Generic-icon keywords that still sort with their group. */
const GENERIC_GROUP: Record<string, Group> = {
  protection: 'protection',
  shroud: 'protection',
  shadow: 'evasion',
  horsemanship: 'evasion',
  fear: 'evasion',
  intimidate: 'evasion',
  skulk: 'evasion',
};

export interface KeywordIcon {
  keyword: CardKeyword;
  glyph: ManaGlyph;
  /** The glyph's character in the Mana font. */
  char: string;
  group: Group;
}

function definition(k: CardKeyword): KeywordDef | undefined {
  return SET[k.label.toLowerCase()] ?? SET[k.name.toLowerCase()];
}

/** The icon a keyword gets on a permanent, or undefined for keywords drawn without one. */
export function keywordIcon(k: CardKeyword): KeywordIcon | undefined {
  const name = k.name.toLowerCase();
  const def = definition(k);
  if (!def && (NO_ICON.has(name) || name.endsWith('cycling'))) return undefined;
  const glyph: ManaGlyph = def?.glyph ?? (TRIGGERED.has(name) ? 'ability-triggered' : 'ability-static');
  return {
    keyword: k,
    glyph,
    char: String.fromCodePoint(MANA_GLYPHS[glyph]),
    group: def?.group ?? GENERIC_GROUP[name] ?? 'other',
  };
}

/** Keywords that get an icon, in display order: added by another card first, then by group. */
export function iconKeywords(keywords: CardKeyword[]): KeywordIcon[] {
  return keywords
    .map((k, i) => ({ icon: keywordIcon(k), i }))
    .filter((x): x is { icon: KeywordIcon; i: number } => x.icon !== undefined)
    .sort(
      (a, b) =>
        Number(!a.icon.keyword.grantedBy) - Number(!b.icon.keyword.grantedBy) ||
        GROUP_ORDER.indexOf(a.icon.group) - GROUP_ORDER.indexOf(b.icon.group) ||
        a.i - b.i,
    )
    .map((x) => x.icon);
}

/** One-line explanation: ours for the set, else the engine's reminder text. */
export function keywordLine(k: CardKeyword): string | undefined {
  const def = definition(k);
  return def ? tDynamic(def.line) : k.reminder;
}

/** "Granted by Swiftfoot Boots", plus "· until end of turn" when it wears off. */
export function grantedText(k: CardKeyword): string | undefined {
  const g = k.grantedBy;
  if (!g) return undefined;
  return t(g.untilEndOfTurn ? 'kw.grantedEot' : 'kw.granted', { name: g.name });
}

/** Screen-reader name of a keyword added by another card. */
export function grantedAria(k: CardKeyword): string {
  const g = k.grantedBy;
  if (!g) return k.label;
  return t(g.untilEndOfTurn ? 'kw.grantedAriaEot' : 'kw.grantedAria', { label: k.label, name: g.name });
}

/**
 * Card width tiers (CSS container queries pick one): l ≥ 110 px wide, m 72–109 px,
 * s up to 71 px (not in the spec: one slot). Below 3.25rem (52 px at 1080p, 41 px at
 * 768p) no icon shows: no room beside the state badges and group count.
 */
export type SizeTier = 'l' | 'm' | 's';
export const TIER_SLOTS: Record<SizeTier, number> = { l: 3, m: 2, s: 1 };
const TIERS: SizeTier[] = ['l', 'm', 's'];

export interface SlotPlan {
  /** Icon `index` (in display order) shows on the listed tiers. */
  icons: { index: number; tiers: SizeTier[] }[];
  /** A "+N" chip per tier where not every icon fits. */
  more: { tier: SizeTier; count: number }[];
}

/** Up to the tier's slot count; when there are more, the last slot becomes "+N". */
export function slotPlan(n: number): SlotPlan {
  const shownOn = (tier: SizeTier) => (n <= TIER_SLOTS[tier] ? n : TIER_SLOTS[tier] - 1);
  const icons: SlotPlan['icons'] = [];
  for (let index = 0; index < Math.min(n, TIER_SLOTS.l); index++) {
    const tiers = TIERS.filter((t) => index < shownOn(t));
    if (tiers.length) icons.push({ index, tiers });
  }
  const more = TIERS.filter((t) => n > TIER_SLOTS[t]).map((tier) => ({ tier, count: n - shownOn(tier) }));
  return { icons, more };
}
