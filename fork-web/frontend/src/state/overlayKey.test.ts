import { describe, expect, it } from 'vitest';
import { nextOverlayHeld } from './overlayKey';

describe('overlay key (D7: hold a key for all overlays)', () => {
  it('is held from Alt down to Alt up', () => {
    let held = nextOverlayHeld(false, { type: 'keydown', key: 'Alt', altKey: true });
    expect(held).toBe(true);
    held = nextOverlayHeld(held, { type: 'keydown', key: 'Alt', altKey: true }); // key repeat
    expect(held).toBe(true);
    expect(nextOverlayHeld(held, { type: 'keyup', key: 'Alt', altKey: false })).toBe(false);
  });

  it('lets go when the window loses focus (Alt+Tab never sends the key up)', () => {
    expect(nextOverlayHeld(true, { type: 'blur' })).toBe(false);
  });

  it('lets go when a key arrives without Alt (a missed key up)', () => {
    expect(nextOverlayHeld(true, { type: 'keydown', key: 'a', altKey: false })).toBe(false);
    expect(nextOverlayHeld(true, { type: 'keydown', key: 'a', altKey: true })).toBe(true);
  });

  it('ignores other keys while not held', () => {
    expect(nextOverlayHeld(false, { type: 'keydown', key: 'Shift', altKey: false })).toBe(false);
    expect(nextOverlayHeld(false, { type: 'keyup', key: 'Alt', altKey: false })).toBe(false);
  });
});
