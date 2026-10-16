import { describe, expect, it } from 'vitest';
import { expireLifeMarker, LIFE_MARKER_MS, nextLifeMarker, type LifeMarker } from './lifeMarker';

describe('life-change marker (design pass 4, P6)', () => {
  it('shows nothing until the life total changes', () => {
    expect(nextLifeMarker(undefined, 40)).toEqual({ life: 40, delta: 0, seq: 0 });
  });

  it('shows the change, for 4 s', () => {
    const m = nextLifeMarker(nextLifeMarker(undefined, 40), 37);
    expect(m).toEqual({ life: 37, delta: -3, seq: 1 });
    expect(LIFE_MARKER_MS).toBe(4000);
    expect(expireLifeMarker(m, m.seq).delta).toBe(0);
  });

  it('adds up changes that land while the marker is up; only the newest change’s timer hides it', () => {
    let m: LifeMarker = nextLifeMarker(undefined, 40);
    m = nextLifeMarker(m, 37);
    const first = m.seq;
    m = nextLifeMarker(m, 36);
    expect(m.delta).toBe(-4);
    expect(expireLifeMarker(m, first)).toBe(m);
    expect(expireLifeMarker(m, m.seq).delta).toBe(0);
  });

  it('starts over after the marker has gone', () => {
    let m: LifeMarker = nextLifeMarker(nextLifeMarker(undefined, 40), 37);
    m = expireLifeMarker(m, m.seq);
    m = nextLifeMarker(m, 41);
    expect(m.delta).toBe(4);
  });

  it('keeps the same marker while the life total does not move', () => {
    const m = nextLifeMarker(nextLifeMarker(undefined, 40), 37);
    expect(nextLifeMarker(m, 37)).toBe(m);
  });

  it('hides a gain and a loss that cancel out', () => {
    const m = nextLifeMarker(nextLifeMarker(nextLifeMarker(undefined, 40), 37), 40);
    expect(m.delta).toBe(0);
  });
});
