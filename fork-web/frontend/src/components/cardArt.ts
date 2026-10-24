import type { CardImage } from '../model/types';

/** The source to draw for a card image given the ones that already failed; undefined = none left, draw the text card. */
export function pickArtSource(image: CardImage | undefined, size: 'normal' | 'large', failed: readonly string[]): string | undefined {
  for (let i: CardImage | undefined = image; i; i = i.fallback) if (!failed.includes(i[size])) return i[size];
  return undefined;
}

/**
 * Font size of the text card in % of its width: the full engine text must stay readable, so long rules text
 * (Commander cards run to 300+ characters) gets a smaller size before the card has to grow.
 */
export function textCardFontPct(text: string): number {
  const n = text.length;
  return n <= 120 ? 5.4 : n <= 240 ? 4.8 : n <= 400 ? 4.2 : 3.7;
}
