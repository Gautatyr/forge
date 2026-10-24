/** `GameView.id` of the placeholder shown until a live game's first snapshot. */
export const PENDING_GAME_ID = 'live-pending';

/**
 * Follows which game the page shows. `seen` is the last real game id (undefined before the first); a pending id is
 * no game, so a reconnect's placeholder neither starts nor ends one. `fresh`: another game than `seen`, in which
 * state of the previous game (seat ids restart at 0) must not carry over.
 */
export function followGame(seen: string | undefined, id: string): { id: string | undefined; fresh: boolean } {
  if (id === PENDING_GAME_ID) return { id: seen, fresh: false };
  return { id, fresh: seen !== undefined && seen !== id };
}
