import type { CardId, PlayerId, StackItemId } from '../model/types';

export type Overlay = 'shortcuts' | 'display' | 'dev' | 'menu';
export type ViewableZone = 'graveyard' | 'exile' | 'command';

/** Screen-only state: never sent to the engine. */
export interface UiState {
  hover?: { cardId: CardId; side: 'left' | 'right' };
  inspectId?: CardId;
  /** Blocking in either order: the first click waits here for its partner. */
  pendingBlocker?: CardId;
  pendingAttacker?: CardId;
  /** Defender that newly toggled attackers will attack. */
  attackDefender?: PlayerId;
  hoveredStackItem?: StackItemId;
  /** Choice tray collapsed to peek at the board. */
  trayPeek: boolean;
  logOpen: boolean;
  overlay?: Overlay;
  zoneView?: { playerId: PlayerId; zone: ViewableZone };
  /** Answer being built in the choice tray. */
  choiceDraft?: ChoiceDraft;
}

export interface ChoiceDraft {
  promptId: string;
  /** chooseN: chosen option ids. */
  selected: string[];
  /** order: list id → item ids in order. */
  lists: Record<string, string[]>;
}

export const INITIAL_UI: UiState = { trayPeek: false, logOpen: false };
