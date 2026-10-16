/**
 * Card images until the bridge serves them (issue #10). The view gives `c:<name>|<set>|<art>`
 * keys and no collector number. One img per card on the Scryfall API (`cards/named`) trips its
 * rate limit on a full board, so new keys are resolved in batches through `cards/collection`
 * (75 per request) to direct cards.scryfall.io URLs; until then a card shows its text frame.
 */
import type { CardImage } from '../model/types';

export interface ImageRef {
  name: string;
  set: string;
  back: boolean;
}

export function parseImageKey(key: string | undefined): Omit<ImageRef, 'back'> | undefined {
  const m = key ? /^c:([^|]+)\|([^|]*)/.exec(key) : null;
  return m ? { name: m[1]!, set: m[2]!.toLowerCase() } : undefined;
}

/** Scryfall API redirect by name and set: works without a lookup, but each img is one API call. */
export function namedImage(r: ImageRef): CardImage {
  const base = `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(r.name)}${r.set ? `&set=${encodeURIComponent(r.set)}` : ''}&format=image${r.back ? '&face=back' : ''}`;
  return { normal: `${base}&version=normal`, large: `${base}&version=large` };
}

interface ScryCard {
  name: string;
  set: string;
  image_uris?: { normal: string; large: string };
  card_faces?: { name: string; image_uris?: { normal: string; large: string } }[];
}

export type ImageLookup = (r: ImageRef) => CardImage | undefined;

const BATCH = 75;
const COLLECTION = 'https://api.scryfall.com/cards/collection';
const idKey = (name: string, set: string) => `${name.toLowerCase()}|${set}`;

export class ImageResolver {
  /** name|set → the card's faces (front, back); null = not found or the lookup failed. */
  private found = new Map<string, CardImage[] | null>();
  private queue = new Map<string, { name: string; set: string }>();
  private busy = false;
  private readonly onChange: () => void;
  private readonly fetchFn: typeof fetch;

  constructor(onChange: () => void, fetchFn: typeof fetch = (...a) => fetch(...a)) {
    this.onChange = onChange;
    this.fetchFn = fetchFn;
  }

  readonly lookup: ImageLookup = (r) => {
    const k = idKey(r.name, r.set);
    const hit = this.found.get(k);
    if (hit === null) return namedImage(r);
    if (hit) return hit[r.back ? 1 : 0] ?? hit[0];
    if (!this.queue.has(k)) {
      this.queue.set(k, { name: r.name, set: r.set });
      queueMicrotask(() => void this.pump());
    }
    return undefined;
  };

  private async pump() {
    if (this.busy || this.queue.size === 0) return;
    this.busy = true;
    try {
      while (this.queue.size > 0) {
        const batch = [...this.queue.entries()].slice(0, BATCH);
        for (const [k] of batch) this.queue.delete(k);
        await this.resolve(batch);
        this.onChange();
      }
    } finally {
      this.busy = false;
    }
  }

  private async resolve(batch: [string, { name: string; set: string }][]) {
    for (const [k] of batch) this.found.set(k, null); // default: fall back to the named URL
    try {
      const res = await this.fetchFn(COLLECTION, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifiers: batch.map(([, id]) => (id.set ? id : { name: id.name })) }),
      });
      if (!res.ok) return;
      const body = (await res.json()) as { data?: ScryCard[] };
      for (const c of body.data ?? []) {
        const faces = c.image_uris
          ? [c.image_uris]
          : (c.card_faces ?? []).flatMap((f) => (f.image_uris ? [f.image_uris] : []));
        if (!faces.length) continue;
        const images = faces.map((f) => ({ normal: f.normal, large: f.large }));
        for (const name of [c.name, ...(c.card_faces ?? []).map((f) => f.name)]) {
          for (const set of [c.set, '']) {
            const k = idKey(name, set);
            if (batch.some(([b]) => b === k)) this.found.set(k, images);
          }
        }
      }
    } catch {
      // network error: the named URLs stay as the fallback
    }
  }
}
