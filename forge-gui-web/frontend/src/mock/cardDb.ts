import type { CardFace } from '../model/types';
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

export function lookup(key: CardKey): { front: CardFace; back?: CardFace } {
  const e = DB[key];
  if (!e) throw new Error(`card ${key} missing from scryfall-cards.json; run pnpm resolve-cards`);
  return { front: { ...e.front }, back: e.back ? { ...e.back } : undefined };
}
