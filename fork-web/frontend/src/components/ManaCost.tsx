import styles from './ManaCost.module.css';

const COLOUR: Record<string, string | undefined> = {
  W: styles.w,
  U: styles.u,
  B: styles.b,
  R: styles.r,
  G: styles.g,
};

/** A mana cost such as "{2}{G}{W}" drawn as letter pips (letters keep it colour-blind safe). */
export function ManaCost({ cost }: { cost: string }) {
  const symbols = [...cost.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]!);
  if (symbols.length === 0) return null;
  return (
    <span className={styles.cost} aria-label={`Mana cost ${symbols.join(' ')}`}>
      {symbols.map((s, i) => (
        <span key={i} className={`${styles.pip} ${COLOUR[s] ?? styles.generic}`} aria-hidden>
          {s.replace('/', '')}
        </span>
      ))}
    </span>
  );
}
