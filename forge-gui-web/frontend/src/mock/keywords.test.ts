import { describe, expect, it } from 'vitest';
import { applyIntent } from './engine';
import { printedKeywords } from './keywords';
import { scenarioById } from './scenarios';

const labels = (oracleText: string) => printedKeywords(oracleText).map((k) => k.label);

describe('printed keywords read from oracle text (mock only; the bridge sends them later)', () => {
  it('reads keyword lines, one or several per line, and ignores ability lines', () => {
    expect(labels('Flying, vigilance, indestructible\nOther permanents you control have indestructible.')).toEqual([
      'Flying',
      'Vigilance',
      'Indestructible',
    ]);
    expect(labels('{T}: Add {G}.')).toEqual([]);
    expect(labels('Haste (This creature can attack and {T} as soon as it comes under your control.)')).toEqual(['Haste']);
  });

  it('keeps the value in the label and the bare keyword in the name', () => {
    const ks = printedKeywords(
      'This spell costs {1} less to cast.\nWard {2} (Whenever this creature becomes the target of a spell or ability an opponent controls, counter it unless that player pays {2}.)',
    );
    expect(ks).toEqual([
      {
        name: 'Ward',
        label: 'Ward {2}',
        reminder:
          'Whenever this creature becomes the target of a spell or ability an opponent controls, counter it unless that player pays {2}.',
      },
    ]);
    const knight = printedKeywords('First strike, protection from red');
    expect(knight.map((k) => [k.name, k.label])).toEqual([
      ['First strike', 'First strike'],
      ['Protection', 'Protection from red'],
    ]);
    expect(printedKeywords('Hexproof from black (reminder.)').map((k) => [k.name, k.label])).toEqual([
      ['Hexproof', 'Hexproof from black'],
    ]);
    expect(printedKeywords('Trample\nToxic 1 (Players dealt combat damage by this creature also get a poison counter.)')[1]).toMatchObject({
      name: 'Toxic',
      label: 'Toxic 1',
    });
  });

  it('includes keywords that get no icon (the inspector lists them)', () => {
    expect(labels('Enchant creature\nEnchanted creature gets +2/+0 and has trample.')).toEqual(['Enchant creature']);
    expect(labels('Equipped creature has hexproof and haste.\nEquip {1}')).toEqual(['Equip {1}']);
    expect(labels('Flash\nFlying')).toEqual(['Flash', 'Flying']);
  });
});

describe('mock permanents carry printed and added keywords', () => {
  it('marks keywords added by an attached card, printed ones first', () => {
    const g = scenarioById('keywords').build();
    const hawk = Object.values(g.cards).find((c) => c.name === 'Vampire Nighthawk')!;
    expect(hawk.keywords.map((k) => [k.label, k.grantedBy?.name, k.grantedBy?.untilEndOfTurn])).toEqual([
      ['Flying', undefined, undefined],
      ['Deathtouch', undefined, undefined],
      ['Lifelink', undefined, undefined],
      ['Hexproof', 'Swiftfoot Boots', false],
      ['Haste', 'Swiftfoot Boots', false],
    ]);
  });

  it('marks keywords added until end of turn, with the P/T change', () => {
    const g = scenarioById('blockers').build();
    const krenko = Object.values(g.cards).find((c) => c.name === 'Krenko, Mob Boss')!;
    expect(krenko.keywords).toContainEqual(
      expect.objectContaining({ label: 'Trample', grantedBy: expect.objectContaining({ name: 'Run Amok', untilEndOfTurn: true }) }),
    );
    expect(krenko.ptModifiers).toContainEqual({ source: 'Run Amok', power: 3, toughness: 3 });
  });

  it('does not repeat a keyword the card already has printed', () => {
    const g = scenarioById('keywords').build();
    const avacyn = Object.values(g.cards).find((c) => c.name === 'Avacyn, Angel of Hope')!;
    const knight = Object.values(g.cards).find((c) => c.name === 'Silver Knight')!;
    expect(avacyn.keywords.filter((k) => k.name === 'Indestructible')).toHaveLength(1);
    expect(knight.keywords.find((k) => k.name === 'Indestructible')?.grantedBy?.name).toBe('Avacyn, Angel of Hope');
  });

  it('Heroic Intervention adds hexproof and indestructible until end of turn', () => {
    let g = scenarioById('priority').build();
    const hi = g.players[0]!.hand.find((id) => g.cards[id]!.name === 'Heroic Intervention')!;
    g = applyIntent(g, { type: 'play', cardId: hi });
    g = applyIntent(g, { type: 'primary' });
    const eidolon = Object.values(g.cards).find((c) => c.name === 'Eidolon of Blossoms')!;
    expect(eidolon.keywords.filter((k) => k.grantedBy?.untilEndOfTurn).map((k) => [k.label, k.grantedBy!.name])).toEqual([
      ['Hexproof', 'Heroic Intervention'],
      ['Indestructible', 'Heroic Intervention'],
    ]);
  });
});
