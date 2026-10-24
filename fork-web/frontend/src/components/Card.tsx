import { useState, type CSSProperties } from 'react';
import { currentFace, faceName, isCreature, shownFace } from '../model/selectors';
import type { CardView } from '../model/types';
import { useCardClick } from '../state/cardClick';
import type { CardStatus } from '../state/cardStatus';
import { useMatch } from '../state/MatchContext';
import { useOverlayKey } from '../state/overlayKey';
import { CounterPills } from './CounterPills';
import { Icon, type IconName } from './Icon';
import { KeywordIcons, KW_AVOID_ATTR, type CardActions } from './KeywordIcons';
import { useCardHover } from './useCardHover';
import { linkNotes } from './cardLinks';
import { iconKeywords } from './keywordCatalog';
import { cardStatusWithChoice } from './tray/inPlace';
import { useInPlacePick } from './tray/useInPlacePick';
import styles from './Card.module.css';
import { t } from '../i18n';

export type CardContext = 'board' | 'hand' | 'thumb';

interface Props {
  card: CardView;
  context: CardContext;
  /** Size of the group this card stands for (identical tokens, lands). */
  count?: number;
  /** Ids in the group; the first is activated on click. */
  groupIds?: string[];
  className?: string;
  style?: CSSProperties;
  /** Override the click action (e.g. in the choice tray). */
  onActivate?: () => void;
  /** Extra label for screen readers. */
  ariaExtra?: string;
  /** Readable name over the title bar (small battlefield cards, pass-3 spec section 4). */
  nameLabel?: boolean;
  /** A small battlefield card (under `COMPACT_BELOW`): the counters go in the title band, name label or not. */
  compact?: boolean;
}

function ringClass(s: CardStatus): string | undefined {
  if (s.selected) return styles.ringSelected;
  if (s.attacking) return styles.ringAttack;
  if (s.blocking) return styles.ringBlock;
  // While you choose targets, legal targets keep their own ring.
  if (s.actionable && s.actionKind === 'target') return styles.ringTarget;
  if (s.targetSpot === 'hover') return styles.ringTargetedStrong;
  if (s.targetSpot === 'top') return styles.ringTargeted;
  if (s.actionable && s.actionKind === 'blockTarget') return styles.ringIncoming;
  if (s.actionable) return styles.ringActionable;
  return undefined;
}

interface Badge {
  icon: IconName;
  cls: string;
  label: string;
}

function badges(c: CardView, s: CardStatus, links: string[]): Badge[] {
  const out: Badge[] = [];
  if (s.selected) out.push({ icon: 'check', cls: styles.bSelected!, label: t('card.selected') });
  if (s.actionable && s.actionKind === 'target' && !s.selected)
    out.push({ icon: 'target', cls: styles.bActionable!, label: t('card.legalTarget') });
  if (s.actionable && s.actionKind === 'blockTarget' && !s.selected)
    out.push({ icon: 'sword', cls: styles.bAttack!, label: t('card.blockIt') });
  if (s.actionable && s.actionKind === 'block' && !s.blocking && !s.selected)
    out.push({ icon: 'shield', cls: styles.bActionable!, label: t('card.canBlock') });
  if (s.actionable && s.actionKind === 'attack' && !s.attacking)
    out.push({ icon: 'sword', cls: styles.bActionable!, label: t('card.canAttack') });
  if (s.actionable && s.actionKind === 'defender' && !s.selected)
    out.push({ icon: 'sword', cls: styles.bActionable!, label: t('card.canBeAttacked') });
  if (s.attackedBy.length > 0)
    out.push({ icon: 'sword', cls: styles.bAttack!, label: t('card.attackedBy', { names: s.attackedBy.join(', ') }) });
  if (s.targetSpot)
    out.push({ icon: 'target', cls: styles.bTargeted!, label: t('card.targetedBy', { names: s.targetedBy.join(', ') }) });
  if (c.faceDown?.seen)
    out.push({ icon: 'eye', cls: styles.bNeutral!, label: c.faceDown.foretold ? t('card.foretoldNote') : t('card.faceDownNote') });
  // Imprint, exiled with…: the held card is in the hover preview and the inspector, this marks that there is one.
  if (links.length) out.push({ icon: 'exile', cls: styles.bNeutral!, label: links.join('. ') });
  if (c.isCommander) out.push({ icon: 'crown', cls: styles.bNeutral!, label: t('card.commander') });
  if (c.summoningSick && isCreature(c) && c.zone === 'battlefield')
    out.push({ icon: 'sick', cls: styles.bNeutral!, label: t('card.sick') });
  return out;
}

function ptDirection(c: CardView): 'up' | 'down' | undefined {
  const f = currentFace(c);
  if (c.power === undefined || f.power === undefined) return undefined;
  const dp = c.power - (Number(f.power) || 0);
  const dt = (c.toughness ?? 0) - (Number(f.toughness) || 0);
  if (dp > 0 || dt > 0) return 'up';
  if (dp < 0 || dt < 0) return 'down';
  return undefined;
}

export function Card({ card: c, context, count = 1, groupIds, className, style, onActivate, ariaExtra, nameLabel = false, compact = false }: Props) {
  const { game, ui, setUi } = useMatch();
  const click = useCardClick();
  const words = useOverlayKey();
  // Scryfall's CDN occasionally refuses a burst of requests: retry once, then show the name.
  const [failures, setFailures] = useState<{ src: string; count: number }>();
  const pickInPlace = useInPlacePick();
  const s = cardStatusWithChoice(game, ui, c.id);
  // Drawn: your face-down card's real face (issue #80); its characteristics stay those of the face in play.
  const face = shownFace(c);
  // Live: the bridge's image first; when it has none, its fallback (Scryfall) at once.
  const [fellBack, setFellBack] = useState<string>();
  const own = face.image ?? c.front.image;
  const img = own?.fallback && fellBack === own.normal ? own.fallback : own;
  const onBoard = context === 'board';
  const showOverlays = context !== 'thumb';
  const ring = showOverlays ? ringClass(s) : undefined;
  const links = onBoard ? linkNotes(game, c) : [];
  const dir = ptDirection(c);
  // Attackers stay upright during combat so they remain readable (Arena does the same).
  const showTapped = c.tapped && onBoard && !s.attacking;
  const counterBand = onBoard && compact && c.counters.length > 0;
  const hasBand = nameLabel || counterBand;
  const hasIcons = onBoard && c.zone === 'battlefield' && iconKeywords(c.keywords).length > 0;

  const hover = useCardHover(c.id);
  const actions: CardActions = {
    activate: (hold = false) => {
      if (onActivate) return onActivate();
      // A group ("Forest ×3") stands for its first card: one click taps one land.
      const id = groupIds?.[0] ?? c.id;
      // An open in-place choice takes the click first; otherwise play, tap for mana or activate.
      if (!pickInPlace({ kind: 'card', id })) click(id, hold);
    },
    inspect: () => setUi({ inspectId: c.id, hover: undefined }),
  };
  const avoid = { [KW_AVOID_ATTR]: '' };

  const label = [
    faceName(face),
    c.faceDown?.seen ? (c.faceDown.foretold ? t('card.foretoldFaceDown') : t('card.faceDown')) : '',
    count > 1 ? t('card.ofThem', { count }) : '',
    // Groups split into chosen and not chosen: the state is in the name, not only in the ring (playtest 1 #16).
    showOverlays && s.selected ? t('card.selectedLower') : '',
    c.tapped ? t('card.tapped') : '',
    c.power !== undefined ? `${c.power}/${c.toughness}` : '',
    s.actionKind === 'mana' ? t('card.canPay') : '',
    onBoard ? c.keywords.map((k) => k.label).join(', ') : '',
    links.join(', '),
    ariaExtra ?? '',
  ]
    .filter(Boolean)
    .join(', ');

  const cls = [
    styles.slot,
    showTapped ? styles.tapped : '',
    context === 'hand' ? styles.hand : '',
    context === 'thumb' ? styles.thumb : '',
    s.dimmed ? styles.dimmed : '',
    // Cards with their own click (tray tiles, inspector) are not the choice's picks.
    s.inert && !onActivate ? styles.inert : '',
    s.attacking && onBoard ? styles.nudged : '',
    count > 1 ? styles.grouped : '',
    hasBand ? styles.labelled : '',
    className ?? '',
  ].join(' ');

  return (
    <div className={cls} style={style} data-card-id={c.id}>
      <button
        type="button"
        className={`${styles.card} ${ring ?? ''}`}
        aria-label={label}
        onClick={(e) => actions.activate(e.shiftKey)}
        onContextMenu={(e) => {
          e.preventDefault();
          actions.inspect();
        }}
        {...hover}
      >
        {count > 1 ? (
          <>
            <span className={styles.stackEdge} style={{ '--i': 2 } as CSSProperties} />
            <span className={styles.stackEdge} style={{ '--i': 1 } as CSSProperties} />
          </>
        ) : null}
        <span className={styles.face}>
          {img && !(failures?.src === img.normal && failures.count > 1) ? (
            <img
              key={failures?.src === img.normal ? failures.count : 0}
              src={failures?.src === img.normal ? `${img.normal}${img.normal.includes('?') ? '&' : '?'}retry=1` : img.normal}
              alt=""
              decoding="async"
              draggable={false}
              onError={() =>
                img === own && own.fallback
                  ? setFellBack(own.normal)
                  : window.setTimeout(
                      () => setFailures((f) => ({ src: img.normal, count: f?.src === img.normal ? f.count + 1 : 1 })),
                      1200,
                    )
              }
            />
          ) : (
            <span className={styles.noImage}>{faceName(face)}</span>
          )}
        </span>

        {showOverlays ? (
          <>
            <span className={styles.badges}>
              {badges(c, s, links).map((b) => (
                <span key={b.label} className={`${styles.badge} ${b.cls}`} title={b.label} {...avoid}>
                  <Icon name={b.icon} />
                </span>
              ))}
            </span>

            {s.attacking && onBoard ? (
              <span className={`${styles.combatStrip} ${styles.stripAttack}`} data-arrow-occluder {...avoid}>
                <Icon name="sword" />
                <span>{s.attacking.defender}</span>
              </span>
            ) : null}
            {s.blocking && onBoard ? (
              <span className={`${styles.combatStrip} ${styles.stripBlock}`} data-arrow-occluder {...avoid}>
                <Icon name="shield" />
                <span>{s.blocking.attacker}</span>
              </span>
            ) : null}

            {s.needsBlockers && onBoard ? (
              <span className={`${styles.combatStrip} ${styles.stripNeeds}`} title={t('card.needsTitle', { count: s.needsBlockers })} data-arrow-occluder {...avoid}>
                <Icon name="shield" />
                <span>{t('card.needs', { count: s.needsBlockers })}</span>
              </span>
            ) : null}

            {onBoard && !compact && c.counters.length > 0 ? <CounterPills counters={c.counters} attrs={avoid} /> : null}

            {onBoard && c.damage > 0 ? (
              <span className={styles.damage} title={t('card.damage', { count: c.damage })} data-arrow-occluder {...avoid}>
                <Icon name="burst" />
                {c.damage}
              </span>
            ) : null}

            {onBoard && c.power !== undefined ? (
              <span
                className={`${styles.pt} ${dir === 'up' ? styles.ptUp : dir === 'down' ? styles.ptDown : ''}`}
                data-arrow-occluder
                {...avoid}
              >
                {dir ? <Icon name={dir} /> : null}
                {c.power}/{c.toughness}
              </span>
            ) : null}

            {count > 1 ? (
              <span className={`${styles.count} ${hasIcons ? styles.countLeft : ''} ${s.selected ? styles.countSelected : ''}`} data-arrow-occluder {...avoid}>
                {s.selected ? <Icon name="check" /> : null}×{count}
              </span>
            ) : null}

            {s.actionKind === 'mana' && onBoard ? (
              <span className={styles.manaNotch} aria-hidden>
                <Icon name="mana" />
              </span>
            ) : null}
          </>
        ) : null}
      </button>
      {hasBand ? (
        <span className={styles.band}>
          {counterBand ? <CounterPills counters={c.counters} band attrs={avoid} /> : null}
          {nameLabel ? (
            <span className={styles.nameLabel} aria-hidden>
              {faceName(face)}
            </span>
          ) : null}
        </span>
      ) : null}
      {onBoard && c.zone === 'battlefield' ? (
        <span key={words ? 'words' : 'icons'} className={words ? styles.kwWords : styles.kw}>
          <KeywordIcons
            keywords={c.keywords}
            tapped={showTapped}
            above={s.attacking || s.blocking ? 'strip' : c.damage > 0 ? 'damage' : c.power !== undefined ? 'pt' : 'none'}
            words={words}
            card={actions}
          />
        </span>
      ) : null}
    </div>
  );
}
