import { player, typeLine } from '../model/selectors';
import type { CardId, GameView, PlayerId } from '../model/types';
import type { ViewableZone } from '../state/ui';
import { t } from '../i18n';

/** "Your graveyard", "Theo's exile". */
export function zoneTitle(game: GameView, playerId: PlayerId, zone: ViewableZone): string {
  const p = player(game, playerId);
  return p.isYou ? t(`zt.you.${zone}`) : t(`zt.their.${zone}`, { name: p.name });
}

/** A zone's cards, newest first (as the side panel lists them). */
export function zoneCardIds(game: GameView, playerId: PlayerId, zone: ViewableZone): CardId[] {
  const p = player(game, playerId);
  const ids = zone === 'graveyard' ? p.graveyard : zone === 'exile' ? p.exile : p.command;
  return [...ids].reverse();
}

/**
 * The large zone view (playtest 1): the zone's cards newest first; with a query, those whose name
 * or type line contains it (case-insensitive), in the same order.
 */
export function zoneBrowserCards(game: GameView, playerId: PlayerId, zone: ViewableZone, query: string): CardId[] {
  const q = query.trim().toLowerCase();
  return zoneCardIds(game, playerId, zone).filter((id) => {
    const c = game.cards[id];
    if (!c) return false;
    return !q || c.name.toLowerCase().includes(q) || (c.localName ?? '').toLowerCase().includes(q) || typeLine(c).toLowerCase().includes(q);
  });
}
