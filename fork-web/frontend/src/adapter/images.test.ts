import { describe, expect, it } from 'vitest';
import { bridgeImageLookup, bridgeOrigin, ImageResolver, namedImage, parseImageKey } from './images';

const uris = (n: string) => ({ normal: `https://cards.scryfall.io/normal/${n}.jpg`, large: `https://cards.scryfall.io/large/${n}.jpg` });

describe('ImageResolver', () => {
  it('resolves new keys in one collection request, faces included, and falls back for misses', async () => {
    const bodies: unknown[] = [];
    let changes = 0;
    const fetchFn = (async (_url: string, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)));
      return new Response(
        JSON.stringify({
          data: [
            { name: 'Island', set: 'c17', image_uris: uris('island') },
            { name: 'Delver of Secrets // Insectile Aberration', set: 'isd', card_faces: [{ name: 'Delver of Secrets', image_uris: uris('d1') }, { name: 'Insectile Aberration', image_uris: uris('d2') }] },
          ],
        }),
      );
    }) as typeof fetch;
    const r = new ImageResolver(() => (changes += 1), fetchFn);
    const island = { name: 'Island', set: 'c17', back: false };
    const delverBack = { name: 'Delver of Secrets', set: 'isd', back: true };
    const missing = { name: 'Nope', set: 'xxx', back: false };
    expect(r.lookup(island)).toBeUndefined();
    expect(r.lookup(delverBack)).toBeUndefined();
    expect(r.lookup(missing)).toBeUndefined();
    await new Promise((res) => setTimeout(res, 0));
    expect(bodies).toEqual([{ identifiers: [{ name: 'Island', set: 'c17' }, { name: 'Delver of Secrets', set: 'isd' }, { name: 'Nope', set: 'xxx' }] }]);
    expect(changes).toBe(1);
    expect(r.lookup(island)).toEqual(uris('island'));
    expect(r.lookup(delverBack)).toEqual(uris('d2'));
    expect(r.lookup(missing)).toEqual(namedImage(missing));
  });

  it('parses Forge image keys', () => {
    expect(parseImageKey('c:Lightning Bolt|M10|1')).toEqual({ name: 'Lightning Bolt', set: 'm10' });
    expect(parseImageKey('t:w_1_1_soldier')).toBeUndefined();
  });

  it("leaves tokens to the bridge: Scryfall's lookup by name and set is for cards", async () => {
    let calls = 0;
    const r = new ImageResolver(() => {}, (async () => ((calls += 1), new Response('{}'))) as typeof fetch);
    expect(r.lookup({ key: 't:w_1_1_soldier', name: 'Soldier', set: '', back: false, token: true })).toBeUndefined();
    await new Promise((res) => setTimeout(res, 0));
    expect(calls).toBe(0);
  });
});

describe('bridge images', () => {
  const img = (key: string, lang = 'en') => `http://127.0.0.1:7655/img?key=${encodeURIComponent(key)}&token=t%2Bk&lang=${lang}`;

  it("serves every card from the bridge's /img route, with this page's token", () => {
    expect(bridgeOrigin('ws://127.0.0.1:7655/ws')).toBe('http://127.0.0.1:7655');
    expect(bridgeOrigin('wss://example.test/ws')).toBe('https://example.test');
    const lookup = bridgeImageLookup('ws://127.0.0.1:7655/ws', 't+k');
    const bolt = { key: 'c:Lightning Bolt|M10|1', name: 'Lightning Bolt', set: 'm10', back: false };
    expect(lookup(bolt)).toEqual({ normal: img(bolt.key), large: img(bolt.key), fallback: namedImage(bolt) });
  });

  it("asks the bridge for the viewer's language", () => {
    const lookup = bridgeImageLookup('ws://127.0.0.1:7655/ws', 't+k', 'fr');
    const bolt = { key: 'c:Lightning Bolt|M10|1', name: 'Lightning Bolt', set: 'm10', back: false };
    expect(lookup(bolt)?.normal).toBe(img(bolt.key, 'fr'));
  });

  it('falls back to Scryfall by name: cards by name and set, tokens by name only, face-down cards not at all', () => {
    const lookup = bridgeImageLookup('ws://127.0.0.1:7655/ws', 't+k');
    const back = { key: 'c:Delver of Secrets|ISD|1$alt', name: 'Delver of Secrets', set: 'isd', back: true };
    expect(lookup(back)).toEqual({ normal: img(back.key), large: img(back.key), fallback: namedImage(back) });
    const soldier = { key: 't:w_1_1_soldier_m21', name: 'Soldier', set: '', back: false, token: true };
    expect(lookup(soldier)).toEqual({ normal: img(soldier.key), large: img(soldier.key), fallback: namedImage(soldier) });
    expect(lookup({ key: 't:morph', name: '', set: '', back: false, token: true })).toEqual({ normal: img('t:morph'), large: img('t:morph') });
  });
});
