import { describe, expect, it } from 'vitest';
import { mockScenariosAllowed } from './source';
import { shortcuts } from '../state/keymap';

describe('mock scenarios (issue #154)', () => {
  it('are never offered in a live game: picking one would drop the seat token', () => {
    expect(mockScenariosAllowed('live')).toBe(false);
    expect(mockScenariosAllowed('mock')).toBe(true);
    expect(mockScenariosAllowed('replay')).toBe(true);
  });

  it('the Keys panel lists the backtick key only where it works', () => {
    expect(shortcuts(true).some((k) => k.keys === '`')).toBe(true);
    expect(shortcuts(false).some((k) => k.keys === '`')).toBe(false);
  });
});
