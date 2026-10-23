import { describe, expect, it } from 'vitest';
import { IN_RAIL_MIN_COLUMN_REM, PREVIEW_BESIDE_ATTR, previewBeside, previewSpot } from './previewSpot';

/** An element whose ancestors (itself first) carry these attribute sets; `closest` takes `[attr]` selectors. */
const el = (...chain: string[][]) => ({
  closest: (sel: string) => (chain.some((attrs) => attrs.some((a) => sel === `[${a}]`)) ? {} : null),
});

describe('hover preview spot (PR #52 round 2)', () => {
  it('a card inside the rail or the log drawer previews beside it', () => {
    expect(previewBeside(el([], ['class'], [PREVIEW_BESIDE_ATTR]))).toBe(true);
    expect(previewBeside(el([PREVIEW_BESIDE_ATTR]))).toBe(true);
  });

  it('a board, hand or seat card keeps the rail spot', () => {
    expect(previewBeside(el([], ['class'], ['data-scroll-region']))).toBe(false);
  });

  it('beside means left of the drawer while it is open, else left of the rail', () => {
    expect(previewSpot({ beside: false }, false)).toBe('rail');
    expect(previewSpot({ beside: false }, true)).toBe('rail');
    expect(previewSpot({}, true)).toBe('rail');
    expect(previewSpot({ beside: true }, false)).toBe('besideRail');
    expect(previewSpot({ beside: true }, true)).toBe('besideDrawer');
  });
});

describe('hover preview at small heights (owner ruling 2026-10-22)', () => {
  it('a short rail column moves the preview over the board', () => {
    expect(previewSpot({}, false, IN_RAIL_MIN_COLUMN_REM - 0.1)).toBe('overBoard');
    expect(previewSpot({ beside: false }, true, 30)).toBe('overBoard');
  });

  it('a tall column keeps the fixed rail spot (1080p: 50 rem)', () => {
    expect(previewSpot({}, false, IN_RAIL_MIN_COLUMN_REM)).toBe('rail');
    expect(previewSpot({}, false, 50.25)).toBe('rail');
  });

  it('1366x768 (44 rem) and 1280x720 (40 rem) are short, 1920x1080 is not', () => {
    expect(previewSpot({}, false, 550 / 12.5)).toBe('overBoard');
    expect(previewSpot({}, false, 502 / 12.5)).toBe('overBoard');
    expect(previewSpot({}, false, 804 / 16)).toBe('rail');
  });

  it('a card hovered in the rail or drawer previews over the board too: the floor size applies to it', () => {
    expect(previewSpot({ beside: true }, false, 30)).toBe('overBoard');
    expect(previewSpot({ beside: true }, true, 30)).toBe('overBoard');
    expect(previewSpot({ beside: true }, false, 550 / 12.5)).toBe('overBoard');
  });

  it('a card hovered in the rail keeps the PR #52 beside spot on a tall column', () => {
    expect(previewSpot({ beside: true }, false, IN_RAIL_MIN_COLUMN_REM)).toBe('besideRail');
    expect(previewSpot({ beside: true }, true, 804 / 16)).toBe('besideDrawer');
  });

  it('an unmeasured column (0) keeps the rail spot', () => {
    expect(previewSpot({}, false, 0)).toBe('rail');
    expect(previewSpot({}, false)).toBe('rail');
  });
});
