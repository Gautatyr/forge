import type { CardFace, CardView, GameView, PlayerId, PlayerView, TargetRef } from './types';
import { t } from '../i18n';

export function currentFace(c: CardView): CardFace {
  return c.transformed && c.back ? c.back : c.front;
}

/** The face drawn for the card: its real face when it is face down and you may look at it (issue #80), else the face in play. */
export function shownFace(c: CardView): CardFace {
  return c.faceDown?.seen ? c.front : currentFace(c);
}

/** What to SHOW (issue #3): the viewer's-language text when the bridge sent it, else the English. Logic keeps reading the English fields. */
export const faceName = (f: CardFace): string => f.localName || f.name;
export const faceType = (f: CardFace): string => f.localTypeLine || f.typeLine;
export const faceText = (f: CardFace): string => f.localOracleText || f.oracleText;
export const cardName = (c: CardView): string => c.localName || c.name;

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

/** A player's name for lists and plates: your own gets "(you)" unless the engine already calls the seat "You". */
export function nameLabel(p: Pick<PlayerView, 'name' | 'isYou'>): string {
  return p.isYou && p.name.trim().toLowerCase() !== 'you' ? t('plate.nameYou', { name: p.name }) : p.name;
}

export function opponents(game: GameView): PlayerView[] {
  return game.players.filter((p) => !p.isYou);
}

/** The shown name of a card by id; undefined when the card is not in the view. */
export const nameOfCard = (game: Pick<GameView, 'cards'>, id: string): string | undefined => {
  const c = game.cards[id];
  return c && cardName(c);
};

export function targetName(game: GameView, t: TargetRef): string {
  if (t.kind === 'card') return nameOfCard(game, t.id) ?? '?';
  if (t.kind === 'player') return player(game, t.id).name;
  const item = game.stack.find((it) => it.id === t.id);
  return (item && nameOfCard(game, item.sourceCardId)) || item?.text || 'a spell';
}

/** The player who defends a planeswalker (its controller) or a battle (its protector) when it is attacked. */
export function defendingPlayerOf(c: CardView): PlayerId {
  return c.protectorId ?? c.controllerId;
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
