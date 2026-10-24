import type { CardId, ManaColour, PlayerId, StackItemId } from '../model/types';

export type Overlay = 'shortcuts' | 'display' | 'dev' | 'menu' | 'stops' | 'concede';
export type ViewableZone = 'graveyard' | 'exile' | 'command';

/** Screen-only state: never sent to the engine. */
export interface UiState {
  /** `beside`: hovered inside the rail or the log drawer, so the preview shows left of it (previewSpot.ts). */
  hover?: { cardId: CardId; beside?: boolean };
  inspectId?: CardId;
  /** Blocking in either order: the first click waits here for its partner. */
  pendingBlocker?: CardId;
  pendingAttacker?: CardId;
  /** Defender that newly toggled attackers will attack. */
  attackDefender?: PlayerId;
  /** The planeswalker or battle of `attackDefender` they attack instead of the player. */
  attackDefenderCard?: CardId;
  hoveredStackItem?: StackItemId;
  /** Focus layout: the expanded opponent (see focus.ts for when it changes). */
  focusOpponentId?: PlayerId;
  /** Choice tray collapsed to peek at the board. */
  trayPeek: boolean;
  logOpen: boolean;
  overlay?: Overlay;
  /** An open graveyard or exile: in the side panel, or `large` over the board (playtest 1). */
  zoneView?: { playerId: PlayerId; zone: ViewableZone; large?: boolean };
  /** Answer being built in the choice tray. */
  choiceDraft?: ChoiceDraft;
  /**
   * Neutral note shown in the prompt line for 3 s ("You can't play … right now."); `id` restarts the timer.
   * `sticky`: stays until the player's next action (a refused attack declaration). `refusal`: why the primary button
   * is refused ("needs 2 blockers"); it goes as soon as the button's refusal changes or ends.
   */
  promptNote?: { id: number; text: string; sticky?: boolean; refusal?: boolean };
  /** Chooser at a mana source that adds two or more kinds ("Add {G} · Add {W}"). */
  manaChoice?: { cardId: CardId; colours: ManaColour[] };
  /** You are out and chose "Watch the rest" in this game (its id). */
  watchingGame?: string;
  /** The game is over and you chose "View the board" in this game (its id). */
  boardViewGame?: string;
  /** "Back to lobby" in this game (its id): the match screen is done with it; a later game shows as usual. */
  leftGame?: string;
}

export interface ChoiceDraft {
  promptId: string;
  /** chooseN: chosen option ids. input: the field's text as the only item. */
  selected: string[];
  /** order: list id → item ids in order. */
  lists: Record<string, string[]>;
  /** distribute: recipient id → amount assigned. */
  amounts?: Record<string, number>;
}

export const INITIAL_UI: UiState = { trayPeek: false, logOpen: false };
