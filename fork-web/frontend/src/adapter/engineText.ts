/**
 * Engine text → player text: the one step every engine-written string passes before the page shows it
 * (prompt titles and instructions, option labels, log lines, notices). Forge writes for its Swing screen:
 * card ids ("Ruin Rat (247)"), raw filter syntax ("Artifact.cmcLTX+YouCtrl"), stray separators, and the
 * seat's name where a pronoun belongs ("You has kept"). Fixed here as mechanisms, never per card.
 */

import type { CardView } from '../model/types';
import { t } from '../i18n';

/** "Ruin Rat (247)" → "Ruin Rat": the engine's card id after a name. */
export const stripCardIds = (s: string): string => s.replace(/(?<=\S) \(\d+\)(?!\d)/g, '');

/** Leading and trailing dashes of a line ("- Select…", "Beseech the Mirror -"); a minus sign ("-1:") stays. */
const tidyLine = (s: string): string =>
  s
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[-–—]+(?:\s+|$)/, '')
    .replace(/(?:^|\s)[-–—]+$/, '')
    .trim();

const lower = (s: string) => s.toLowerCase();
const upperFirst = (s: string) => (s ? s[0]!.toUpperCase() + s.slice(1) : s);

// --- raw filters: "Artifact.cmcLTX+YouCtrl" ---

/** Adjectives a filter property stands for, in front of the type. */
const ADJECTIVE = new Set([
  'White', 'Blue', 'Black', 'Red', 'Green', 'Colorless', 'Multicolor', 'Monocolor', 'Snow', 'Legendary', 'Basic', 'Token',
  'nontoken', 'tapped', 'untapped', 'attacking', 'Attacking', 'blocking', 'Blocking', 'enchanted', 'equipped', 'faceDown', 'token',
]);
const ADJECTIVE_WORD: Record<string, string> = { nontoken: 'nontoken', faceDown: 'face-down', Monocolor: 'monocolored', Multicolor: 'multicolored' };
const CONTROL: Record<string, string> = {
  YouCtrl: 'you control',
  OppCtrl: 'an opponent controls',
  YouDontCtrl: "you don't control",
  YouOwn: 'you own',
  OppOwn: 'an opponent owns',
};
const MEASURE: Record<string, string> = { cmc: 'mana value', power: 'power', toughness: 'toughness' };
const COMPARE_NUMBER: Record<string, (m: string, n: string) => string> = {
  EQ: (m, n) => `${m} ${n}`,
  NE: (m, n) => `${m} other than ${n}`,
  LE: (m, n) => `${m} ${n} or less`,
  LT: (m, n) => `${m} less than ${n}`,
  GE: (m, n) => `${m} ${n} or greater`,
  GT: (m, n) => `${m} greater than ${n}`,
};
/** A variable operand (X, the count of something) is not a number the player can read: compare in words. */
const COMPARE_VARIABLE: Record<string, (m: string) => string> = {
  EQ: (m) => `the same ${m}`,
  NE: (m) => `a different ${m}`,
  LE: (m) => `equal or lesser ${m}`,
  LT: (m) => `lesser ${m}`,
  GE: (m) => `equal or greater ${m}`,
  GT: (m) => `greater ${m}`,
};

/** One `Type.prop+prop` token as words: "artifact with lesser mana value you control". Unknown properties are left out. */
function filterWords(type: string, props: string[]): string {
  const before: string[] = [];
  const after: string[] = [];
  let control = '';
  let other = false;
  for (const p of props) {
    const cmp = /^(cmc|power|toughness)(EQ|NE|LE|LT|GE|GT)(.+)$/.exec(p);
    const withWord = /^with(out)?([A-Z][A-Za-z]*)$/.exec(p);
    if (CONTROL[p]) control = CONTROL[p];
    else if (p === 'Other') other = true;
    else if (ADJECTIVE.has(p)) before.push(ADJECTIVE_WORD[p] ?? lower(p));
    else if (/^non[A-Z]/.test(p)) before.push(`non-${lower(p.slice(3))}`);
    else if (cmp) {
      const measure = MEASURE[cmp[1]!]!;
      after.push(/^\d+$/.test(cmp[3]!) ? `with ${COMPARE_NUMBER[cmp[2]!]!(measure, cmp[3]!)}` : `with ${COMPARE_VARIABLE[cmp[2]!]!(measure)}`);
    } else if (withWord) after.push(`with${withWord[1] ? 'out' : ''} ${lower(withWord[2]!.replace(/([a-z])([A-Z])/g, '$1 $2'))}`);
  }
  return [other ? 'other' : '', ...before, lower(type), ...after, control].filter(Boolean).join(' ');
}

/** Types a filter starts with besides creature subtypes ("Goblin.YouCtrl" is recognised by its properties instead). */
const FILTER_TYPE = new Set([
  'Card', 'Permanent', 'Creature', 'Artifact', 'Enchantment', 'Land', 'Planeswalker', 'Battle', 'Instant', 'Sorcery', 'Spell', 'Player',
  'Opponent', 'Aura', 'Equipment', 'Vehicle', 'Saga', 'Basic',
]);
const KNOWN_PROP = /^(?:Other|non[A-Z]\w*|(?:cmc|power|toughness)(?:EQ|NE|LE|LT|GE|GT)\w+|with(?:out)?[A-Z]\w*)$/;

/**
 * Whether `Type.prop+prop` is a Forge filter and not a name with dots ("S.H.I.E.L.D. Flying Car", "M.O.D.O.K.", "B.O.B."):
 * every property is a word, never an initial, and the type is a filter type or some property is one the words know.
 */
const isFilter = (type: string, props: string[]): boolean =>
  props.every((p) => p.length >= 2) && (FILTER_TYPE.has(type) || props.some((p) => CONTROL[p] || ADJECTIVE.has(p) || KNOWN_PROP.test(p)));

/** Every raw `Type.prop+prop` token of a line as words ("Select target Artifact.cmcLTX+YouCtrl"). */
export function resolveFilters(s: string): string {
  return s.replace(/(?<![\w.])([A-Z][A-Za-z]*)\.([A-Za-z][A-Za-z0-9]*(?:[+.][A-Za-z][A-Za-z0-9]*)*)(?!\w)/g, (m, type: string, props: string) => {
    const list = props.split(/[+.]/);
    return isFilter(type, list) ? filterWords(type, list) : m;
  });
}

// --- zone searches: "Search your graveyard and exile?" ---

const PUBLIC_ZONES = /^(?:graveyard|exile|hand|battlefield|command zone)(?:(?:, | and | or )(?:graveyard|exile|hand|battlefield|command zone))*$/i;

/**
 * ChangeZoneEffect's optional prompt ("Search {player's} {zones}?") for zones that are not the library: "exile" reads as a
 * verb there ("search your graveyard and exile…"), and nobody searches a graveyard: "Look through your graveyard and exile zone?"
 */
function zoneSearch(line: string): string {
  const m = /^Search (your|their|.+?'s) (.+)\?$/.exec(line);
  if (!m || !PUBLIC_ZONES.test(m[2]!)) return line;
  return `Look through ${m[1]} ${m[2]!.replace(/\bexile\b(?! zone)/gi, 'exile zone')}?`;
}

// --- face-down cards: "Face-down card (H4)" ---

/** Where a sentence starts: the text's start, after a full stop, or after a card name's dash ("Opt - You scries 1."). */
const CLAUSE_START = /(?:^|[.!?]\s+|\s[-–—]\s+)$/;

/** What the viewer may call the face-down card with this hidden id (`H4`): its name or token; undefined keeps it face-down. */
export type FaceDownLookup = (hiddenId: number) => string | undefined;

/**
 * The lookup for one viewer's cards: a card with a hidden id is named only when the viewer may look at it (their own
 * morph, or a card that is face up now), never an opponent's face-down card. `asToken`: a log's {card:id} token.
 */
export function faceDownLookup(cards: Readonly<Record<string, CardView>>, asToken = false): FaceDownLookup {
  const byHiddenId = new Map<number, CardView>();
  for (const c of Object.values(cards)) {
    if (c.hiddenId !== undefined && (!c.faceDown || c.faceDown.seen)) byHiddenId.set(c.hiddenId, c);
  }
  return (hiddenId) => {
    const c = byHiddenId.get(hiddenId);
    return c ? (asToken ? `{card:${c.id}}` : c.name) : undefined;
  };
}

/** The engine writes a face-down card as "Face-down card (H4)" (CardView.toString): a hidden id is nothing a player can read. */
const faceDownWords = (s: string, lookup?: FaceDownLookup): string =>
  s.replace(/Face-down card \(H(\d+)\)/g, (_m, id: string, off: number, all: string) => {
    const named = lookup?.(Number(id));
    if (named) return named;
    const words = t('block.faceDown');
    return CLAUSE_START.test(all.slice(0, off)) ? upperFirst(words) : words;
  });

// --- tags and target lists: "… [Zone Changer: Boggart Brute]", "targeting [A, B]" ---

/** Index of the `]` closing the `[` at `open`; -1 when it never closes. */
function closingBracket(s: string, open: number): number {
  let depth = 0;
  for (let i = open; i < s.length; i++) {
    if (s[i] === '[') depth++;
    else if (s[i] === ']' && --depth === 0) return i;
  }
  return -1;
}

/** "[[A, B]]" → "A, B": a list the engine printed with its brackets. */
function unwrapList(s: string): string {
  let v = s.trim();
  while (v.startsWith('[') && closingBracket(v, 0) === v.length - 1) v = v.slice(1, -1).trim();
  return v;
}

/** The brackets of a target list ("targeting [A, B]", "(Targeting: [[AI 1]])"). */
function unwrapTargets(s: string): string {
  let out = '';
  let i = 0;
  const start = /\b(targeting:?)\s+\[/gi;
  for (let m = start.exec(s); m; m = start.exec(s)) {
    const open = m.index + m[0].length - 1;
    const end = closingBracket(s, open);
    if (end < 0 || m.index < i) continue;
    out += `${s.slice(i, m.index)}${m[1]} ${unwrapList(s.slice(open, end + 1))}`;
    i = end + 1;
    start.lastIndex = i;
  }
  return out + s.slice(i);
}

/** A trigger's own tag, a key and its values: "[Zone Changer: Boggart Brute]", "[Card: X, Activator: You, SpellAbility: …]". */
const TAG_START = /\[([A-Z][A-Za-z]*(?: [A-Za-z]+){0,2}): /g;
const MORE_KEYS = /, [A-Z][A-Za-z]*(?: [A-Za-z]+){0,2}: /;

/**
 * What a tag says in player words. Forge appends "[Key: value]" to a trigger's text for its own bookkeeping: dropped, unless
 * `keep` (see `tellApart`), then "(for Boggart Brute)" for a tag with one value the text does not already name.
 */
function tagWords(key: string, raw: string, text: string, keep: boolean): string {
  if (!keep || key === 'Phase' || MORE_KEYS.test(raw)) return '';
  const value = unwrapList(raw);
  return !value || /^\d+$/.test(value) || text.includes(value) ? '' : `(for ${value})`;
}

function tagsAsWords(s: string, keep: boolean): string {
  let out = '';
  let i = 0;
  for (;;) {
    TAG_START.lastIndex = i;
    const m = TAG_START.exec(s);
    if (!m) break;
    const end = closingBracket(s, m.index);
    if (end < 0) {
      out += s.slice(i, m.index + 1);
      i = m.index + 1;
      continue;
    }
    out += s.slice(i, m.index);
    out += tagWords(m[1]!, s.slice(m.index + m[0].length, end), out + s.slice(end + 1), keep);
    i = end + 1;
  }
  return unwrapTargets(out + s.slice(i));
}

/** One engine line as player words. */
const cleanLine = (line: string, faceDown?: FaceDownLookup, keepTags = false): string =>
  zoneSearch(tidyLine(resolveFilters(tagsAsWords(faceDownWords(stripCardIds(line), faceDown), keepTags))));

/**
 * An engine message as player words: card ids, raw filters and stray dashes gone, a line the engine repeats shown once,
 * empty lines dropped. Lines stay lines (the caller splits title and instruction). A repeat is judged with the ids still on,
 * so a list of two cards of one name ("Goblin (45)", "Goblin (46)") keeps both.
 */
export function engineText(s: string, faceDown?: FaceDownLookup, keepTags = false): string {
  const out: string[] = [];
  let prev = '';
  for (const raw of s.split('\n')) {
    const key = tidyLine(raw);
    const line = cleanLine(raw, faceDown, keepTags);
    if (line && key !== prev) out.push(line);
    if (line) prev = key;
  }
  return out.join('\n');
}

/**
 * A list of engine texts as player words (`words(raw, keepTags)`: engineText or engineLog). Items that read the same once
 * the tags are gone (`key` equal too: the same source) keep what the tag says, "(for Boggart Brute)": three Mimic Vat
 * triggers, one per creature that died. All other items stay without it.
 */
export function tellApart(items: { text: string; key?: string }[], words: (raw: string, keepTags: boolean) => string): string[] {
  const plain = items.map((i) => words(i.text, false));
  const count = new Map<string, number>();
  const id = (i: number) => `${items[i]!.key ?? ''}\n${plain[i]}`;
  plain.forEach((_p, i) => count.set(id(i), (count.get(id(i)) ?? 0) + 1));
  return plain.map((p, i) => ((count.get(id(i)) ?? 0) > 1 ? words(items[i]!.text, true) : p));
}

// --- the seat is "You" ---

/** A third-person present verb agreeing with "you": has → have, loses → lose, searches → search, scries → scry. */
function agree(word: string): string {
  const neg = /^(.+)n['’]t$/.exec(word);
  return neg ? `${agreeVerb(neg[1]!)}n't` : agreeVerb(word);
}

function agreeVerb(verb: string): string {
  const irregular: Record<string, string> = { has: 'have', is: 'are', does: 'do', was: 'were', goes: 'go' };
  if (irregular[verb]) return irregular[verb];
  if (verb.length > 3 && verb.endsWith('ies')) return `${verb.slice(0, -3)}y`;
  if (/(ss|sh|ch|x|z)es$/.test(verb)) return verb.slice(0, -2);
  return verb.endsWith('s') && !verb.endsWith('ss') ? verb.slice(0, -1) : verb;
}

/** A verb after a comma, "then" or "and" whose subject is the seat: "reveals it, puts it into their hand, then shuffles". */
const NEXT_VERB =
  /(, (?:then )?|\bthen |\band )([a-z]+s)\b(?=\s+(?:it|them|their|your|a|an|the|that|those|this|each|up|one|two|three|all|another|its|\d)\b|(?<=\bthen \w+)(?=\s*(?:[,.;]|$)))/g;

/** The rest of a clause whose subject is the seat: "their" is "your" ("their owner's" stays: the cards' owner), later verbs agree. */
const agreeRest = (rest: string): string =>
  rest
    .replace(/\btheir\b(?!\s+owner)/g, 'your')
    .replace(/\bthemselves\b/g, 'yourself')
    .replace(NEXT_VERB, (_m, lead: string, verb: string) => `${lead}${agreeVerb(verb)}`);

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Forge writes the seat's name where English wants "you": "You has kept", "You searches their library". As the subject of
 * a sentence the seat is "You" with the verb agreeing (and "their" → "your" in that clause); after a preposition and as a
 * possessive it is "you" / "your". The name elsewhere stays (rules text, card names such as "Young Pyromancer").
 */
export function youGrammar(text: string, seatName: string): string {
  const name = seatName.trim();
  if (!name) return text;
  const n = escapeRe(name);
  return text
    .replace(new RegExp(`(?<![\\w'’])${n}['’]s(?!\\w)`, 'g'), (_m, off: number, all: string) =>
      CLAUSE_START.test(all.slice(0, off)) ? 'Your' : 'your',
    )
    .replace(new RegExp(`(?<![\\w'’])${n}\\s+([a-z]+n['’]t|[a-z]+)\\b([^.!?\\n]*)`, 'g'), (m, verb: string, rest: string, off: number, all: string) => {
      if (!CLAUSE_START.test(all.slice(0, off))) return m;
      return `You ${agree(verb)}${agreeRest(rest)}`;
    })
    .replace(new RegExp(`\\b(to|on|from|of|with|by|for|against|at|targets?|targeting|controls?)\\s+${n}(?![\\w'’]|\\s+[A-Z])`, 'g'), '$1 you');
}

/** A log line: engine words, then the seat as "you". */
export function engineLog(text: string, seatName?: string, faceDown?: FaceDownLookup, keepTags = false): string {
  const words = engineText(text, faceDown, keepTags);
  return seatName ? youGrammar(words, seatName) : words;
}

/** A dialog the engine shows (IGuiGame.message): its default title "Forge" is no title. */
export function engineNotice(message: string, title?: string): string {
  const head = title && !/^Forge$/i.test(title.trim()) ? engineText(title) : '';
  return [head, engineText(message)].filter(Boolean).join(': ');
}

// --- targeting steps ---

const MORE_TARGETS = /^\(\d+ more can be targeted\)$/;

/**
 * What an InputSelectTargets message asks, as one line. The message is the prompt, then the targets chosen so far
 * ("Targeted:" and one name per line) and "(N more can be targeted)"; with detailed spell text the ability's description
 * comes first. The instruction is the prompt line, with the count after it.
 */
export function targetInstruction(message: string): string {
  const lines = message.split('\n').map((l) => l.trim()).filter(Boolean);
  let more = '';
  const kept: string[] = [];
  let listing = false;
  for (const l of lines) {
    if (MORE_TARGETS.test(l)) more = l;
    else if (/^(?:Parent )?Targeted:/.test(l)) listing = true;
    else if (!listing) kept.push(l);
  }
  const text = engineText(kept.join('\n')).split('\n').at(-1) || 'Choose';
  return more ? `${text} ${more}` : text;
}

// --- "X unless you Y" ---

const UNLESS = /^(?:You )?(.+?) unless (?:you|that player|they) (.+?)\.?$/i;

/**
 * An option the engine words as its effect ("You lose 3 life unless you sacrifice a nonland permanent.", Torment of
 * Hailfire) as the choice it is: what you pay, then what happens otherwise ("Sacrifice a nonland permanent, or lose 3
 * life"). Undefined for any other label.
 */
export function unlessChoice(label: string): string | undefined {
  const m = UNLESS.exec(label.trim());
  return m ? `${upperFirst(m[2]!)}, or ${m[1]}` : undefined;
}

/** The effect that happens when no option is paid, when every label is an "unless" of the same effect. */
export function unlessEffect(labels: string[]): string | undefined {
  if (labels.length < 2) return undefined;
  const effects = labels.map((l) => UNLESS.exec(l.trim())?.[1]);
  return effects.every((e) => e && e === effects[0]) ? effects[0] : undefined;
}
