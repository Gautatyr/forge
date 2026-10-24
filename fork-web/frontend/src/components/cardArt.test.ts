import { describe, expect, it } from 'vitest';
import type { CardImage } from '../model/types';
import { pickArtSource, textCardFontPct } from './cardArt';

const img: CardImage = {
  normal: '/img?key=a',
  large: '/img?key=a&large',
  fallback: { normal: 'https://scry/n', large: 'https://scry/l' },
};

describe('pickArtSource', () => {
  it('uses the bridge image, then the fallback, then nothing (the text card)', () => {
    expect(pickArtSource(img, 'large', [])).toBe('/img?key=a&large');
    expect(pickArtSource(img, 'large', ['/img?key=a&large'])).toBe('https://scry/l');
    expect(pickArtSource(img, 'large', ['/img?key=a&large', 'https://scry/l'])).toBeUndefined();
  });
  it('has no source for a card without an image', () => {
    expect(pickArtSource(undefined, 'large', [])).toBeUndefined();
  });
  it('a card without fallback ends at the text card when its image fails', () => {
    expect(pickArtSource({ normal: 'n', large: 'l' }, 'large', ['l'])).toBeUndefined();
  });
});

describe('textCardFontPct', () => {
  it('shrinks with the length of the rules text, never below a readable size', () => {
    expect(textCardFontPct('')).toBeGreaterThan(textCardFontPct('x'.repeat(200)));
    expect(textCardFontPct('x'.repeat(200))).toBeGreaterThan(textCardFontPct('x'.repeat(500)));
    expect(textCardFontPct('x'.repeat(5000))).toBeGreaterThanOrEqual(3.5);
  });
});
