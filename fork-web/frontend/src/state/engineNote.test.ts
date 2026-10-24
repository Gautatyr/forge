import { describe, expect, it } from 'vitest';
import type { Decision } from '../model/types';
import { engineNote, noteAfterAction, noteOver } from './engineNote';

const pick: Decision = {
  kind: 'chooseTargets',
  sourceCardId: 'c1',
  instruction: 'Select target player',
  legal: [],
  chosen: [],
  min: 1,
  max: 1,
};
const priority: Decision = { kind: 'priority', playable: [] };
const attackers: Decision = { kind: 'declareAttackers', candidates: [], defenders: [], defenderCards: [], draft: [] };
const REFUSAL = 'Merrow Witsniper - The selected card is not a player.';

describe('the engine message that refuses a target pick (issue #156)', () => {
  it('belongs to the pick: not a sticky note, not a plain one', () => {
    expect(engineNote(undefined, REFUSAL, pick)).toEqual({ id: 1, text: REFUSAL, pick: true });
    expect(engineNote({ id: 4, text: 'x' }, REFUSAL, pick).id).toBe(5);
  });
  it('goes with the next action, valid or not (refusal, then a valid pick: no refusal text)', () => {
    const note = engineNote(undefined, REFUSAL, pick);
    expect(noteAfterAction(note)).toBeUndefined();
  });
  it('goes when the pick ends without an action of the player (the page decision moved on)', () => {
    const note = engineNote(undefined, REFUSAL, pick);
    expect(noteOver(note, pick)).toBe(false);
    expect(noteOver(note, priority)).toBe(true);
  });
  it('a message outside a pick stays a plain note: timed, kept by an action', () => {
    const note = engineNote(undefined, "You can't play that right now.", priority);
    expect(note).toEqual({ id: 1, text: "You can't play that right now." });
    expect(noteAfterAction(note)).toBe(note);
    expect(noteOver(note, pick)).toBe(false);
  });
});

describe('the refused attack declaration (unchanged)', () => {
  const note = engineNote(undefined, 'Attack declaration invalid.', attackers);
  it('is sticky until the next action or the end of the declaration', () => {
    expect(note.sticky).toBe(true);
    expect(noteAfterAction(note)).toBeUndefined();
    expect(noteOver(note, attackers)).toBe(false);
    expect(noteOver(note, priority)).toBe(true);
  });
});
