/** Text form of each seat glyph (Icon.tsx `SEAT_SHAPES`, same order), for tooltips and plain text. */
const SEAT_CHARS = ['●', '▲', '■', '◆', '⬟', '⬢', '★', '✚'];

export function seatChar(seat: number): string {
  return SEAT_CHARS[seat % SEAT_CHARS.length]!;
}
