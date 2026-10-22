import type { CardLinkKind, CardView, GameView } from '../model/types';
import { t } from '../i18n';

/** Getters: the labels follow the current language. */
export const LINK_LABEL: Record<CardLinkKind, string> = {
  get imprinted() {
    return t('link.imprinted');
  },
  get exiled() {
    return t('link.exiled');
  },
  get untilLeaves() {
    return t('link.untilLeaves');
  },
  get exiledWith() {
    return t('link.exiledWith');
  },
  get hauntedBy() {
    return t('link.hauntedBy');
  },
  get haunting() {
    return t('link.haunting');
  },
  get encoded() {
    return t('link.encoded');
  },
};

/** One line per link of a card: "Imprinted: Dragon", "Exiled with: Mimic Vat". Only cards this viewer can see. */
export function linkNotes(game: GameView, c: CardView): string[] {
  return (c.links ?? []).flatMap((l) => {
    const names = l.cardIds.flatMap((id) => game.cards[id]?.name ?? []);
    return names.length ? [t('link.note', { label: LINK_LABEL[l.kind], names: names.join(', ') })] : [];
  });
}
