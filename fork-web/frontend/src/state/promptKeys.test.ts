import { describe, expect, it } from 'vitest';
import type { Intent } from '../model/intents';
import { handleSpace, promptKeysLive } from './promptKeys';

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

describe('Space (swallowed always, sends only while live)', () => {
  const intent = { type: 'passPriority' } as unknown as Intent;
  const run = (ui: Parameters<typeof handleSpace>[1], action: Parameters<typeof handleSpace>[2]) => {
    const calls: string[] = [];
    handleSpace({ preventDefault: () => calls.push('prevent') }, ui, action, () => calls.push('send'));
    return calls;
  };
  it('sends the primary action with nothing open', () => {
    expect(run({}, { enabled: true, intent })).toEqual(['prevent', 'send']);
  });
  it('does not click a focused button behind an overlay or the inspector (preventDefault, no send)', () => {
    expect(run({ overlay: 'shortcuts' }, { enabled: true, intent })).toEqual(['prevent']);
    expect(run({ inspectId: '12' }, { enabled: true, intent })).toEqual(['prevent']);
  });
  it('never sends a guarded or disabled action', () => {
    expect(run({}, { enabled: true, intent, guard: {} })).toEqual(['prevent']);
    expect(run({}, { enabled: false, intent })).toEqual(['prevent']);
  });
});
