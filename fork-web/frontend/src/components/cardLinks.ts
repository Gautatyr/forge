import type { CardLinkKind, CardView, GameView } from '../model/types';

export const LINK_LABEL: Record<CardLinkKind, string> = {
  imprinted: 'Imprinted',
  exiled: 'Exiled with this',
  untilLeaves: 'Exiled until this leaves',
  exiledWith: 'Exiled with',
  hauntedBy: 'Haunted by',
  haunting: 'Haunting',
  encoded: 'Encoded',
};

/** One line per link of a card: "Imprinted: Dragon", "Exiled with: Mimic Vat". Only cards this viewer can see. */
export function linkNotes(game: GameView, c: CardView): string[] {
  return (c.links ?? []).flatMap((l) => {
    const names = l.cardIds.flatMap((id) => game.cards[id]?.name ?? []);
    return names.length ? [`${LINK_LABEL[l.kind]}: ${names.join(', ')}`] : [];
  });
}
