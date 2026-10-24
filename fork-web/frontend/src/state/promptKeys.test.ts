import { describe, expect, it, vi } from 'vitest';
import type { Intent } from '../model/intents';
import { scenarioById } from '../mock/scenarios';
import type { GameView } from '../model/types';
import {
  blurAfterClick,
  digitAction,
  dropsFocusAfterClick,
  escapeStep,
  handleSpace,
  ownsKey,
  pickDigitTarget,
  pressPrimary,
  promptKeysLive,
  refusalNote,
  refusalNoteStale,
  takesKeys,
} from './promptKeys';

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
  it('a keyboard-focused switch owns only Space and Enter: P and the other hotkeys still play (issue #125)', () => {
    expect(ownsKey(sw(true), ' ')).toBe(true);
    expect(ownsKey(sw(true), 'Enter')).toBe(true);
    expect(ownsKey(sw(true), 'p')).toBe(false);
    expect(ownsKey(sw(true), 'Escape')).toBe(false);
    expect(ownsKey(sw(false), ' ')).toBe(false);
    expect(ownsKey({ tagName: 'INPUT', type: 'text', matches: () => false }, 'p')).toBe(true);
    expect(ownsKey({ tagName: 'INPUT', type: 'text', matches: () => false }, 'Escape')).toBe(false);
    expect(ownsKey(null, 'p')).toBe(false);
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
  it('does not cancel a pick the engine does not allow cancelling (a mandatory discard, issue #139)', () => {
    const pick = (cancellable: boolean | undefined) => ({ kind: 'chooseTargets', purpose: 'pick', cancellable }) as never;
    expect(escapeStep(pick(false), {}, false)).toBeUndefined();
    expect(escapeStep(pick(true), {}, false)).toBe('cancel');
    expect(escapeStep({ kind: 'chooseTargets', purpose: 'target' } as never, {}, false)).toBe('cancel');
  });
  it('a mandatory pick still lets Esc close an open zone view or the tray peek', () => {
    const d = { kind: 'chooseTargets', purpose: 'pick', cancellable: false } as never;
    expect(escapeStep(d, { zoneView: { playerId: 'p1', zone: 'graveyard' } } as never, false)).toBe('zone');
    expect(escapeStep(d, { trayPeek: true }, false)).toBe('peek');
  });
});

describe('the click-to-blur listener (issue #126, #141)', () => {
  const sw = (focusVisible: boolean) => ({
    tagName: 'INPUT',
    type: 'checkbox',
    matches: (s: string) => s === ':focus-visible' && focusVisible,
    blur: vi.fn(),
  });
  it('blurs a switch the pointer focused', () => {
    const el = sw(false);
    blurAfterClick(el);
    expect(el.blur).toHaveBeenCalledTimes(1);
  });
  it('keeps a keyboard-focused switch, a text field and nothing focused', () => {
    const focused = sw(true);
    const text = { tagName: 'INPUT', type: 'text', matches: () => false, blur: vi.fn() };
    blurAfterClick(focused);
    blurAfterClick(text);
    blurAfterClick(null);
    expect(focused.blur).not.toHaveBeenCalled();
    expect(text.blur).not.toHaveBeenCalled();
  });
});

describe('the primary button click (issue #129, #141)', () => {
  const intent = { type: 'passPriority' } as unknown as Intent;
  it('a refused button shows the reason and sends nothing', () => {
    const send = vi.fn();
    const note = vi.fn();
    pressPrimary({ intent, refusal: 'Boggart Brute needs 2 blockers' }, send, note);
    expect(note).toHaveBeenCalledWith('Boggart Brute needs 2 blockers');
    expect(send).not.toHaveBeenCalled();
  });
  it('an allowed button sends its intent and says nothing', () => {
    const send = vi.fn();
    const note = vi.fn();
    pressPrimary({ intent }, send, note);
    expect(send).toHaveBeenCalledWith(intent);
    expect(note).not.toHaveBeenCalled();
  });
});

describe('the refusal note ends with the refusal (issue #141)', () => {
  const note = refusalNote({}, 'Boggart Brute needs 2 blockers');
  it('is marked a refusal and restarts the timer id', () => {
    expect(note).toEqual({ id: 1, text: 'Boggart Brute needs 2 blockers', refusal: true });
    expect(refusalNote({ promptNote: note }, 'x').id).toBe(2);
  });
  it('stays while the same refusal stands', () => {
    expect(refusalNoteStale(note, 'Boggart Brute needs 2 blockers')).toBe(false);
  });
  it('goes as soon as the block is valid (no refusal) or the refusal changes', () => {
    expect(refusalNoteStale(note, undefined)).toBe(true);
    expect(refusalNoteStale(note, 'Boggart Brute needs 3 blockers')).toBe(true);
  });
  it('never touches a plain note or no note', () => {
    expect(refusalNoteStale({ id: 1, text: "You can't play that right now." }, undefined)).toBe(false);
    expect(refusalNoteStale(undefined, undefined)).toBe(false);
  });
});

describe('the number-key branch of the key handler', () => {
  const hand = ['h1', 'h2', 'h3'];
  const game = (kind: 'pick' | 'priority'): GameView => {
    const g = scenarioById('duel').build();
    const decision: GameView['decision'] =
      kind === 'pick'
        ? {
            kind: 'chooseTargets',
            sourceCardId: 'h1',
            instruction: 'Discard 2 card(s)',
            legal: hand.map((id) => ({ kind: 'card' as const, id })),
            chosen: [],
            min: 2,
            max: 2,
            purpose: 'pick',
          }
        : g.decision;
    return { ...g, players: g.players.map((p) => (p.id === g.youId ? { ...p, hand } : p)), decision };
  };
  const mana = { cardId: 'land1', colours: ['W', 'U'] } as never;
  it('toggles the Nth card of the hand in a card pick', () => {
    expect(digitAction(game('pick'), '2', true, undefined)).toEqual({
      handled: true,
      intent: { type: 'toggleTarget', target: { kind: 'card', id: 'h2' } },
    });
  });
  it('is inert while an overlay or the inspector owns the prompt keys', () => {
    expect(digitAction(game('pick'), '2', false, mana)).toEqual({ handled: false });
  });
  it('lets the mana chooser take the Nth colour, then close', () => {
    expect(digitAction(game('priority'), '2', true, mana)).toEqual({
      handled: true,
      closeManaChoice: true,
      intent: { type: 'tapForMana', cardId: 'land1', colour: 'U' },
    });
  });
  it('spends the key on the chooser even without an Nth colour, and ignores it with no chooser', () => {
    expect(digitAction(game('priority'), '5', true, mana)).toEqual({ handled: true });
    expect(digitAction(game('priority'), '2', true, undefined)).toEqual({ handled: false });
    expect(digitAction(game('priority'), 'a', true, mana)).toEqual({ handled: false });
  });
});
