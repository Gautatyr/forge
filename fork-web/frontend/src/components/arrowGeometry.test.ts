import { describe, expect, it } from 'vitest';
import { lineEnd, outsideAnchor, sourceY, type Box } from './arrowGeometry';

const box = (left: number, top: number, w: number, h: number): Box => ({ left, top, right: left + w, bottom: top + h });

describe('target line start on a stack item (review of PR 16)', () => {
  const scroller = box(1650, 117, 250, 184);

  it('starts at the item centre when the item is fully visible', () => {
    expect(sourceY(box(1660, 130, 240, 60), scroller)).toBe(160);
  });

  it('starts on the visible part of a half-scrolled item', () => {
    const y = sourceY(box(1660, 80, 240, 90), scroller)!;
    expect(y).toBeGreaterThanOrEqual(117);
    expect(y).toBeLessThanOrEqual(170);
  });

  it('has no start when the item is scrolled out above the region', () => {
    expect(sourceY(box(1660, 3, 240, 90), scroller)).toBeUndefined();
  });

  it('has no start when the item is scrolled out below the region', () => {
    expect(sourceY(box(1660, 310, 240, 90), scroller)).toBeUndefined();
  });

  it('has no start when only a sliver of the item shows', () => {
    expect(sourceY(box(1660, 30, 240, 92), scroller)).toBeUndefined();
  });

  it('starts at the centre when the item is not in a scroll region', () => {
    expect(sourceY(box(0, 100, 10, 40), undefined)).toBe(120);
  });
});

describe('player target anchor (review of PR 16)', () => {
  const plate = box(24, 380, 200, 120);

  it('sits outside the plate, on the side the line comes from', () => {
    const p = outsideAnchor({ x: 1650, y: 160 }, plate, 16);
    const dx = Math.max(plate.left - p.x, 0, p.x - plate.right);
    const dy = Math.max(plate.top - p.y, 0, p.y - plate.bottom);
    expect(Math.hypot(dx, dy)).toBeGreaterThanOrEqual(16 - 0.01);
    expect(p.x).toBeGreaterThan(plate.right);
  });

  it('lies on the segment from the source to the plate centre', () => {
    const from = { x: 1650, y: 160 };
    const p = outsideAnchor(from, plate, 16);
    const c = { x: 124, y: 440 };
    const cross = (p.x - from.x) * (c.y - from.y) - (p.y - from.y) * (c.x - from.x);
    expect(Math.abs(cross)).toBeLessThan(1e-6 * Math.hypot(c.x - from.x, c.y - from.y) ** 2);
    expect(p.x).toBeLessThan(from.x);
  });

  it('leaves the plate from its top edge when the source is straight above it', () => {
    const p = outsideAnchor({ x: 124, y: 10 }, plate, 16);
    expect(p.x).toBeCloseTo(124, 6);
    expect(p.y).toBeCloseTo(plate.top - 16, 6);
  });
});

/** Euclidean distance from a point to a box (0 inside). */
const distToBox = (p: { x: number; y: number }, b: Box) =>
  Math.hypot(Math.max(b.left - p.x, 0, p.x - b.right), Math.max(b.top - p.y, 0, p.y - b.bottom));

describe('player target anchor at shallow angles (issue 23)', () => {
  // A wide, short plate: a near-horizontal line crosses its top edge close to a corner.
  const plate = box(24, 400, 400, 40);
  const centre = { x: 224, y: 420 };

  it('keeps the full gap from a wide, short plate for a near-horizontal source', () => {
    const from = { x: centre.x + 800, y: centre.y - 100 };
    const p = outsideAnchor(from, plate, 17);
    expect(distToBox(p, plate)).toBeGreaterThanOrEqual(17 - 1e-6);
  });

  it('keeps the gap for every source angle around the plate', () => {
    for (let deg = 0; deg < 360; deg += 1) {
      const a = (deg * Math.PI) / 180;
      const from = { x: centre.x + 1400 * Math.cos(a), y: centre.y + 1400 * Math.sin(a) };
      const p = outsideAnchor(from, plate, 17);
      expect(distToBox(p, plate)).toBeGreaterThanOrEqual(17 - 1e-6);
      // Still on the segment between the source and the plate centre.
      const cross = (p.x - from.x) * (centre.y - from.y) - (p.y - from.y) * (centre.x - from.x);
      expect(Math.abs(cross)).toBeLessThan(1e-6 * 1400 ** 2);
    }
  });

  it('ends at the source when the source is inside the gap', () => {
    const from = { x: plate.right + 5, y: centre.y };
    expect(outsideAnchor(from, plate, 17)).toEqual(from);
  });
});

describe('target line ends (review of PR 57)', () => {
  it('ends on a targeted card or player', () => {
    expect(lineEnd({ kind: 'card', id: '12' })).toBe('[data-card-id="12"]');
    expect(lineEnd({ kind: 'player', id: '1' })).toBe('[data-player-id="1"]');
  });

  it('draws no line to a stack item: its row in the stack panel is ringed instead', () => {
    expect(lineEnd({ kind: 'stackItem', id: '7' })).toBeUndefined();
  });
});
