import { describe, expect, it } from 'vitest';
import { fitPreview, layoutNotes, layoutPreview, OVER_BOARD_MIN_W, overBoardWidth, placePreview, type Box, type NotesSide } from './previewPlacement';

const area: Box = { left: 8, top: 47, width: 1040, height: 665 }; // 1280x720: left of the rail, below the top bar
const size = { width: 271, height: 460 };
const box = (left: number, top: number, width = 70, height = 98): Box => ({ left, top, width, height });
const hits = (p: { left: number; top: number }, b: Box, s = size) =>
  p.left < b.left + b.width && p.left + s.width > b.left && p.top < b.top + b.height && p.top + s.height > b.top;
const fixed = { left: area.left + area.width - size.width, top: area.top + area.height - size.height };

describe('hover preview: one fixed place (playtest 1 ruling, issue #172)', () => {
  it('sits flush with the rail side, bottom on the hand, with nothing in the way', () => {
    expect(placePreview({ area, size, keep: [] })).toEqual({ ...fixed, clear: true });
  });

  it('the image keeps its place when it is too tall for the room (the floor wins): top on the area, never above it', () => {
    const p = placePreview({ area, size: { width: 271, height: 900 }, keep: [] });
    expect(p.top).toBe(area.top);
    expect(placePreview({ area, size: { width: 2000, height: 100 }, keep: [] }).left).toBe(area.left);
  });
});

describe('hover preview: only the open prompt moves it', () => {
  it('keeps clear of the card chosen or targeted in an open prompt', () => {
    const chosen = box(850, 500); // under the fixed spot
    const p = placePreview({ area, size, keep: [chosen] });
    expect(hits(p, chosen)).toBe(false);
    expect(p.clear).toBe(true);
  });

  it('keeps clear of the targets a hovered stack item lights: a creature and a player plate by the rail', () => {
    const creature = box(900, 400, 70, 98); // flush against the rail side
    const plate = box(700, 50, 340, 64); // the targeted player's plate, along the top
    const p = placePreview({ area, size, keep: [creature, plate] });
    expect(hits(p, creature)).toBe(false);
    expect(hits(p, plate)).toBe(false);
  });

  it('keeps clear of the prompt tray as well', () => {
    const tray = box(700, 400, 340, 300);
    const p = placePreview({ area, size, keep: [tray] });
    expect(hits(p, tray)).toBe(false);
  });

  it('when nothing is clear, takes the candidate covering the least', () => {
    const wall = box(area.left, area.top, area.width, area.height);
    expect(placePreview({ area, size, keep: [wall] }).clear).toBe(false);
  });
});

describe('over-board size (restores the 2026-10-16 size, issue #172)', () => {
  // The area is the board above the hand.
  const at = (rem: number, vh: number, hand: number) => overBoardWidth({ rem, vh, areaHeight: vh - 60 - hand - 16 });

  it('1920x1080 is about 486 px wide (was 271 in the rail)', () => {
    expect(at(16, 1080, 270)).toBeGreaterThanOrEqual(475);
    expect(at(16, 1080, 270)).toBeLessThanOrEqual(486);
  });

  it('1366x768 is well above the old 271 px floor', () => {
    expect(at(12.5, 768, 192)).toBeGreaterThan(310);
  });

  it('never below the readable floor (271 px), whatever the room', () => {
    expect(at(10, 600, 152)).toBe(OVER_BOARD_MIN_W);
    expect(overBoardWidth({ rem: 16, vh: 1080, areaHeight: 100 })).toBe(OVER_BOARD_MIN_W);
  });

  it('is capped by 66 % of the window height and 58 rem', () => {
    expect(overBoardWidth({ rem: 16, vh: 1000, areaHeight: 5000 })).toBe(Math.round(660 * 0.716));
    expect(overBoardWidth({ rem: 10, vh: 5000, areaHeight: 5000 })).toBe(Math.round(580 * 0.716));
  });
});

describe('clear flag and fitting (issue #172: the bigger preview never costs the tray clearance)', () => {
  it('a preview too tall to clear the tray narrows until it clears', () => {
    // Tray across the bottom of the area: only a preview under about 500 px tall (width about 320) clears it.
    const tray = box(area.left, 560, area.width, 152);
    const attempt = (width: number) => placePreview({ area, size: { width, height: Math.round(width / 0.716) + 60 }, keep: [tray] });
    const fit = fitPreview(400, attempt);
    expect(fit.at.clear).toBe(true);
    expect(fit.width).toBeLessThan(400);
    expect(fit.width).toBeGreaterThanOrEqual(OVER_BOARD_MIN_W);
  });

  it('keeps the wide size when it is clear, and stops at the floor when nothing clears', () => {
    expect(fitPreview(486, () => ({ clear: true })).width).toBe(486);
    expect(fitPreview(486, () => ({ clear: false })).width).toBe(OVER_BOARD_MIN_W);
  });
});

/**
 * A fake DOM for the notes block: chips of the given widths wrap into the block like the page's flex-wrap. Above, the block
 * is as wide as the image; beside, as wide as its rows need up to the max width. Each row is 22 px, a 4 px gap, a 4 px padding
 * and a 1 px border.
 */
const flowNotes = (chips: number[], imageWidth: number) => (side: NotesSide, maxWidth: number) => {
  const width = side === 'above' ? imageWidth : Math.min(maxWidth, chips.reduce((a, c) => a + c + 4, 0) + 10);
  const inner = width - 10;
  let rows = 1;
  let used = 0;
  for (const c of chips) {
    if (used > 0 && used + 4 + c > inner) [rows, used] = [rows + 1, 0];
    used += (used > 0 ? 4 : 0) + c;
  }
  return { width, height: rows * 22 + (rows - 1) * 4 + 10 };
};
/** The reviewer's heavy card (round 3): tapped, three counters, granted keywords, three attachments, the hint. In French. */
const HEAVY = [90, 150, 130, 120, 110, 260, 330, 300, 190, 280, 250, 200];
const LIGHT = [90, 150];

describe('layoutPreview: the image rect does not depend on the notes (round 3, issue #172)', () => {
  const env = { area, rem: 16, vh: 720 };
  const run = (chips: number[], keep: Box[] = []) => {
    // The notes are measured against the image width the layout settled on, as the page does.
    let width = 0;
    return layoutPreview({
      ...env,
      keep,
      measure: (w) => ((width = w), { width: w, height: Math.round(w / 0.716) }),
      measureNotes: (side, maxWidth) => flowNotes(chips, width)(side, maxWidth),
    });
  };
  const imageRect = (r: { left: number; top: number; width: number }) => ({ left: r.left, top: r.top, width: r.width });

  it('no prompt: the same image rect for no notes, short and very tall ones, bottom on the hand', () => {
    const rects = [[], LIGHT, HEAVY, [...HEAVY, ...HEAVY, ...HEAVY]].map((c) => run(c));
    for (const r of rects) expect(imageRect(r)).toEqual(imageRect(rects[0]!));
    expect(rects[0]!.top + Math.round(rects[0]!.width / 0.716)).toBe(area.top + area.height);
  });

  it('a tray in keep: the same image rect for every notes block', () => {
    const tray = box(area.left, 520, area.width, 192);
    const rects = [[], LIGHT, HEAVY].map((c) => run(c, [tray]));
    for (const r of rects) expect(imageRect(r)).toEqual(imageRect(rects[0]!));
    expect(rects[0]!.width).toBeLessThan(overBoardWidth({ rem: 16, vh: 720, areaHeight: area.height }));
    expect(rects[0]!.clear).toBe(true);
  });

  it('notes that fit above the image stay above it, as wide as the image, a 0.5 rem gap over it', () => {
    const r = run(LIGHT);
    expect(r.notes.side).toBe('above');
    expect(r.notes.maxHeight).toBeNull();
    expect(r.notes.box.left).toBe(r.left);
    expect(r.notes.box.top + r.notes.box.height + 8).toBe(r.top);
  });

  it('notes too tall to fit above the image go beside it, whole: no row is cut (round 4)', () => {
    const r = run(HEAVY);
    const natural = flowNotes(HEAVY, r.width)('above', r.width).height;
    expect(natural).toBeGreaterThan(r.top - 8 - 8); // does not fit above
    expect(r.notes.side).toBe('left');
    expect(r.notes.maxHeight).toBeNull(); // nothing cut
    expect(r.notes.box.top).toBe(r.top); // at the image's top
    expect(r.notes.box.left + r.notes.box.width + 8).toBe(r.left); // against the image's left edge
    expect(r.notes.box.left).toBeGreaterThanOrEqual(8);
    expect(r.notes.box.top + r.notes.box.height).toBeLessThanOrEqual(area.top + area.height);
  });

  it('beside the image the block widens until every row fits', () => {
    const r = run(Array.from({ length: 20 }, () => 150));
    expect(r.notes.side).toBe('left');
    expect(r.notes.maxHeight).toBeNull();
    expect(r.notes.box.top + r.notes.box.height).toBeLessThanOrEqual(area.top + area.height);
    expect(r.notes.maxWidth).toBeGreaterThan(14 * 16);
  });
});

describe('layoutNotes: never over what the prompt keeps, never a cut row (round 4, issue #172)', () => {
  const image: Box = { left: 736, top: 97, width: 313, height: 437 };
  const base = { image, area, rem: 16, vh: 720 };
  const heavy = flowNotes(HEAVY, image.width);

  it('goes to the right of the image when the board left of it is kept', () => {
    const mid: Box = { ...image, left: 400 }; // room on both sides
    const kept = box(60, 90, 320, 440); // a prompt card block left of the image
    const p = layoutNotes({ ...base, image: mid, keep: [kept], measure: heavy });
    expect(p.side).toBe('right');
    expect(p.maxHeight).toBeNull();
    expect(p.box.left).toBe(mid.left + mid.width + 8);
  });

  it('keeps the above block off a kept box: beside the image instead', () => {
    const tray = box(700, 60, 360, 30); // right over the image's top
    const p = layoutNotes({ ...base, keep: [tray], measure: flowNotes(LIGHT, image.width) });
    expect(p.side).not.toBe('above');
    expect(p.maxHeight).toBeNull();
  });

  it('cuts only as the last resort: nothing holds the rows, the least lost wins', () => {
    const huge = flowNotes(Array.from({ length: 200 }, () => 300), image.width);
    const p = layoutNotes({ ...base, keep: [], measure: huge });
    expect(p.maxHeight).not.toBeNull();
    expect(p.maxHeight!).toBeGreaterThan(0);
  });

  it('with no notes the block stays above', () => {
    expect(layoutNotes({ ...base, keep: [], measure: flowNotes([], image.width) }).side).toBe('above');
  });
});
