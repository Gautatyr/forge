import { commanderTax } from '../model/selectors';
import type { CardId, GameView, PlayerView } from '../model/types';
import { t } from '../i18n';

export interface CommandZoneChip {
  cardId: CardId;
  /** Commander tax: 2 per earlier cast from the command zone. */
  tax: number;
  /** "Talrand, Sky Summoner is in Theo's command zone. Commander tax +4." */
  title: string;
}

/**
 * An opponent's commanders in the command zone, as chips in their header: hovering one shows
 * the card in the hover preview (playtest 1: never drawn on their board). Yours: none, your
 * commander shows in the group beside your hand (design pass 4, P3).
 */
export function commandZoneChips(p: PlayerView, game: GameView): CommandZoneChip[] {
  if (p.isYou) return [];
  return p.command.flatMap((cardId) => {
    const c = game.cards[cardId];
    if (!c) return [];
    const tax = commanderTax(p, cardId);
    const taxText = tax > 0 ? t('cz.tax', { tax }) : t('cz.noTax');
    return [{ cardId, tax, title: t('cz.title', { name: c.name, owner: p.name, tax: taxText }) }];
  });
}
