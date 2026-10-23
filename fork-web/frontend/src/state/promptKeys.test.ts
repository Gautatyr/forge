import { describe, expect, it } from 'vitest';
import type { Intent } from '../model/intents';
import { scenarioById } from '../mock/scenarios';
import type { GameView } from '../model/types';
import { dropsFocusAfterClick, escapeStep, handleSpace, pickDigitTarget, promptKeysLive, takesKeys } from './promptKeys';

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

describe('Space on a refused answer says why (issue #129)', () => {
  it('notes the refusal instead of doing nothing, and sends nothing', () => {
    const calls: string[] = [];
    handleSpace(
      { preventDefault: () => calls.push('prevent') },
      {},
      { enabled: false, refusal: 'Boggart Brute needs 2 blockers' },
      () => calls.push('send'),
      (text) => calls.push(`note:${text}`),
    );
    expect(calls).toEqual(['prevent', 'note:Boggart Brute needs 2 blockers']);
  });
});

describe('a switch only takes the keys with keyboard focus (issue #126)', () => {
  const sw = (focusVisible: boolean) => ({ tagName: 'INPUT', type: 'checkbox', matches: (s: string) => s === ':focus-visible' && focusVisible });
  it('after a pointer click (no :focus-visible) Space reaches the screen', () => {
    expect(takesKeys(sw(false))).toBe(false);
  });
  it('a switch reached with Tab keeps its own Space', () => {
    expect(takesKeys(sw(true))).toBe(true);
  });
  it('text fields and selects always take the keys', () => {
    expect(takesKeys({ tagName: 'INPUT', type: 'text', matches: () => false })).toBe(true);
    expect(takesKeys({ tagName: 'SELECT' })).toBe(true);
    expect(takesKeys({ tagName: 'BUTTON' })).toBe(false);
    expect(takesKeys(null)).toBe(false);
  });
  it('a click makes a pointer-focused switch give up focus, never a keyboard-focused one or a text field', () => {
    expect(dropsFocusAfterClick(sw(false))).toBe(true);
    expect(dropsFocusAfterClick(sw(true))).toBe(false);
    expect(dropsFocusAfterClick({ tagName: 'INPUT', type: 'text', matches: () => false })).toBe(false);
    expect(dropsFocusAfterClick(null)).toBe(false);
  });
});

describe('digits in a card pick from your hand (issue #131)', () => {
  const pick = (hand: string[], legal: string[], purpose: 'pick' | 'target' = 'pick'): GameView => {
    const g = scenarioById('duel').build();
    return {
      ...g,
      players: g.players.map((p) => (p.id === g.youId ? { ...p, hand } : p)),
      decision: {
        kind: 'chooseTargets',
        sourceCardId: hand[0]!,
        instruction: 'Discard 2 card(s)',
        legal: legal.map((id) => ({ kind: 'card' as const, id })),
        chosen: [],
        min: 2,
        max: 2,
        purpose,
      },
    };
  };
  it('digit N names the Nth card of the hand when it is legal', () => {
    const g = pick(['h1', 'h2', 'h3'], ['h1', 'h3']);
    expect(pickDigitTarget(g, '1')).toEqual({ kind: 'card', id: 'h1' });
    expect(pickDigitTarget(g, '3')).toEqual({ kind: 'card', id: 'h3' });
  });
  it('names nothing for a card that is not legal, a missing slot, or a non-digit', () => {
    const g = pick(['h1', 'h2', 'h3'], ['h1', 'h3']);
    expect(pickDigitTarget(g, '2')).toBeUndefined();
    expect(pickDigitTarget(g, '4')).toBeUndefined();
    expect(pickDigitTarget(g, '0')).toBeUndefined();
    expect(pickDigitTarget(g, 'a')).toBeUndefined();
  });
  it('board picks and spell targets ignore digits', () => {
    expect(pickDigitTarget(pick(['h1'], ['bf1']), '1')).toBeUndefined();
    expect(pickDigitTarget(pick(['h1'], ['h1'], 'target'), '1')).toBeUndefined();
  });
});

describe('Esc (issue #130)', () => {
  const dec = (kind: 'declareAttackers' | 'declareBlockers', draft: unknown[]) =>
    ({ kind, candidates: [], attackers: [], defenders: [], defenderCards: [], draft }) as unknown as GameView['decision'];
  const attack = { attackerId: 'a1', defender: { kind: 'player', id: 'p2' } };
  const block = { blockerId: 'm1', attackerId: 'b1' };
  it('clears a non-empty attack or block draft (what Cancel Esc shows)', () => {
    expect(escapeStep(dec('declareAttackers', [attack]), {}, false)).toBe('cancel');
    expect(escapeStep(dec('declareBlockers', [block]), {}, false)).toBe('cancel');
  });
  it('does nothing on an empty draft', () => {
    expect(escapeStep(dec('declareAttackers', []), {}, false)).toBeUndefined();
    expect(escapeStep(dec('declareBlockers', []), {}, false)).toBeUndefined();
  });
  it('closes an open zone view first and keeps the draft', () => {
    expect(escapeStep(dec('declareBlockers', [block]), { zoneView: { playerId: 'p1', zone: 'graveyard' } } as never, false)).toBe('zone');
  });
  it('closes the inspector, an overlay, the log or a mana chooser before the draft', () => {
    const d = dec('declareBlockers', [block]);
    expect(escapeStep(d, { inspectId: '1' }, false)).toBe('inspect');
    expect(escapeStep(d, { overlay: 'shortcuts' }, false)).toBe('overlay');
    expect(escapeStep(d, { logOpen: true }, false)).toBe('log');
    expect(escapeStep(d, {}, true)).toBe('mana');
    expect(escapeStep(d, { pendingBlocker: 'm1' } as never, false)).toBe('pending');
  });
  it('still cancels a target pick, a payment or a cancellable choice', () => {
    expect(escapeStep({ kind: 'chooseTargets' } as never, {}, false)).toBe('cancel');
    expect(escapeStep({ kind: 'payMana' } as never, {}, false)).toBe('cancel');
    expect(escapeStep({ kind: 'choice', cancellable: true } as never, {}, false)).toBe('cancel');
    expect(escapeStep({ kind: 'choice', cancellable: false } as never, {}, false)).toBeUndefined();
  });
});
