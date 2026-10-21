import type { CardFace, CardView, GameView, PlayerId, PlayerView, TargetRef } from './types';

export function currentFace(c: CardView): CardFace {
  return c.transformed && c.back ? c.back : c.front;
}

export function typeLine(c: CardView): string {
  return currentFace(c).typeLine;
}

export const isCreature = (c: CardView) => /\bCreature\b/.test(typeLine(c));
export const isLand = (c: CardView) => /\bLand\b/.test(typeLine(c));
export const isAura = (c: CardView) => /\bAura\b/.test(typeLine(c));
export const isEquipment = (c: CardView) => /\bEquipment\b/.test(typeLine(c));
export const isInstantOrSorcery = (c: CardView) => /\b(Instant|Sorcery)\b/.test(typeLine(c));
export const isPermanentCard = (c: CardView) => !isInstantOrSorcery(c);

/** Mana value from a Scryfall-style cost such as "{2}{G}{W}". */
export function manaValue(cost: string): number {
  let mv = 0;
  for (const m of cost.matchAll(/\{([^}]+)\}/g)) {
    const sym = m[1]!;
    if (/^\d+$/.test(sym)) mv += Number(sym);
    else if (sym !== 'X') mv += 1;
  }
  return mv;
}

export function player(game: GameView, id: PlayerId): PlayerView {
  const p = game.players.find((x) => x.id === id);
  if (!p) throw new Error(`unknown player ${id}`);
  return p;
}

export function you(game: GameView): PlayerView {
  return player(game, game.youId);
}

export function opponents(game: GameView): PlayerView[] {
  return game.players.filter((p) => !p.isYou);
}

export function targetName(game: GameView, t: TargetRef): string {
  if (t.kind === 'card') return game.cards[t.id]?.name ?? '?';
  if (t.kind === 'player') return player(game, t.id).name;
  const item = game.stack.find((it) => it.id === t.id);
  return (item && game.cards[item.sourceCardId]?.name) || item?.text || 'a spell';
}

/** Commander tax for the next cast from the command zone. */
export function commanderTax(p: PlayerView, commanderId: string): number {
  return 2 * (p.commanderCasts[commanderId] ?? 0);
}

/** Identity used to group identical permanents (tokens, lands). */
export function groupKey(c: CardView, extra: string): string {
  const counters = c.counters.map((x) => `${x.kind}${x.count}`).join(',');
  return [c.name, c.tapped, c.summoningSick, c.damage, counters, c.attachments.length, extra].join('|');
}
