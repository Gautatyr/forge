import type { Counter } from '../model/types';
import { t } from '../i18n';
import styles from './CounterPills.module.css';

/** What a pill reads: "+2" for +1/+1 counters, else the kind (cut with an ellipsis on a narrow card) and the count. */
export function counterParts(k: Counter): { kind?: string; count: string } {
  return k.kind === '+1/+1' ? { count: `+${k.count}` } : { kind: k.kind, count: String(k.count) };
}

/**
 * The counters of a battlefield permanent, one pill per kind. A pill never grows past its card (the next card in the
 * row would paint over it): the kind gives way first, the count never.
 *
 * `band`: a compact card (under `COMPACT_BELOW`) carries them at the left of its title band (Card.module.css
 * `.band`), the one strip no layout hides: a tapped card turns, a staggered back card is covered below its raised
 * strip, an attached card shows only its top. The name label gets the rest. There the kind is written only for a lone
 * kind on a wide band; several kinds are counts only (the kind is in the hover text and the inspector), so they stay
 * in one row beside the name. Otherwise the pills stack over the lower left corner, clear of the P/T box.
 */
export function CounterPills({ counters, band = false, attrs }: { counters: Counter[]; band?: boolean; attrs?: Record<string, string> }) {
  return (
    <span className={`${styles.counters} ${band ? styles.inBand : ''} ${band && counters.length > 1 ? styles.multi : ''}`} data-arrow-occluder {...attrs}>
      {counters.map((k) => {
        const { kind, count } = counterParts(k);
        return (
          <span key={k.kind} className={styles.counter} title={t('card.counterTitle', { count: k.count, kind: k.kind })}>
            {kind ? <span className={styles.kind}>{kind}</span> : null}
            <span className={styles.count}>{count}</span>
          </span>
        );
      })}
    </span>
  );
}
