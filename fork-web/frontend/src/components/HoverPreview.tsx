import { cardName, currentFace, shownFace } from '../model/selectors';
import { cardStatus } from '../state/cardStatus';
import { useMatch } from '../state/MatchContext';
import { CardArt } from './CardArt';
import { linkNotes } from './cardLinks';
import { Icon } from './Icon';
import { previewSpot } from './previewSpot';
import styles from './HoverPreview.module.css';
import { t } from '../i18n';

/** "Right-click or I to inspect", the key in a <kbd>: the message splits around its placeholder. */
function InspectHint({ both }: { both: boolean }) {
  const [before, after] = t(both ? 'hp.inspectBoth' : 'hp.inspect', { key: '\u0000' }).split('\u0000');
  return (
    <>
      {before}
      <kbd>I</kbd>
      {after}
    </>
  );
}

/** Large card image in a fixed place: over the rail, or left of the rail / log drawer when the card is in it. */
export function HoverPreview() {
  const { game, ui } = useMatch();
  if (!ui.hover || ui.inspectId) return null;
  const c = game.cards[ui.hover.cardId];
  if (!c) return null;
  const face = currentFace(c);
  const img = shownFace(c).image ?? c.front.image;
  const s = cardStatus(game, ui, c.id);
  const spot = previewSpot(ui.hover, ui.logOpen);
  const notes: string[] = [];
  if (c.faceDown?.seen) notes.push(c.faceDown.foretold ? t('card.foretoldNote') : t('card.faceDownNote'));
  if (c.zone === 'battlefield' && c.tapped) notes.push(t('hp.tapped'));
  if (c.zone === 'battlefield' && c.power !== undefined && c.ptModifiers?.length)
    notes.push(t('hp.now', { power: c.power, toughness: c.toughness ?? 0, printedPower: face.power ?? 0, printedToughness: face.toughness ?? 0 }));
  if (c.summoningSick && c.zone === 'battlefield') notes.push(t('hp.sick'));
  for (const k of c.counters) notes.push(t('hp.counter', { count: k.count, kind: k.kind }));
  if (c.damage) notes.push(t('card.damage', { count: c.damage }));
  const added = c.keywords.filter((k) => k.grantedBy).map((k) => k.label);
  if (added.length) notes.push(t('hp.has', { names: added.join(', ') }));
  if (s.targetedBy.length) notes.push(t('card.targetedBy', { names: s.targetedBy.join(', ') }));
  notes.push(...linkNotes(game, c));
  if (c.attachments.length) notes.push(t('hp.attached', { names: c.attachments.map((a) => (game.cards[a] ? cardName(game.cards[a]!) : undefined)).join(', ') }));

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
          <Icon name="eye" /> <InspectHint both={!!c.back} />
        </span>
      </div>
    </div>
  );
}
