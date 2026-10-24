import { describe, expect, it } from 'vitest';
import { OVER_BOARD_MIN_W, overBoardWidth, placePreview, type Box } from './previewPlacement';

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
    expect(placePreview({ area, size, keep: [] })).toEqual({ left: area.left + area.width - size.width, top: area.top + area.height - size.height });
  });
});

describe('over-board size', () => {
  it('is at least the 1920 in-rail image (271 px wide)', () => {
    expect(overBoardWidth(12.5, 665)).toBe(OVER_BOARD_MIN_W);
    expect(overBoardWidth(10, 400)).toBe(OVER_BOARD_MIN_W);
  });

  it('grows with the UI scale, and with room, never past 70 % of the area height', () => {
    expect(overBoardWidth(20, 900)).toBe(339);
    expect(overBoardWidth(30, 700)).toBe(Math.round(700 * 0.7 * 0.716));
    expect(overBoardWidth(30, 500)).toBe(OVER_BOARD_MIN_W); // the floor wins
  });
});
