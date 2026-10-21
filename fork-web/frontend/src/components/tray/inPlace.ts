/**
 * Choosing in place (design pass 4 §2.2): when every option of a choose-N
 * prompt is a battlefield card, a card in your hand or a player, the options
 * are picked where they are, with the usual selected state (yellow ring + ✓).
 * Pure status here; the click hook is in `useInPlacePick.ts`.
 */
import type { CardId, GameView, PlayerId } from '../../model/types';
import { cardStatus, type CardStatus } from '../../state/cardStatus';
import type { UiState } from '../../state/ui';
import { inPlaceRefs, trayDraft } from './trayLogic';

/** The card's status, plus the in-place choice: options lit, chosen ones selected, other permanents dimmed. */
export function cardStatusWithChoice(game: GameView, ui: UiState, id: CardId): CardStatus {
  const s = cardStatus(game, ui, id);
  const d = game.decision;
  if (d.kind !== 'choice') return s;
  const refs = inPlaceRefs(game, d.prompt);
  if (!refs) return s;
  const optionId = refs.cards.get(id);
  if (!optionId) return { ...s, dimmed: game.cards[id]?.zone === 'battlefield' };
  const chosen = trayDraft(d.prompt, ui.choiceDraft).selected.includes(optionId);
  return { ...s, actionable: true, actionKind: undefined, selected: chosen, dimmed: false };
}

/** Whether this player is an in-place option, and whether it is chosen. */
export function playerChoice(game: GameView, ui: UiState, id: PlayerId): { chosen: boolean } | undefined {
  const d = game.decision;
  if (d.kind !== 'choice') return undefined;
  const optionId = inPlaceRefs(game, d.prompt)?.players.get(id);
  if (!optionId) return undefined;
  return { chosen: trayDraft(d.prompt, ui.choiceDraft).selected.includes(optionId) };
}
