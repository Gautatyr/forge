import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_PREFS, loadPrefs, parsePrefs, savePrefs } from './prefs';

afterEach(() => vi.unstubAllGlobals());

const stubBrowser = (language: string, stored?: string) => {
  const store = new Map<string, string>(stored === undefined ? [] : [['forge.match.prefs.v1', stored]]);
  vi.stubGlobal('navigator', { language });
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
  });
  return store;
};

describe('language pref', () => {
  it("is French when nothing is stored and the browser is French, else English", () => {
    stubBrowser('fr-FR');
    expect(loadPrefs().language).toBe('fr');
    stubBrowser('en-GB');
    expect(loadPrefs().language).toBe('en');
  });

  it('a stored choice wins over the browser language', () => {
    stubBrowser('fr-FR', JSON.stringify({ language: 'en' }));
    expect(loadPrefs().language).toBe('en');
    stubBrowser('en-US', JSON.stringify({ language: 'fr' }));
    expect(loadPrefs().language).toBe('fr');
  });

  it('an unknown stored value falls back to the browser language', () => {
    stubBrowser('fr', JSON.stringify({ language: 'de' }));
    expect(parsePrefs(JSON.stringify({ language: 'de' })).language).toBe('fr');
    expect(parsePrefs('not json').language).toBe('fr');
  });

  it('persists with the other prefs and survives a reload', () => {
    const store = stubBrowser('en-US');
    savePrefs({ ...DEFAULT_PREFS, language: 'fr', uiScale: 1.25 });
    expect(JSON.parse(store.get('forge.match.prefs.v1')!)).toMatchObject({ language: 'fr', uiScale: 1.25 });
    expect(loadPrefs()).toMatchObject({ language: 'fr', uiScale: 1.25 });
  });
});
