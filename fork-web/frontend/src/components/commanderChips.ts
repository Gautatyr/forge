import type { CardId, GameView, PlayerView } from '../model/types';
import { seatChar } from './seatChar';
import { t } from '../i18n';
import { cardName } from '../model/selectors';

/** Commander damage that eliminates a player. */
export const COMMANDER_LETHAL = 21;
/** From this amount a chip takes the burst style. */
export const COMMANDER_DANGER = 15;

export interface CommanderChip {
  commanderId: CardId;
  /** Name before the comma: "Krenko". */
  shortName: string;
  /** Seat of the commander's owner (its shape on the chip): stable when the commander is stolen. */
  seat: number;
  amount: number;
  danger: boolean;
  /** "Krenko, Mob Boss (▲ Mira) has dealt Theo 3 commander damage. 21 eliminates." */
  title: string;
}

/**
 * One chip per source commander that has dealt `p` damage (design pass 4, P5).
 * Partners are two commanders, so two chips. The shape is the commander's owner:
 * the player whose commander it is.
 */
export function commanderChips(game: GameView, p: PlayerView): CommanderChip[] {
  return p.commanderDamageTaken
    .filter((x) => x.amount > 0)
    .map((x) => {
      const card = game.cards[x.commanderId];
      const ctrl = card ? game.players.find((q) => q.id === card.ownerId) : undefined;
      const name = (card && cardName(card)) ?? t('cmd.unknown');
      const seat = ctrl?.seat ?? 0;
      const by = ctrl ? ` (${t('cmd.by', { seat: seatChar(seat), who: ctrl.isYou ? t('top.you') : ctrl.name })})` : '';
      return {
        commanderId: x.commanderId,
        shortName: name.split(',')[0]!,
        seat,
        amount: x.amount,
        danger: x.amount >= COMMANDER_DANGER,
        title: t('cmd.title', { name, by, to: p.isYou ? t('top.you') : p.name, amount: x.amount, lethal: COMMANDER_LETHAL }),
      };
    });
}
