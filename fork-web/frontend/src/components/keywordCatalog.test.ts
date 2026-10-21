import { describe, expect, it } from 'vitest';
import manaCss from 'mana-font/css/mana.css?raw';
import sheet from '../../../../docs/fork/design/keyword-icons.html?raw';
import type { CardKeyword } from '../model/types';
import { MANA_GLYPHS, grantedText, iconKeywords, keywordIcon, keywordLine, slotPlan } from './keywordCatalog';

const kw = (label: string, name = label, extra: Partial<CardKeyword> = {}): CardKeyword => ({ name, label, ...extra });
const decode = (s: string) => s.replace(/&#x27;/g, "'").replace(/&amp;/g, '&').trim();

/** Tiles of the approved reference sheet: name, Mana class, codepoint and one-line text. */
function sheetTiles(sectionId: string) {
  const section = sheet.split(`<section id="${sectionId}"`)[1]!.split('</section>')[0]!;
  return section
    .split('<article class="tile">')
    .slice(1)
    .map((t) => ({
      name: decode(/<h3>(.*?)<\/h3>/.exec(t)![1]!),
      line: decode(/<p class="line">(.*?)<\/p>/.exec(t)![1]!),
      cls: /<code class="cls">ms-(.*?)<\/code>/.exec(t)![1]!,
      codepoint: parseInt(/<span class="ms">&#x([0-9a-f]+);<\/span>/.exec(t)![1]!, 16),
    }));
}

describe('keyword icon set matches the approved sheet (docs/fork/design/keyword-icons.html)', () => {
  const own = sheetTiles('own');
  const more = sheetTiles('more');

  it('reads 15 own icons and 11 more from the sheet', () => {
    expect(own).toHaveLength(15);
    expect(more).toHaveLength(11);
  });

  it.each([...own, ...more])('$name: same glyph and one-line text', (t) => {
    const name = t.name.startsWith('Hexproof from') ? 'Hexproof' : t.name;
    const icon = keywordIcon(kw(t.name, name))!;
    expect(icon.glyph).toBe(t.cls);
    expect(icon.char.codePointAt(0)).toBe(t.codepoint);
    expect(keywordLine(kw(t.name, name))).toBe(t.line);
  });

  it('every glyph has the codepoint mana-font 1.18.0 gives its class', () => {
    for (const [cls, cp] of Object.entries(MANA_GLYPHS)) {
      const m = new RegExp(`\\.ms-${cls}::before[^{]*\\{\\s*content: "\\\\([0-9a-f]+)"`).exec(manaCss);
      expect(m, cls).not.toBeNull();
      expect(parseInt(m![1]!, 16), cls).toBe(cp);
    }
  });
});

describe('which keywords get which icon', () => {
  it('other battlefield keywords get the generic static or triggered icon', () => {
    expect(keywordIcon(kw('Protection from red', 'Protection'))!.glyph).toBe('ability-static');
    expect(keywordIcon(kw('Shroud'))!.glyph).toBe('ability-static');
    expect(keywordIcon(kw('Infect'))!.glyph).toBe('ability-static');
    expect(keywordIcon(kw('Annihilator 2', 'Annihilator'))!.glyph).toBe('ability-triggered');
    expect(keywordIcon(kw('Bushido 1', 'Bushido'))!.glyph).toBe('ability-triggered');
  });

  it.each([
    ['Flash', 'Flash'],
    ['Cycling {2}', 'Cycling'],
    ['Plainscycling {2}', 'Plainscycling'],
    ['Kicker {1}{G}', 'Kicker'],
    ['Flashback {2}{G}', 'Flashback'],
    ['Cascade', 'Cascade'],
    ['Convoke', 'Convoke'],
    ['Enchant creature', 'Enchant'],
    ['Equip {1}', 'Equip'],
  ])('%s gets no icon', (label, name) => {
    expect(keywordIcon(kw(label, name))).toBeUndefined();
  });

  it('orders added keywords first, then evasion, combat, protection, the rest', () => {
    const boots = { cardId: 'b', name: 'Swiftfoot Boots', untilEndOfTurn: false };
    const ks = [
      kw('Prowess'),
      kw('Ward {2}', 'Ward'),
      kw('Lifelink'),
      kw('Flash'),
      kw('Flying'),
      kw('Haste', 'Haste', { grantedBy: boots }),
      kw('Annihilator 2', 'Annihilator'),
      kw('Menace'),
      kw('Hexproof', 'Hexproof', { grantedBy: boots }),
    ];
    expect(iconKeywords(ks).map((i) => i.keyword.label)).toEqual([
      'Haste',
      'Hexproof',
      'Flying',
      'Menace',
      'Lifelink',
      'Ward {2}',
      'Prowess',
      'Annihilator 2',
    ]);
  });
});

describe('hover text', () => {
  it('uses our line for the set, the engine reminder for the long tail', () => {
    expect(keywordLine(kw('Ward {2}', 'Ward'))).toBe(
      "Opponents' spells and abilities that target it are countered unless they pay the ward cost.",
    );
    expect(keywordLine(kw('Annihilator 2', 'Annihilator', { reminder: 'Whenever it attacks, …' }))).toBe('Whenever it attacks, …');
    expect(keywordLine(kw('Shroud'))).toBeUndefined();
  });

  it('names the card that added it and whether it lasts until end of turn', () => {
    expect(grantedText(kw('Flying'))).toBeUndefined();
    expect(grantedText(kw('Haste', 'Haste', { grantedBy: { cardId: 'b', name: 'Swiftfoot Boots', untilEndOfTurn: false } }))).toBe(
      'Granted by Swiftfoot Boots',
    );
    expect(grantedText(kw('Trample', 'Trample', { grantedBy: { cardId: 'r', name: 'Run Amok', untilEndOfTurn: true } }))).toBe(
      'Granted by Run Amok · until end of turn',
    );
  });
});

describe('how many icons fit (spec: 3 on cards ≥ 110 px, 2 on 72–109 px, else +N)', () => {
  const shown = (n: number, tier: 'l' | 'm' | 's') => {
    const p = slotPlan(n);
    return {
      icons: p.icons.filter((i) => i.tiers.includes(tier)).map((i) => i.index),
      more: p.more.find((m) => m.tier === tier)?.count,
    };
  };

  it('shows every icon while they fit', () => {
    expect(shown(3, 'l')).toEqual({ icons: [0, 1, 2], more: undefined });
    expect(shown(2, 'm')).toEqual({ icons: [0, 1], more: undefined });
    expect(shown(1, 's')).toEqual({ icons: [0], more: undefined });
  });

  it('keeps the last slot for a +N chip when they do not', () => {
    expect(shown(5, 'l')).toEqual({ icons: [0, 1], more: 3 });
    expect(shown(3, 'm')).toEqual({ icons: [0], more: 2 });
    expect(shown(2, 's')).toEqual({ icons: [], more: 2 });
  });

  it('never fills more slots than the tier has', () => {
    for (let n = 0; n <= 8; n++) {
      for (const [tier, slots] of [['l', 3], ['m', 2], ['s', 1]] as const) {
        const s = shown(n, tier);
        expect(s.icons.length + (s.more ? 1 : 0)).toBe(Math.min(n, slots));
        expect(s.icons.length + (s.more ?? 0)).toBe(n);
      }
    }
  });
});
