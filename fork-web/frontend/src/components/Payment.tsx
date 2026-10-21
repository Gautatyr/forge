import { Fragment } from 'react';
import { costPips, parseCost, poolEntries, usefulColours } from '../model/mana';
import type { Decision, GameView, ManaColour, ManaPool } from '../model/types';
import { ManaSymbol, manaName } from './ManaSymbol';
import styles from './Payment.module.css';

type Paying = Extract<Decision, { kind: 'payMana' }>;

/**
 * "Floating {G}{G} · empties at end of step": your pool, above the prompt,
 * only while it isn't empty. Three or more of a kind read "{G}×3". While you
 * pay, a symbol that still helps is a button that spends one.
 */
export function FloatingMana({
  pool,
  paying,
  onSpend,
}: {
  pool: ManaPool | undefined;
  paying?: Paying;
  onSpend: (colour: ManaColour) => void;
}) {
  const entries = poolEntries(pool);
  if (entries.length === 0) return null;
  const helps = (c: ManaColour) => !!paying && usefulColours(parseCost(paying.remaining), [c]).length > 0;
  return (
    <div className={styles.floating} aria-label="Floating mana">
      <span className={styles.floatLabel}>Floating</span>
      <span className={styles.pool}>
        {entries.map(([colour, n]) => {
          const symbols =
            n >= 3 ? (
              <>
                <ManaSymbol symbol={colour} />
                <span className={styles.times}>×{n}</span>
              </>
            ) : (
              Array.from({ length: n }, (_, i) => <ManaSymbol key={i} symbol={colour} />)
            );
          return helps(colour) ? (
            <button
              key={colour}
              type="button"
              className={styles.spend}
              title={`Pay with ${manaName(colour)} mana`}
              aria-label={`Pay with ${manaName(colour)} mana, ${n} floating`}
              onClick={() => onSpend(colour)}
            >
              {symbols}
            </button>
          ) : (
            <span key={colour} className={styles.group}>
              {symbols}
            </span>
          );
        })}
      </span>
      <span className={styles.floatNote}>· empties at end of step</span>
    </div>
  );
}

/** "Pay {2}{G}{W} for Sythis · includes tax {2}", paid symbols filled with ✓, unpaid outlined. */
export function PaymentCost({ game, paying }: { game: GameView; paying: Paying }) {
  const name = game.cards[paying.sourceCardId]?.name ?? 'this spell';
  const pips = costPips(paying.cost, paying.remaining);
  const extras = [
    paying.ability ? <Fragment key="ab">{paying.ability}</Fragment> : null,
    paying.x !== undefined ? <Fragment key="x">X = {paying.x}</Fragment> : null,
    paying.tax > 0 ? (
      <Fragment key="tax">
        includes tax <ManaSymbol symbol={String(paying.tax)} />
      </Fragment>
    ) : null,
  ].filter(Boolean);
  return (
    <p className={styles.cost}>
      <span className={styles.costLead}>Pay</span>
      <span className={styles.pips}>
        {pips.map((p, i) => (
          <ManaSymbol key={i} symbol={p.symbol} state={p.paid ? 'paid' : 'unpaid'} />
        ))}
      </span>
      <span className={styles.costFor}>
        for <b>{name}</b>
        {extras.map((e, i) => (
          <Fragment key={i}>
            <span className={styles.sep}> · </span>
            {e}
          </Fragment>
        ))}
      </span>
    </p>
  );
}
