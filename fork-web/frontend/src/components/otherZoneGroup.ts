import { commanderTax, you } from '../model/selectors';
import type { CardView, GameView, OtherZoneCastVia } from '../model/types';
import { t, tDynamic, type MsgKey } from '../i18n';

export interface OtherZoneEntry {
  card: CardView;
  caption: string;
}

const ZONE_WORD: Partial<Record<CardView['zone'], MsgKey>> = {
  graveyard: 'zone.graveyard',
  exile: 'zone.exile',
  library: 'zone.library',
  battlefield: 'zone.battlefield',
};

function caption(game: GameView, c: CardView, via: OtherZoneCastVia): string {
  const key = ZONE_WORD[c.zone];
  const zone: string = key ? tDynamic(key) : c.zone;
  // An opponent's card you may cast (Gonti's exiled card): its zone is named with its owner.
  const owner = c.ownerId === game.youId ? undefined : game.players.find((p) => p.id === c.ownerId)?.name;
  const where = owner === undefined ? zone : t('zone.ofPlayer', { zone, owner });
  return via === 'other' ? where : t('zone.via', { zone: where, via: tDynamic(`via.${via}` as MsgKey) });
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
    out.push({ card: c, caption: tax > 0 ? t('zone.commandTax', { tax }) : t('zone.command') });
  }
  for (const { cardId, via } of me.otherZoneCasts ?? []) {
    const c = game.cards[cardId];
    if (c) out.push({ card: c, caption: caption(game, c, via) });
  }
  return out;
}
