import { describe, expect, it } from 'vitest';
import { fitPreview, OVER_BOARD_MIN_W, overBoardWidth, placePreview, type Box } from './previewPlacement';

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

  it('is the same place whichever card is hovered: placement never reads the hovered card', () => {
    // Cards on the rail side, in the middle and far left of the board: the inputs are the same, so the rect is.
    const a = placePreview({ area, size, keep: [] });
    expect(placePreview({ area, size, keep: [] })).toEqual(a);
    expect(a.left).toBe(fixed.left);
    expect(a.top).toBe(fixed.top);
  });

  it('is the same place for a long and a short notes block (the image bottom stays on the hand)', () => {
    const tall = placePreview({ area, size: { width: 271, height: 520 }, keep: [] });
    expect(tall.left).toBe(fixed.left);
    expect(tall.top + 520).toBe(area.top + area.height);
  });

  it('stays inside the area', () => {
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
