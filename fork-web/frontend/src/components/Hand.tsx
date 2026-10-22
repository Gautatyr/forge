import type { CSSProperties } from 'react';
import { you } from '../model/selectors';
import { useMatch } from '../state/MatchContext';
import { Card } from './Card';
import { handGeometry } from './handLayout';
import { otherZoneGroup } from './otherZoneGroup';
import { useSize } from './useSize';
import styles from './Hand.module.css';

export function Hand() {
  const { game } = useMatch();
  const me = you(game);
  const [ref, box] = useSize<HTMLDivElement>();

  const hand = me.hand.map((id) => game.cards[id]!);
  // Every card you may cast from another zone, whatever you can afford (design pass 4, P4).
  const other = otherZoneGroup(game);
  const g = handGeometry(hand.length, other.length, box.w, box.h, box.rem);
  const handWidth = hand.length > 0 ? (hand.length - 1) * g.step + g.cardW : 0;
  const otherLeft = handWidth + (other.length ? g.groupGap : 0);
  const total = otherLeft + (other.length ? other.length * g.cardW + (other.length - 1) * g.gap : 0);

  return (
    <section className={styles.hand} aria-label={`Your hand, ${hand.length} cards`}>
      <div ref={ref} className={styles.measure}>
        {box.w > 0 ? (
          <div
            className={styles.inner}
            style={{ width: total, '--cw': `${g.cardW}px`, '--raise': `${g.raise}px` } as CSSProperties}
          >
            {hand.length === 0 ? <p className={styles.empty}>Your hand is empty.</p> : null}
            {hand.map((c, i) => {
              const back = g.stagger && i % 2 === 1;
              return (
                <div
                  key={c.id}
                  className={`${styles.pos} ${back ? styles.back : styles.front}`}
                  style={{ left: i * g.step, top: g.stagger && !back ? g.raise : g.stagger ? 0 : g.raise }}
                >
                  <Card card={c} context="hand" />
                </div>
              );
            })}
            {other.length > 0 ? (
              <>
                <div
                  className={styles.divider}
                  style={{ left: handWidth + g.groupGap / 2, top: g.raise, height: g.cardH }}
                  aria-hidden
                />
                {other.map(({ card: c, caption }, j) => (
                  <div
                    key={c.id}
                    className={`${styles.pos} ${styles.front} ${styles.other}`}
                    style={{ left: otherLeft + j * (g.cardW + g.gap), top: g.raise }}
                  >
                    <span className={styles.caption}>{caption}</span>
                    {/* The caption (zone, commander tax) is also in the card's accessible name (issue #67). */}
                    <Card card={c} context="hand" ariaExtra={caption} />
                  </div>
                ))}
              </>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
