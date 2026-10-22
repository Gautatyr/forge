import type { CardId, GameView } from '../model/types';
import { t } from '../i18n';

interface Words {
  title: string;
  instruction: string;
}

/**
 * The tray words for cards the engine shows you (showRevealedCards). Forge titles every hand reveal "Looking at
 * cards in <player>'s hand", which reads as your seeing the whole hand when only a card was revealed (a land played
 * from it, a milled card put into it): the title names what is shown, unless it really is the whole hand. Any other
 * engine message is kept.
 */
export function revealWords(view: Omit<GameView, 'decision'>, shown: CardId[], words: Words): Words {
  if (!/^Looking at cards in .*\bhand\b/i.test(words.title) || shown.length === 0) return words;
  const cards = shown.map((id) => view.cards[id]!);
  const ownerId = cards[0]!.ownerId;
  const inOneHand = cards.every((c) => c.zone === 'hand' && c.ownerId === ownerId);
  const owner = view.players.find((p) => p.id === ownerId);
  if (inOneHand && owner && (owner.isYou ? owner.hand.length : owner.handCount) === shown.length) return words;
  const title = cards.length === 1 ? t('prompt.revealedOne', { name: cards[0]!.name }) : t('prompt.revealedMany', { count: cards.length });
  return { title, instruction: inOneHand && owner ? (owner.isYou ? t('prompt.fromYourHand') : t('prompt.fromTheirHand', { name: owner.name })) : '' };
}
