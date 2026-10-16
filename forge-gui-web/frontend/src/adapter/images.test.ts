import { describe, expect, it } from 'vitest';
import { ImageResolver, namedImage, parseImageKey } from './images';

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
});
