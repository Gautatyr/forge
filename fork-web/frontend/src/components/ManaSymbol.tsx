import { Icon } from './Icon';
import styles from './ManaSymbol.module.css';
import { t, tDynamic, type MsgKey } from '../i18n';

/** Mana font 1.18.0 codepoints (`ms-w` … `ms-c`): each kind has its own shape (sun, drop, skull, flame, tree, diamond). */
const GLYPH: Record<string, string> = { W: '', U: '', B: '', R: '', G: '', C: '' };

const COLOUR: Record<string, string | undefined> = {
  W: styles.w,
  U: styles.u,
  B: styles.b,
  R: styles.r,
  G: styles.g,
  C: styles.c,
};

export type ManaState = 'plain' | 'paid' | 'unpaid';

/** Spoken name of a symbol: "green", "2 generic". */
export function manaName(symbol: string): string {
  if (/^[WUBRGC]$/.test(symbol)) return tDynamic(`mana.${symbol}` as MsgKey);
  return /^\d+$/.test(symbol) ? t('mana.generic', { n: symbol }) : symbol;
}

/**
 * One mana symbol as a disc: the Mana font's glyph for a colour, the number
 * for generic mana. While paying, `paid` is filled with a ✓ and `unpaid` is
 * outlined, so the state reads without colour.
 */
export function ManaSymbol({ symbol, state = 'plain' }: { symbol: string; state?: ManaState }) {
  const glyph = GLYPH[symbol];
  return (
    <span
      className={`${styles.sym} ${COLOUR[symbol] ?? styles.generic} ${styles[state]}`}
      role="img"
      aria-label={`${manaName(symbol)}${state === 'paid' ? `, ${t('mana.paid')}` : state === 'unpaid' ? `, ${t('mana.unpaid')}` : ''}`}
    >
      {glyph ? (
        <span className={styles.glyph} aria-hidden>
          {glyph}
        </span>
      ) : (
        <span className={styles.text} aria-hidden>
          {symbol}
        </span>
      )}
      {state === 'paid' ? (
        <span className={styles.check} aria-hidden>
          <Icon name="check" />
        </span>
      ) : null}
    </span>
  );
}
