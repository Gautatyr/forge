import { currentFace } from '../model/selectors';
import { cardStatus } from '../state/cardStatus';
import { useMatch } from '../state/MatchContext';
import { Icon } from './Icon';
import styles from './HoverPreview.module.css';

/** Large card image on the half of the screen away from the pointer. */
export function HoverPreview() {
  const { game, ui } = useMatch();
  if (!ui.hover || ui.inspectId) return null;
  const c = game.cards[ui.hover.cardId];
  if (!c) return null;
  const face = currentFace(c);
  const img = face.image ?? c.front.image;
  const s = cardStatus(game, ui, c.id);
  const notes: string[] = [];
  if (c.zone === 'battlefield' && c.tapped) notes.push('Tapped');
  if (c.zone === 'battlefield' && c.power !== undefined && c.ptModifiers.length)
    notes.push(`Now ${c.power}/${c.toughness} (printed ${face.power}/${face.toughness})`);
  if (c.summoningSick && c.zone === 'battlefield') notes.push('Summoning sick: can’t attack or tap this turn');
  for (const k of c.counters) notes.push(`${k.count} × ${k.kind} counter`);
  if (c.damage) notes.push(`${c.damage} damage marked`);
  if (c.grantedKeywords.length) notes.push(`Has ${c.grantedKeywords.join(', ')}`);
  if (s.targetedBy.length) notes.push(`Targeted by ${s.targetedBy.join(', ')}`);
  if (c.attachments.length) notes.push(`Attached: ${c.attachments.map((a) => game.cards[a]?.name).join(', ')}`);

  return (
    <div className={`${styles.preview} ${styles[ui.hover.side]}`} aria-hidden>
      {img ? <img src={img.large} alt="" className={styles.img} /> : null}
      <div className={styles.info}>
        {notes.map((n) => (
          <span key={n} className={styles.note}>
            {n}
          </span>
        ))}
        <span className={styles.hint}>
          <Icon name="eye" /> Right-click or <kbd>I</kbd> to inspect{c.back ? ' both faces' : ''}
        </span>
      </div>
    </div>
  );
}
