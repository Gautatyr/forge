import { describe, expect, it } from 'vitest';
import { PREVIEW_BESIDE_ATTR, previewBeside } from './previewSpot';

/** An element whose ancestors (itself first) carry these attribute sets; `closest` takes `[attr]` selectors. */
const el = (...chain: string[][]) => ({
  closest: (sel: string) => (chain.some((attrs) => attrs.some((a) => sel === `[${a}]`)) ? {} : null),
});

describe('hover preview beside the rail (PR #52 round 2)', () => {
  it('a card inside the rail or the log drawer is hovered beside the board', () => {
    expect(previewBeside(el([], ['class'], [PREVIEW_BESIDE_ATTR]))).toBe(true);
    expect(previewBeside(el([PREVIEW_BESIDE_ATTR]))).toBe(true);
  });

  it('a board, hand or seat card is not', () => {
    expect(previewBeside(el([], ['class'], ['data-scroll-region']))).toBe(false);
  });
});
