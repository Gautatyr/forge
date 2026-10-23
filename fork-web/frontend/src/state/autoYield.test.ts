import { describe, expect, it } from 'vitest';
import { switchesAutoYieldOn } from './autoYield';

describe('switchesAutoYieldOn', () => {
  it('switches auto-yield on when a click adds an ability while it is off', () => {
    expect(switchesAutoYieldOn({ type: 'toggleAutoYieldTo', key: 'A' }, false, ['B'])).toBe(true);
  });
  it('does not switch it on when the click removes an ability from the list', () => {
    expect(switchesAutoYieldOn({ type: 'toggleAutoYieldTo', key: 'A' }, false, ['A', 'B'])).toBe(false);
  });
  it('does nothing when auto-yield is already on, or for other intents', () => {
    expect(switchesAutoYieldOn({ type: 'toggleAutoYieldTo', key: 'A' }, true, [])).toBe(false);
    expect(switchesAutoYieldOn({ type: 'setAutoYield', on: true }, false, [])).toBe(false);
  });
});
