/**
 * Engine text → player text: the one step every engine-written string passes before the page shows it
 * (prompt titles and instructions, option labels, log lines, notices). Forge writes for its Swing screen:
 * card ids ("Ruin Rat (247)"), raw filter syntax ("Artifact.cmcLTX+YouCtrl"), stray separators, and the
 * seat's name where a pronoun belongs ("You has kept"). Fixed here as mechanisms, never per card.
 */

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

/** One engine line as player words. */
const cleanLine = (line: string): string => zoneSearch(tidyLine(resolveFilters(stripCardIds(line))));

/**
 * An engine message as player words: card ids, raw filters and stray dashes gone, a line the engine repeats shown once,
 * empty lines dropped. Lines stay lines (the caller splits title and instruction). A repeat is judged with the ids still on,
 * so a list of two cards of one name ("Goblin (45)", "Goblin (46)") keeps both.
 */
export function engineText(s: string): string {
  const out: string[] = [];
  let prev = '';
  for (const raw of s.split('\n')) {
    const key = tidyLine(raw);
    const line = cleanLine(raw);
    if (line && key !== prev) out.push(line);
    if (line) prev = key;
  }
  return out.join('\n');
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

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const SENTENCE_START = /(?:^|[.!?]\s+)$/;

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
      SENTENCE_START.test(all.slice(0, off)) ? 'Your' : 'your',
    )
    .replace(new RegExp(`(?<![\\w'’])${n}\\s+([a-z]+n['’]t|[a-z]+)\\b([^.!?\\n]*)`, 'g'), (m, verb: string, rest: string, off: number, all: string) => {
      if (!SENTENCE_START.test(all.slice(0, off))) return m;
      return `You ${agree(verb)}${rest.replace(/\btheir\b/g, 'your').replace(/\bthemselves\b/g, 'yourself')}`;
    })
    .replace(new RegExp(`\\b(to|on|from|of|with|by|for|against|at|targets?|targeting|controls?)\\s+${n}(?![\\w'’]|\\s+[A-Z])`, 'g'), '$1 you');
}

/** A log line: engine words, then the seat as "you". */
export function engineLog(text: string, seatName?: string): string {
  const t = engineText(text);
  return seatName ? youGrammar(t, seatName) : t;
}

/** A dialog the engine shows (IGuiGame.message): its default title "Forge" is no title. */
export function engineNotice(message: string, title?: string): string {
  const t = title && !/^Forge$/i.test(title.trim()) ? engineText(title) : '';
  return [t, engineText(message)].filter(Boolean).join(': ');
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
