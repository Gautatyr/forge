import { describe, expect, it } from 'vitest';
import { promptKeysLive } from './promptKeys';

describe('prompt keys (inert under an inspector or an overlay)', () => {
  it('are live with nothing open', () => {
    expect(promptKeysLive({})).toBe(true);
  });
  it('are inert while a card is inspected', () => {
    expect(promptKeysLive({ inspectId: '12' })).toBe(false);
  });
  it('are inert while an overlay is open', () => {
    expect(promptKeysLive({ overlay: 'shortcuts' })).toBe(false);
    expect(promptKeysLive({ overlay: 'display' })).toBe(false);
  });
});
