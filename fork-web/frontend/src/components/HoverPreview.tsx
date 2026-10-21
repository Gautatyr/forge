import { currentFace } from '../model/selectors';
import { cardStatus } from '../state/cardStatus';
import { useMatch } from '../state/MatchContext';
import { CardArt } from './CardArt';
import { Icon } from './Icon';
import { previewSpot } from './previewSpot';
import styles from './HoverPreview.module.css';

/** Large card image in a fixed place: over the rail, or left of the rail / log drawer when the card is in it. */
export function HoverPreview() {
  const { game, ui } = useMatch();
  if (!ui.hover || ui.inspectId) return null;
  const c = game.cards[ui.hover.cardId];
  if (!c) return null;
  const face = currentFace(c);
  const img = face.image ?? c.front.image;
  const s = cardStatus(game, ui, c.id);
  const spot = previewSpot(ui.hover, ui.logOpen);
  const notes: string[] = [];
  if (c.zone === 'battlefield' && c.tapped) notes.push('Tapped');
  if (c.zone === 'battlefield' && c.power !== undefined && c.ptModifiers.length)
    notes.push(`Now ${c.power}/${c.toughness} (printed ${face.power}/${face.toughness})`);
  if (c.summoningSick && c.zone === 'battlefield') notes.push('Summoning sick: can’t attack or tap this turn');
  for (const k of c.counters) notes.push(`${k.count} × ${k.kind} counter`);
  if (c.damage) notes.push(`${c.damage} damage marked`);
  const added = c.keywords.filter((k) => k.grantedBy).map((k) => k.label);
  if (added.length) notes.push(`Has ${added.join(', ')}`);
  if (s.targetedBy.length) notes.push(`Targeted by ${s.targetedBy.join(', ')}`);
  if (c.attachments.length) notes.push(`Attached: ${c.attachments.map((a) => game.cards[a]?.name).join(', ')}`);

  return (
    <div className={spot === 'rail' ? styles.preview : `${styles.preview} ${styles[spot]}`} aria-hidden>
      {img ? <CardArt key={img.large} image={img} size="large" alt="" className={styles.img} /> : null}
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
