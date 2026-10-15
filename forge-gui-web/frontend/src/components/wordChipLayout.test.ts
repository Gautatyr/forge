import { describe, expect, it } from 'vitest';
import { placeWordChips, type Rect } from './wordChipLayout';

// Region 100×200; chips are right-aligned and stack up from the bottom.
const region = { width: 100, height: 200 };
const chip = (w: number, h = 20) => ({ width: w, height: h });
const more = chip(24);
const gap = 2;
const rect = (left: number, top: number, right: number, bottom: number): Rect => ({ left, top, right, bottom });

describe('word chips placed clear of the card overlays', () => {
  it('stacks every chip up from the bottom when nothing is in the way', () => {
    expect(placeWordChips(region, [chip(40), chip(60)], more, [], gap)).toEqual({ bottoms: [0, 22] });
  });

  it('jumps a chip over an overlay it would cover (P/T, group count)', () => {
    // P/T box in the bottom right corner, a count across the middle further up.
    const pt = rect(70, 180, 100, 200);
    const count = rect(30, 120, 70, 140);
    expect(placeWordChips(region, [chip(40), chip(50)], more, [pt, count], gap)).toEqual({ bottoms: [22, 82] });
  });

  it('a narrow chip passes beside an overlay a wide one would cover', () => {
    const badge = rect(0, 150, 30, 170);
    expect(placeWordChips(region, [chip(40), chip(40)], more, [badge], gap).bottoms).toEqual([0, 22]);
    expect(placeWordChips(region, [chip(40), chip(90)], more, [badge], gap).bottoms).toEqual([0, 52]);
  });

  it('collapses what does not fit into a "+N" chip in the last slot that fits', () => {
    // Room for three rows (0, 22, 44): two chips and "+2".
    expect(placeWordChips({ width: 100, height: 66 }, [chip(40), chip(40), chip(40), chip(40)], more, [], gap)).toEqual({
      bottoms: [0, 22],
      more: 44,
    });
    // Room for two rows: one chip and "+3".
    expect(placeWordChips({ width: 100, height: 50 }, [chip(40), chip(40), chip(40), chip(40)], more, [], gap)).toEqual({
      bottoms: [0],
      more: 22,
    });
  });

  it('the narrow "+N" chip can take a row a keyword chip could not', () => {
    const badge = rect(0, 0, 70, 25);
    expect(placeWordChips({ width: 100, height: 70 }, [chip(40), chip(40), chip(40)], more, [badge], gap)).toEqual({
      bottoms: [0, 22],
      more: 44,
    });
    // When the badge covers the whole row, a chip gives its row back to "+N".
    const wide = rect(0, 0, 100, 25);
    expect(placeWordChips({ width: 100, height: 70 }, [chip(40), chip(40), chip(40)], more, [wide], gap)).toEqual({
      bottoms: [0],
      more: 22,
    });
  });

  it('shows nothing when not even the "+N" chip fits', () => {
    const count = rect(0, 0, 100, 200);
    expect(placeWordChips(region, [chip(40)], more, [count], gap)).toEqual({ bottoms: [] });
  });

  it('ignores overlays that only touch the chip or sit outside the region', () => {
    const touching = rect(0, 170, 100, 180);
    const outside = rect(-50, 0, -10, 200);
    expect(placeWordChips(region, [chip(40)], more, [touching, outside], gap).bottoms).toEqual([0]);
  });

  it('caps a chip at the region width (it truncates with an ellipsis)', () => {
    const count = rect(0, 170, 10, 200);
    // A 150 px chip is drawn 100 wide, so it covers the count at the left edge.
    expect(placeWordChips(region, [chip(150)], more, [count], gap).bottoms).toEqual([32]);
  });
});
