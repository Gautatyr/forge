import { describe, expect, it } from 'vitest';
import { PREVIEW_BESIDE_ATTR, previewBeside, previewSpot } from './previewSpot';

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
