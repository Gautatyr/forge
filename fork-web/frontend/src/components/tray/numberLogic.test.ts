import { describe, expect, it } from 'vitest';
import type { CardNameOption, DistributePrompt, InputPrompt } from '../../model/types';
import {
  autoAssign,
  canStep,
  distributeConfirm,
  everyBlockerLethal,
  exactName,
  inputConfirm,
  inputStart,
  leftToAssign,
  rangeText,
  rowNote,
  startAmounts,
  stepAmount,
  fitHeight,
  rowTabTarget,
  scrollToShow,
  stepNumber,
  suggestNames,
} from './numberLogic';

const base = { id: 'p', title: 't', instruction: '', confirmLabel: 'Assign damage' };

const divide: DistributePrompt = {
  ...base,
  shape: 'distribute',
  total: 5,
  recipients: [
    { id: 'a', label: 'Krenko', min: 1 },
    { id: 'b', label: 'Goblin Chieftain', min: 1 },
    { id: 'c', label: 'Mira', min: 1, playerId: 'mira' },
  ],
};

const combat: DistributePrompt = {
  ...base,
  shape: 'distribute',
  total: 6,
  recipients: [
    { id: 'hawk', label: 'Vampire Nighthawk', lethal: 3 },
    { id: 'elder', label: 'Sakura-Tribe Elder', lethal: 1 },
    { id: 'ana', label: 'Ana', playerId: 'ana' },
  ],
  combat: { attackerId: 'knight', deathtouch: false, trampleId: 'ana' },
};

const noTrample: DistributePrompt = {
  ...combat,
  recipients: combat.recipients.slice(0, 2),
  combat: { attackerId: 'knight', deathtouch: false },
};

describe('distribute an amount', () => {
  it("opens with each recipient at the engine's minimum and counts what is left", () => {
    const a = startAmounts(divide);
    expect(a).toEqual({ a: 1, b: 1, c: 1 });
    expect(leftToAssign(divide, a)).toBe(2);
  });

  it('steps by 1 or 5, never under the minimum nor over what is left', () => {
    let a = startAmounts(divide);
    a = stepAmount(divide, a, 'a', 1);
    expect(a.a).toBe(2);
    a = stepAmount(divide, a, 'b', 5); // only 1 left
    expect(a).toEqual({ a: 2, b: 2, c: 1 });
    expect(canStep(divide, a, 'c', 1)).toBe(false);
    a = stepAmount(divide, a, 'c', -5);
    expect(a.c).toBe(1);
    expect(canStep(divide, a, 'c', -1)).toBe(false);
  });

  it('confirm is enabled at 0 left and says why otherwise', () => {
    expect(distributeConfirm(divide, startAmounts(divide))).toEqual({ enabled: false, label: 'Assign 2 more' });
    const done = { a: 3, b: 1, c: 1 };
    expect(distributeConfirm(divide, done)).toEqual({
      enabled: true,
      label: 'Assign damage',
      answer: { shape: 'distribute', amounts: done },
    });
  });
});

describe('combat damage assignment', () => {
  it('opens on the automatic assignment: lethal to each blocker, the rest to the trampled player', () => {
    expect(autoAssign(combat)).toEqual({ hawk: 3, elder: 1, ana: 2 });
    expect(startAmounts(combat)).toEqual({ hawk: 3, elder: 1, ana: 2 });
    expect(distributeConfirm(combat, startAmounts(combat)).enabled).toBe(true);
  });

  it('without trample the rest goes to the last blocker; short damage stops at the first blockers', () => {
    expect(autoAssign(noTrample)).toEqual({ hawk: 3, elder: 3 });
    expect(autoAssign({ ...combat, total: 2 })).toEqual({ hawk: 2, elder: 0, ana: 0 });
  });

  it('the trample row is gated on lethal damage to every blocker', () => {
    const a = startAmounts(combat);
    expect(everyBlockerLethal(combat, a)).toBe(true);
    // Taking a point off a blocker below lethal returns the player's damage to the pool.
    const b = stepAmount(combat, a, 'hawk', -1);
    expect(b).toEqual({ hawk: 2, elder: 1, ana: 0 });
    expect(leftToAssign(combat, b)).toBe(3);
    expect(everyBlockerLethal(combat, b)).toBe(false);
    expect(canStep(combat, b, 'ana', 1)).toBe(false);
    expect(stepAmount(combat, b, 'ana', 1)).toEqual(b);
    // Blockers can take any amount: the excess can stay on them.
    const c = stepAmount(combat, b, 'elder', 3);
    expect(c).toEqual({ hawk: 2, elder: 4, ana: 0 });
    expect(distributeConfirm(combat, c).enabled).toBe(true);
  });
});

const xPrompt: InputPrompt = { ...base, shape: 'input', kind: 'number', min: 0, max: 7, defaultValue: '7', confirmLabel: 'Continue to payment' };

describe('row notes', () => {
  const dt: DistributePrompt = { ...combat, combat: { attackerId: 'knight', deathtouch: true, trampleId: 'ana' } };
  const row = (id: string) => dt.recipients.find((r) => r.id === id)!;
  it('names deathtouch on a creature only, and a player row by their life (pass 2 #2)', () => {
    expect(rowNote(dt, { ...row('elder'), lethal: 1 }, false, true)).toBe('Lethal 1 · deathtouch');
    expect(rowNote(dt, { ...row('ana'), lethal: 18 }, false, false)).toBe('Life 18');
    // a planeswalker defender: lethal is its loyalty, deathtouch does not apply
    expect(rowNote(dt, { id: 'jace', label: 'Jace', cardId: 'jace', lethal: 4 }, false, false)).toBe('Lethal 4');
    expect(rowNote(dt, row('ana'), true, false)).toBe('Assign lethal damage to every blocker first');
  });
  it('an infect attacker: a player row is the poison still to take, not their life', () => {
    const infect: DistributePrompt = { ...combat, combat: { attackerId: 'colossus', deathtouch: false, infect: true, trampleId: 'ana' } };
    expect(rowNote(infect, { id: 'ana', label: 'Ana', playerId: 'ana', lethal: 10 }, false, false)).toBe('Lethal 10 · poison');
  });
});

describe('number', () => {
  it("opens on the engine's default and shows the range", () => {
    expect(inputStart(xPrompt)).toBe('7');
    expect(inputStart({ ...xPrompt, defaultValue: undefined })).toBe('0');
    expect(rangeText(xPrompt)).toBe('0–7');
    expect(rangeText({ ...xPrompt, max: undefined })).toBe('0 or more');
  });

  it('steps within the range', () => {
    expect(stepNumber(xPrompt, '3', 1)).toBe('4');
    expect(stepNumber(xPrompt, '3', 5)).toBe('7');
    expect(stepNumber(xPrompt, '3', -5)).toBe('0');
    expect(stepNumber(xPrompt, '', 1)).toBe('0');
  });

  it('out of range: the step away from the range does nothing, the step towards it clamps', () => {
    expect(stepNumber(xPrompt, '12', 1)).toBe('12');
    expect(stepNumber(xPrompt, '12', 5)).toBe('12');
    expect(stepNumber(xPrompt, '12', -1)).toBe('7');
    expect(stepNumber(xPrompt, '7', 1)).toBe('7');
    expect(stepNumber(xPrompt, '0', -1)).toBe('0');
    const neg: InputPrompt = { ...xPrompt, min: -2 };
    expect(stepNumber(neg, '-5', -1)).toBe('-5');
    expect(stepNumber(neg, '-5', 1)).toBe('-2');
  });

  it('confirms a whole number in range only', () => {
    expect(inputConfirm(xPrompt, '3')).toEqual({ enabled: true, label: 'Continue to payment', answer: { shape: 'input', value: '3' } });
    expect(inputConfirm(xPrompt, ' 03 ').answer).toEqual({ shape: 'input', value: '3' });
    expect(inputConfirm(xPrompt, '8')).toEqual({ enabled: false, label: 'Choose 0–7' });
    expect(inputConfirm(xPrompt, '1.5').enabled).toBe(false);
    expect(inputConfirm(xPrompt, '')).toEqual({ enabled: false, label: 'Enter a number' });
  });
});

const NAMES: CardNameOption[] = [
  'Lightning Bolt',
  'Goblin Guide',
  'Goblin Matron',
  'Goblin Chieftain',
  'Krenko, Mob Boss',
  'Skirk Prospector',
  'Goblin Bombardment',
  'Mogg War Marshal',
  'Legion Warboss',
  'Goblin Rabblemaster',
  'Siege-Gang Commander',
].map((name) => ({ name, manaCost: '{R}', typeLine: 'Creature — Goblin' }));

describe('distribute: Tab between rows', () => {
  it('moves row to row, leaves after the last row only when the confirm can take focus', () => {
    expect(rowTabTarget(0, 3, false, false)).toBe(1);
    expect(rowTabTarget(2, 3, false, true)).toBeUndefined();
    expect(rowTabTarget(2, 3, false, false)).toBe(0);
    expect(rowTabTarget(1, 3, true, false)).toBe(0);
    expect(rowTabTarget(0, 3, true, false)).toBeUndefined();
  });
});

describe('name a card: fitting the tray', () => {
  it('shrinks to what the tray body has, never below the floor', () => {
    expect(fitHeight(212, 0, 96)).toBe(212);
    expect(fitHeight(212, 44, 96)).toBe(168);
    expect(fitHeight(212, 180, 96)).toBe(96);
  });

  it('scrolls the list just enough to show the highlighted row', () => {
    // row top, row bottom, list scrollTop, list height
    expect(scrollToShow(40, 60, 0, 100)).toBe(0);
    expect(scrollToShow(140, 160, 0, 100)).toBe(60);
    expect(scrollToShow(20, 40, 50, 100)).toBe(20);
  });
});

describe('name a card', () => {
  it('suggests up to 8 names, those starting with the text first', () => {
    const s = suggestNames(NAMES, 'gob');
    expect(s.length).toBeLessThanOrEqual(8);
    expect(s.map((n) => n.name).slice(0, 5)).toEqual([
      'Goblin Bombardment',
      'Goblin Chieftain',
      'Goblin Guide',
      'Goblin Matron',
      'Goblin Rabblemaster',
    ]);
    expect(suggestNames(NAMES, 'boss').map((n) => n.name)).toEqual(['Krenko, Mob Boss', 'Legion Warboss']);
    expect(suggestNames(NAMES, '  ')).toEqual([]);
  });

  it('confirms only an exact name, in its own spelling', () => {
    const p: InputPrompt = { ...base, shape: 'input', kind: 'cardName', cardNames: NAMES, confirmLabel: 'Name this card' };
    expect(exactName(NAMES, 'lightning bolt')?.name).toBe('Lightning Bolt');
    expect(inputConfirm(p, 'lightning bolt ')).toEqual({ enabled: true, label: 'Name this card', answer: { shape: 'input', value: 'Lightning Bolt' } });
    expect(inputConfirm(p, 'Lightning')).toEqual({ enabled: false, label: 'Choose a card name' });
  });

  it('free text needs something typed', () => {
    const p: InputPrompt = { ...base, shape: 'input', kind: 'text', confirmLabel: 'OK' };
    expect(inputConfirm(p, ' ')).toEqual({ enabled: false, label: 'Type an answer' });
    expect(inputConfirm(p, ' Hi ').answer).toEqual({ shape: 'input', value: 'Hi' });
  });
});
