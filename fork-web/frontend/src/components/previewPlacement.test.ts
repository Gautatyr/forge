import { describe, expect, it } from 'vitest';
import { fitPreview, OVER_BOARD_MIN_W, overBoardWidth, placePreview, type Box } from './previewPlacement';

const area: Box = { left: 8, top: 47, width: 1040, height: 665 }; // 1280x720: left of the rail, below the top bar
const size = { width: 271, height: 460 };
const box = (left: number, top: number, width = 70, height = 98): Box => ({ left, top, width, height });
const hits = (p: { left: number; top: number }, b: Box) =>
  p.left < b.left + b.width && p.left + size.width > b.left && p.top < b.top + b.height && p.top + size.height > b.top;

describe('hover preview over the board (small heights)', () => {
  it('sits flush with the rail side, at the hovered card height, when that is clear', () => {
    const p = placePreview({ area, size, hovered: box(100, 300), keep: [] });
    expect(p.left).toBe(area.left + area.width - size.width);
    expect(p.top).toBe(300 + 49 - 230); // centred on the card
  });

  it('a card hovered in the rail (outside the area) gets the rail side at its own height, clear of it', () => {
    const railCard = box(1100, 250, 80, 112); // right of the area
    const p = placePreview({ area, size, hovered: railCard, keep: [] });
    expect(p.left).toBe(area.left + area.width - size.width);
    expect(p.top).toBe(250 + 56 - 230);
    expect(hits(p, railCard)).toBe(false);
  });

  it('stays inside the area', () => {
    const p = placePreview({ area, size, hovered: box(100, 650), keep: [] });
    expect(p.top).toBe(area.top + area.height - size.height);
    const q = placePreview({ area, size, hovered: box(100, 50), keep: [] });
    expect(q.top).toBe(area.top);
  });

  it('never covers the hovered card: a card on the rail side sends it to the far side', () => {
    const hovered = box(900, 300);
    const p = placePreview({ area, size, hovered, keep: [] });
    expect(hits(p, hovered)).toBe(false);
    expect(p.left).toBe(area.left);
  });

  it('never covers the card chosen or targeted in an open prompt', () => {
    const hovered = box(100, 300);
    const chosen = box(850, 250);
    const p = placePreview({ area, size, hovered, keep: [chosen] });
    expect(hits(p, hovered)).toBe(false);
    expect(hits(p, chosen)).toBe(false);
  });

  it('keeps clear of the targets a hovered stack item lights: a creature and a player plate by the rail', () => {
    const railCard = box(1100, 250, 80, 112); // the stack item in the rail
    const creature = box(900, 250, 70, 98); // flush against the rail side, at the item's height
    const plate = box(700, 50, 340, 64); // the targeted player's plate, along the top
    const p = placePreview({ area, size, hovered: railCard, keep: [creature, plate] });
    expect(hits(p, creature)).toBe(false);
    expect(hits(p, plate)).toBe(false);
    expect(hits(p, railCard)).toBe(false);
  });

  it('keeps clear of the prompt tray as well', () => {
    const tray = box(700, 400, 340, 300);
    const p = placePreview({ area, size, hovered: box(100, 300), keep: [tray] });
    expect(hits(p, tray)).toBe(false);
  });

  it('when nothing is clear, the hovered card is still the last thing covered', () => {
    const wide = { left: 8, top: 47, width: 300, height: 300 }; // no room beside the card
    const hovered = box(100, 100, 100, 140);
    const keep = [box(150, 100, 100, 140)];
    const p = placePreview({ area: wide, size, hovered, keep });
    const covered = (b: Box) => (hits(p, b) ? 1 : 0);
    expect(covered(hovered)).toBeLessThanOrEqual(covered(keep[0]!));
  });

  it('is deterministic without a hovered card', () => {
    expect(placePreview({ area, size, keep: [] })).toEqual({ left: area.left + area.width - size.width, top: area.top + area.height - size.height, clear: true });
  });
});

describe('over-board size (restores the 2026-10-16 size, issue #172)', () => {
  // The area is the board above the hand; the image takes what the notes block leaves (infoHeight + gap).
  const at = (rem: number, vh: number, hand: number, infoHeight = 56) =>
    overBoardWidth({ rem, vh, areaHeight: vh - 60 - hand - 16, infoHeight });

  it('1920x1080 is about 486 px wide (was 271 in the rail)', () => {
    expect(at(16, 1080, 270)).toBeGreaterThanOrEqual(475);
    expect(at(16, 1080, 270)).toBeLessThanOrEqual(486);
  });

  it('1366x768 is well above the old 271 px floor', () => {
    expect(at(12.5, 768, 192)).toBeGreaterThan(310);
  });

  it('never below the readable floor (271 px), whatever the room', () => {
    expect(at(10, 600, 152)).toBe(OVER_BOARD_MIN_W);
    expect(overBoardWidth({ rem: 16, vh: 1080, areaHeight: 100, infoHeight: 56 })).toBe(OVER_BOARD_MIN_W);
  });

  it('is capped by 66 % of the window height and 58 rem', () => {
    expect(overBoardWidth({ rem: 16, vh: 1000, areaHeight: 5000, infoHeight: 0 })).toBe(Math.round(660 * 0.716));
    expect(overBoardWidth({ rem: 10, vh: 5000, areaHeight: 5000, infoHeight: 0 })).toBe(Math.round(580 * 0.716));
  });

  it('a taller notes block leaves a smaller image', () => {
    expect(at(16, 1080, 270, 120)).toBeLessThan(at(16, 1080, 270, 40));
  });
});

describe('clear flag and fitting (issue #172: the bigger preview never costs the tray clearance)', () => {
  it('is clear when a candidate covers nothing, and not when every one covers the tray', () => {
    expect(placePreview({ area, size, hovered: box(100, 300), keep: [] }).clear).toBe(true);
    const wall = box(area.left, area.top, area.width, area.height);
    expect(placePreview({ area, size, hovered: box(100, 300), keep: [wall] }).clear).toBe(false);
  });

  it('a preview too tall to clear the tray narrows until it clears', () => {
    // Tray across the bottom of the area: only a preview under about 500 px tall (width about 320) clears it.
    const tray = box(area.left, 560, area.width, 152);
    const attempt = (width: number) => placePreview({ area, size: { width, height: Math.round(width / 0.716) + 60 }, hovered: box(100, 100), keep: [tray] });
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
