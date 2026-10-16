import type { CardFace, CardNameOption } from '../model/types';
import raw from './scryfall-cards.json';

/** Shape written by scripts/resolve-scryfall.mjs. */
interface RawFace {
  name: string;
  manaCost: string;
  typeLine: string;
  oracleText: string;
  power?: string;
  toughness?: string;
  loyalty?: string;
  image?: { normal: string; large: string };
}
interface RawEntry {
  key: string;
  layout: string;
  front: RawFace;
  back?: RawFace;
}

const DB = raw as unknown as Record<string, RawEntry>;

export type CardKey = keyof typeof raw;

/** An adventure card goes by its creature half ("Bonecrusher Giant"), as in Forge; the image shows both. */
function frontFace(e: RawEntry): CardFace {
  if (e.layout !== 'adventure') return { ...e.front };
  const main = (s: string) => s.split(' // ')[0]!;
  return { ...e.front, name: main(e.front.name), manaCost: main(e.front.manaCost), typeLine: main(e.front.typeLine) };
}

export function lookup(key: CardKey): { front: CardFace; back?: CardFace } {
  const e = DB[key];
  if (!e) throw new Error(`card ${key} missing from scryfall-cards.json; run pnpm resolve-cards`);
  return { front: frontFace(e), back: e.back ? { ...e.back } : undefined };
}

/** Every card name in the mock card list (tokens left out), for "name a card". */
export function cardNames(): CardNameOption[] {
  return Object.values(DB)
    .filter((e) => !/ token$/.test(e.key))
    .map(frontFace)
    .map((f) => ({ name: f.name, manaCost: f.manaCost, typeLine: f.typeLine, image: f.image }));
}
