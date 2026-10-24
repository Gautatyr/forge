import { describe, expect, it } from 'vitest';
import { fitTileSize, largestFit, noRegrow, pileShape, settleFit, tileKind, type FitState } from './tileFit';
import type { ChoicePrompt } from '../../model/types';
import type { ChoiceDraft } from '../../state/ui';
import { FILTER_FROM, moveBetween, moveItem } from './trayLogic';

describe('largestFit (tray card tiles shrink so the choices, key hints and confirm stay in view)', () => {
  it('keeps the full size when it fits', () => {
    expect(largestFit(4, 6.6, () => true)).toBeUndefined();
  });

  it('takes the largest size that fits, never below the minimum', () => {
    const size = largestFit(4, 6.6, (cw) => cw <= 5.2)!;
    expect(size).toBeLessThanOrEqual(5.2);
    expect(size).toBeGreaterThan(5.1);
  });

  it('leaves the full size (the body scrolls) when even the minimum does not fit', () => {
    expect(largestFit(4, 6.6, () => false)).toBeUndefined();
  });

  it('uses the minimum when only it fits', () => {
    expect(largestFit(4, 6.6, (cw) => cw <= 4)).toBe(4);
  });
});

describe('noRegrow (the tray height cap and the tile size must not flip every frame)', () => {
  it('never grows back within a prompt', () => {
    // what the fit finds frame by frame while the dock cap switches: shrink, room appears, shrink, room appears
    let floor = Infinity;
    const applied: (number | undefined)[] = [];
    for (const found of [undefined, 4.99, undefined, 5.4, undefined, 4.5, 6]) {
      const next = noRegrow(found, floor);
      floor = next.floor;
      applied.push(next.size);
    }
    expect(applied).toEqual([undefined, 4.99, 4.99, 4.99, 4.99, 4.5, 4.5]);
  });

  it('starts from the full size again for a new prompt or a resized window (floor Infinity)', () => {
    expect(noRegrow(undefined, Infinity)).toEqual({ size: undefined, floor: 6.6 });
    expect(noRegrow(5, Infinity)).toEqual({ size: 5, floor: 5 });
  });
});

describe('fitTileSize (the outcome the tray decides on)', () => {
  it('names the full size, a shrunk size, or the list when even the minimum does not fit', () => {
    expect(fitTileSize(4, 6.6, () => true)).toBe(6.6);
    expect(fitTileSize(4, 6.6, (cw) => cw <= 5.2)).toBeLessThanOrEqual(5.2);
    expect(fitTileSize(4, 6.6, () => false)).toBe('list');
  });
});

describe('settleFit (tiles or the compact list: decided once, never flickers)', () => {
  const fresh: FitState = { floor: Infinity, list: false };

  it('goes to the list when even the smallest tile does not fit and the body has a list form', () => {
    expect(settleFit('list', true, fresh)).toEqual({ size: undefined, state: { floor: Infinity, list: true } });
  });

  it('keeps the full-size tiles scrolling when the body has no list form', () => {
    expect(settleFit('list', false, fresh)).toEqual({ size: undefined, state: { floor: 6.6, list: false } });
  });

  it('stays on the list for the rest of the prompt whatever later measurements say', () => {
    // what the fit finds frame by frame while the dock cap moves: list, then room appears, then no room
    let state: FitState = fresh;
    const shown: boolean[] = [];
    for (const outcome of ['list', 6.6, 5, 'list', 4.2, 6.6] as const) {
      const next = settleFit(outcome, true, state);
      state = next.state;
      shown.push(next.state.list);
    }
    expect(shown).toEqual([true, true, true, true, true, true]);
  });

  it('never switches back from tiles to the list and back across frames: tiles only shrink, then the list is final', () => {
    let state: FitState = fresh;
    const shown: string[] = [];
    for (const outcome of [6.6, 5, 6, 4.5, 'list', 6.6, 4] as const) {
      const next = settleFit(outcome, true, state);
      state = next.state;
      shown.push(next.state.list ? 'list' : String(next.size ?? 'full'));
    }
    expect(shown).toEqual(['full', '5', '5', '4.5', 'list', 'list', 'list']);
  });
});

const chooseN = (over: object): ChoicePrompt =>
  ({ id: 'p', shape: 'chooseN', title: '', instruction: '', confirmLabel: 'OK', min: 1, max: 1, options: [], ...over }) as ChoicePrompt;

describe('tileKind (which trays have tiles that can become a list)', () => {
  const card = (id: string) => ({ id, label: id, cardId: id });
  it('card pickers and reveals do; text chips, menus and the number shapes do not', () => {
    expect(tileKind(chooseN({ options: [card('a'), card('b')] }))).toBe('pick');
    // a library search (more than the filter box starts at) scrolls by design
    expect(tileKind(chooseN({ options: Array.from({ length: FILTER_FROM + 1 }, (_, i) => card(`c${i}`)) }))).toBe('browse');
    expect(tileKind(chooseN({ max: 0, min: 0, options: [card('a')] }))).toBe('reveal');
    expect(tileKind(chooseN({ options: [{ id: 'x', label: 'Draw' }] }))).toBeUndefined();
    expect(tileKind(chooseN({ options: [card('a')], abilityMenu: true }))).toBeUndefined();
    expect(tileKind({ id: 'y', shape: 'yesNo' } as ChoicePrompt)).toBeUndefined();
  });

  it('two piles do (scry, surveil); a single ordered column is already a list', () => {
    const lists = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `l${i}`, label: 'L', hint: '', items: [] }));
    expect(tileKind({ id: 'o', shape: 'order', lists: lists(2) } as unknown as ChoicePrompt)).toBe('pick');
    expect(tileKind({ id: 'o', shape: 'order', lists: lists(1) } as unknown as ChoicePrompt)).toBeUndefined();
  });
});

describe('pileShape (a card moving between the piles of scry/surveil re-fits the tiles: the piles change shape)', () => {
  const pile = (id: string) => ({ id, label: id, hint: '', items: [] });
  const twoPiles = { id: 'o', shape: 'order', lists: [pile('top'), pile('bottom')] } as unknown as ChoicePrompt;
  const draft: ChoiceDraft = { promptId: 'o', selected: [], lists: { top: ['a', 'b', 'c'], bottom: [] } };

  it('changes when a card moves to the other pile, down to emptying one (its empty-pile note then wraps in a narrow column)', () => {
    const shapes = new Set<string>();
    let d = draft;
    for (const id of ['a', 'b', 'c']) {
      shapes.add(pileShape(twoPiles, d));
      d = moveBetween(d, id, 'top', 'bottom');
    }
    shapes.add(pileShape(twoPiles, d));
    expect(shapes.size).toBe(4);
  });

  it('stays the same when a card only moves within its pile', () => {
    expect(pileShape(twoPiles, moveItem(draft, 'top', 0, 1))).toBe(pileShape(twoPiles, draft));
  });

  it('is empty for what has no piles: a single ordered column, a pick', () => {
    expect(pileShape({ id: 'o', shape: 'order', lists: [pile('stack')] } as unknown as ChoicePrompt, draft)).toBe('');
    expect(pileShape(chooseN({}), draft)).toBe('');
  });
});
