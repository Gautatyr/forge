/**
 * UI strings in English and French. Catalogues: `en.ts` (the source of the key type) and `fr.ts`
 * (`Record<MsgKey, Msg>`: a missing French key fails `tsc`). `t(key, params)` reads the current
 * language, set once per render by the match provider from the `language` pref.
 *
 * A message is a string with `{name}` placeholders, or `{ one, other }` for a plural chosen by the
 * `count` param (Intl.PluralRules; French treats 0 and 1 as singular). Placeholders are typed from the
 * English text. Engine-generated prompt and log text is not in the catalogues: it stays English.
 */
import { en } from './en';
import { fr } from './fr';

export type Lang = 'en' | 'fr';
export const LANGS: readonly Lang[] = ['en', 'fr'];

export type Msg = string | { readonly one: string; readonly other: string };
export type MsgKey = keyof typeof en;

type Text<K extends MsgKey> = (typeof en)[K] extends { readonly other: infer O } ? O : (typeof en)[K];
type Vars<S> = S extends `${string}{${infer P}}${infer R}` ? P | Vars<R> : never;
type Plural<K extends MsgKey> = (typeof en)[K] extends { readonly other: string } ? 'count' : never;
type Names<K extends MsgKey> = Vars<Text<K>> | Plural<K>;
type Params<K extends MsgKey> = [Names<K>] extends [never] ? [] : [params: Record<Names<K>, string | number>];

const CATALOGUES: Record<Lang, Record<MsgKey, Msg>> = { en, fr };

let current: Lang = 'en';
const RULES: Record<Lang, Intl.PluralRules> = { en: new Intl.PluralRules('en'), fr: new Intl.PluralRules('fr') };

export function setLanguage(lang: Lang) {
  current = lang;
}

export function getLanguage(): Lang {
  return current;
}

/** 'fr' when the browser prefers French, else 'en'. */
export function defaultLanguage(navigatorLanguage?: string): Lang {
  const l = navigatorLanguage ?? (typeof navigator === 'undefined' ? '' : navigator.language);
  return l.toLowerCase().startsWith('fr') ? 'fr' : 'en';
}

export function parseLanguage(raw: unknown): Lang | undefined {
  return raw === 'en' || raw === 'fr' ? raw : undefined;
}

function fill(text: string, params: Record<string, string | number> | undefined): string {
  return params ? text.replace(/\{(\w+)\}/g, (m, k: string) => (k in params ? String(params[k]) : m)) : text;
}

/** Message in an explicit language (tests, the catalogue parity check). */
export function translate(lang: Lang, key: MsgKey, params?: Record<string, string | number>): string {
  const msg = CATALOGUES[lang][key];
  if (typeof msg === 'string') return fill(msg, params);
  const count = Number(params?.['count']);
  const form = RULES[lang].select(count) === 'one' ? msg.one : msg.other;
  return fill(form, params);
}

export function t<K extends MsgKey>(key: K, ...args: Params<K>): string {
  return translate(current, key, args[0] as Record<string, string | number> | undefined);
}

/** Message by a key built at run time (`step.${id}`): placeholders are not checked. */
export function tDynamic(key: MsgKey, params?: Record<string, string | number>): string {
  return translate(current, key, params);
}

/** Every message of one language, for the parity and hard-coded-text tests. */
export function catalogue(lang: Lang): Record<string, Msg> {
  return CATALOGUES[lang];
}

/** BCP 47 tag of the current language, for Intl formatting. */
export function uiLocale(): string {
  return current === 'fr' ? 'fr-FR' : 'en-US';
}
