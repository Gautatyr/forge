import { commanderTax, you } from '../model/selectors';
import type { CardView, GameView, OtherZoneCastVia } from '../model/types';

export interface OtherZoneEntry {
  card: CardView;
  caption: string;
}

const ZONE_WORD: Partial<Record<CardView['zone'], string>> = {
  graveyard: 'Graveyard',
  exile: 'Exile',
  library: 'Library',
  battlefield: 'Battlefield',
};

function caption(c: CardView, via: OtherZoneCastVia): string {
  const zone = ZONE_WORD[c.zone] ?? c.zone;
  return via === 'other' ? zone : `${zone} · ${via}`;
}

/**
 * The group beside the hand (design pass 4, P3/P4): your commanders in the
 * command zone, then every card you have permission to cast from another zone.
 * Neither mana nor timing changes the list, so it never hints at what you can
 * afford.
 */
export function otherZoneGroup(game: GameView): OtherZoneEntry[] {
  const me = you(game);
  const out: OtherZoneEntry[] = [];
  for (const id of me.command) {
    const c = game.cards[id];
    if (!c) continue;
    const tax = commanderTax(me, id);
    out.push({ card: c, caption: tax > 0 ? `Command zone · tax +${tax}` : 'Command zone' });
  }
  for (const { cardId, via } of me.otherZoneCasts ?? []) {
    const c = game.cards[cardId];
    if (c) out.push({ card: c, caption: caption(c, via) });
  }
  return out;
}
