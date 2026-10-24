import { describe, expect, it } from 'vitest';
import { followGame, PENDING_GAME_ID } from './gameId';

describe('followGame', () => {
  it('the first game is not a change', () => {
    expect(followGame(undefined, 'live-3')).toEqual({ id: 'live-3', fresh: false });
  });
  it('the same game is not a change', () => {
    expect(followGame('live-3', 'live-3')).toEqual({ id: 'live-3', fresh: false });
  });
  it('another game is', () => {
    expect(followGame('live-3', 'live-4')).toEqual({ id: 'live-4', fresh: true });
  });
  it('a pending placeholder is no game', () => {
    expect(followGame('live-3', PENDING_GAME_ID)).toEqual({ id: 'live-3', fresh: false });
    expect(followGame(undefined, PENDING_GAME_ID)).toEqual({ id: undefined, fresh: false });
  });
});
