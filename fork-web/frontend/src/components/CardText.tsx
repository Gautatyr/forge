import type { CSSProperties } from 'react';
import { faceName, faceText, faceType } from '../model/selectors';
import type { CardFace } from '../model/types';
import { textCardFontPct } from './cardArt';
import { ManaCost } from './ManaCost';
import styles from './CardText.module.css';
import { t } from '../i18n';

/**
 * A card with no picture, drawn from the engine's own card data: name, mana cost, type line, rules text, P/T or loyalty.
 * Sized by its className (width); the type grows with the card's width.
 */
export function CardText({ face, className = '' }: { face: CardFace; className?: string }) {
  const text = faceText(face);
  const stat = face.power !== undefined && face.toughness !== undefined ? `${face.power}/${face.toughness}` : face.loyalty ? t('card.loyalty', { count: face.loyalty }) : '';
  return (
    <div className={`${styles.card} ${className}`} data-text-card>
      <div className={styles.body} style={{ '--tc-size': textCardFontPct(text) } as CSSProperties}>
        <div className={styles.head}>
          <span className={styles.name}>{faceName(face)}</span>
          <ManaCost cost={face.manaCost} />
        </div>
        {faceType(face) ? <p className={styles.type}>{faceType(face)}</p> : null}
        <div className={styles.rules}>
          {text
            .split('\n')
            .filter(Boolean)
            .map((line, i) => (
              <p key={i}>{line}</p>
            ))}
        </div>
        {stat ? <span className={styles.stat}>{stat}</span> : null}
      </div>
    </div>
  );
}
