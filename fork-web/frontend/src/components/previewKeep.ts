import type { CardId, GameView, PlayerId } from '../model/types';
import type { UiState } from '../state/ui';

/**
 * What the hover is about, besides the hovered card: while the pointer is on a stack item, the page lights that item's
 * targets (cardStatus.ts `spotlightItem`), and the over-board preview must not cover them while you read them.
 * Cards (`[data-card-id]`) and players (`[data-player-id]` plates); a stack item it targets lives in the rail.
 */
export function hoverLitTargets(game: GameView, ui: UiState): { cards: CardId[]; players: PlayerId[] } {
  const item = game.stack.find((s) => s.id === ui.hoveredStackItem);
  const targets = item?.targets ?? [];
  return {
    cards: targets.flatMap((t) => (t.kind === 'card' ? [t.id] : [])),
    players: targets.flatMap((t) => (t.kind === 'player' ? [t.id] : [])),
  };
}
