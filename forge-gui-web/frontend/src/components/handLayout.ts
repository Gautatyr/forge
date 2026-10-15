const RATIO = 0.716;
/** Share of the card height that holds the name and mana cost. Never covered. */
const NAME_BAND = 0.13;
/** Up to this many cards, the hand never overlaps (ruling D2). */
const NO_OVERLAP_UP_TO = 9;

export interface HandGeometry {
  cardW: number;
  cardH: number;
  step: number;
  stagger: boolean;
  raise: number;
  groupGap: number;
  gap: number;
}

/**
 * Pure layout maths, exported for tests: flat row up to 9 cards, then a
 * full-size two-level stagger where back cards show their whole name band
 * above the front ones, so overlap only ever covers art and text. Cards
 * shrink only when back cards would otherwise collide.
 */
export function handGeometry(n: number, extra: number, w: number, h: number, rem: number): HandGeometry {
  const gap = 0.6 * rem;
  const groupGap = extra > 0 ? 1.6 * rem : 0;
  const bottomPad = 0.9 * rem;
  let cardH = Math.min((h - bottomPad) / (1 + NAME_BAND), 22 * rem);
  let cardW = cardH * RATIO;
  const slots = n + extra;
  const gaps = Math.max(0, n - 1) * gap + Math.max(0, extra - 1) * gap + groupGap;
  const fit = slots > 0 ? (w - gaps) / slots : cardW;
  // Up to 9: always flat, shrinking if needed. Beyond 9: flat only while every
  // card fits at full size; otherwise stagger right away, with no shrinking
  // step first (ruling from mockup review 1).
  if (n <= NO_OVERLAP_UP_TO || fit >= cardW) {
    cardW = Math.min(cardW, fit);
    cardH = cardW / RATIO;
    return { cardW, cardH, step: cardW + gap, stagger: false, raise: cardH * NAME_BAND, groupGap, gap };
  }
  // Stagger: the hand part gets what the other-zone group leaves.
  const handW = (wHand: number) => w - (extra > 0 ? extra * wHand + (extra - 1) * gap + groupGap : 0);
  let step = (handW(cardW) - cardW) / (n - 1);
  if (step < cardW / 2) {
    // Shrink until back cards sit edge to edge (step = half a card):
    // (n−1)·cardW/2 + cardW + groupGap + extra·cardW + (extra−1)·gap = w.
    const fixed = extra > 0 ? groupGap + (extra - 1) * gap : 0;
    cardW = (w - fixed) / ((n - 1) / 2 + 1 + extra);
    step = cardW / 2;
  }
  step = Math.min(step, cardW + gap);
  cardH = cardW / RATIO;
  return { cardW, cardH, step, stagger: true, raise: cardH * NAME_BAND, groupGap, gap };
}
