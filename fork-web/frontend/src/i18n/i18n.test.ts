import { afterEach, describe, expect, it } from 'vitest';
import { catalogue, defaultLanguage, getLanguage, LANGS, parseLanguage, setLanguage, t, translate, type Lang } from './index';
import { primaryAction } from '../state/primaryAction';
import { PRIORITY_STEPS, GROUP_CAPTIONS } from '../model/phases';
import { ordinal } from '../state/gameEnd';
import { shortcuts } from '../state/keymap';
import { keywordLine } from '../components/keywordCatalog';
import { scenarioById } from '../mock/scenarios';
import { INITIAL_UI } from '../state/ui';
import { DEFAULT_STOPS } from '../state/prefs';

afterEach(() => setLanguage('en'));

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!).sort();
const forms = (m: string | { one: string; other: string }) => (typeof m === 'string' ? [m] : [m.one, m.other]);

describe('catalogues', () => {
  const en = catalogue('en');
  const fr = catalogue('fr');

  it('French has exactly the English keys', () => {
    expect(Object.keys(fr).sort()).toEqual(Object.keys(en).sort());
  });

  it.each(Object.keys(en))('%s: same shape and placeholders in both languages, nothing empty', (key) => {
    const e = forms(en[key]!);
    const f = forms(fr[key]!);
    expect(f).toHaveLength(e.length);
    e.forEach((text, i) => {
      expect(text.trim()).not.toBe('');
      expect(f[i]!.trim()).not.toBe('');
      // `count` may be implied by the plural; every other placeholder must match.
      const strip = (xs: string[]) => xs.filter((x) => x !== 'count');
      expect(strip(placeholders(f[i]!))).toEqual(strip(placeholders(text)));
    });
  });

  it('is actually translated: most French text differs from the English', () => {
    const same = Object.keys(en).filter((k) => JSON.stringify(en[k]) === JSON.stringify(fr[k]));
    expect(same.length / Object.keys(en).length).toBeLessThan(0.1);
  });
});

describe('t()', () => {
  it('fills {placeholders}', () => {
    expect(t('pa.waitingFor', { name: 'Theo' })).toBe('Waiting for Theo');
    setLanguage('fr');
    expect(t('pa.waitingFor', { name: 'Théo' })).toBe('En attente de Théo');
  });

  it('keeps an unknown placeholder visible rather than dropping it', () => {
    expect(translate('en', 'pa.waitingFor', {})).toBe('Waiting for {name}');
  });

  it('plurals: English splits at 1, French treats 0 and 1 as singular', () => {
    expect(translate('en', 'atk.cap', { count: 1 })).toBe('At most 1 creature can attack together.');
    expect(translate('en', 'atk.cap', { count: 0 })).toBe('At most 0 creatures can attack together.');
    expect(translate('en', 'atk.cap', { count: 2 })).toBe('At most 2 creatures can attack together.');
    expect(translate('fr', 'atk.cap', { count: 0 })).toBe('0 créature au maximum peut attaquer en même temps.');
    expect(translate('fr', 'atk.cap', { count: 1 })).toBe('1 créature au maximum peut attaquer en même temps.');
    expect(translate('fr', 'atk.cap', { count: 2 })).toBe('2 créatures au maximum peuvent attaquer en même temps.');
  });

  it('follows setLanguage', () => {
    expect(getLanguage()).toBe('en');
    setLanguage('fr');
    expect(getLanguage()).toBe('fr');
    expect(t('common.close')).toBe('Fermer');
  });
});

describe('language choice', () => {
  it("defaults to French for a French browser, else English", () => {
    expect(defaultLanguage('fr')).toBe('fr');
    expect(defaultLanguage('fr-CA')).toBe('fr');
    expect(defaultLanguage('FR-fr')).toBe('fr');
    expect(defaultLanguage('en-US')).toBe('en');
    expect(defaultLanguage('de')).toBe('en');
    expect(defaultLanguage('')).toBe('en');
  });

  it('only accepts the two languages', () => {
    expect(parseLanguage('fr')).toBe('fr');
    expect(parseLanguage('en')).toBe('en');
    expect(parseLanguage('de')).toBeUndefined();
    expect(parseLanguage(undefined)).toBeUndefined();
    expect(LANGS).toEqual(['en', 'fr']);
  });
});

describe('copy built outside components follows the language', () => {
  const both = <T,>(f: () => T): Record<Lang, T> => {
    const out = {} as Record<Lang, T>;
    for (const l of LANGS) {
      setLanguage(l);
      out[l] = f();
    }
    return out;
  };

  it('turn steps, captions and ordinals', () => {
    const names = both(() => PRIORITY_STEPS.map((s) => s.longLabel));
    expect(names.en[0]).toBe('Upkeep step');
    expect(names.fr[0]).toBe("Étape d'entretien");
    expect(both(() => GROUP_CAPTIONS.combat)).toEqual({ en: 'Combat phase', fr: 'Phase de combat' });
    expect(both(() => [1, 2, 3, 4, 11, 21].map(ordinal))).toEqual({
      en: ['1st', '2nd', '3rd', '4th', '11th', '21st'],
      fr: ['1er', '2e', '3e', '4e', '11e', '21e'],
    });
  });

  it('the main button, the shortcuts and keyword explanations', () => {
    const game = scenarioById('priority').build();
    const label = both(() => primaryAction(game, INITIAL_UI, DEFAULT_STOPS).label);
    expect(label.en).not.toBe(label.fr);
    const keys = both(() => shortcuts().map((s) => s.action));
    expect(keys.en).toHaveLength(keys.fr.length);
    expect(keys.en[0]).not.toBe(keys.fr[0]);
    const flying = both(() => keywordLine({ name: 'Flying', label: 'Flying' }));
    expect(flying.en).toBe('Can be blocked only by creatures with flying or reach.');
    expect(flying.fr).toMatch(/vol/);
  });
});
