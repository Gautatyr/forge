import { useEffect, useRef, useState, type CSSProperties, type FocusEvent, type MouseEvent } from 'react';
import { currentFace, isCreature, shownFace } from '../model/selectors';
import type { CardView } from '../model/types';
import { useCardClick } from '../state/cardClick';
import type { CardStatus } from '../state/cardStatus';
import { useMatch } from '../state/MatchContext';
import { useOverlayKey } from '../state/overlayKey';
import { Icon, type IconName } from './Icon';
import { KeywordIcons, KW_AVOID_ATTR, type CardActions } from './KeywordIcons';
import { previewBeside } from './previewSpot';
import { iconKeywords } from './keywordCatalog';
import { cardStatusWithChoice } from './tray/inPlace';
import { useInPlacePick } from './tray/useInPlacePick';
import styles from './Card.module.css';

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

function badges(c: CardView, s: CardStatus): Badge[] {
  const out: Badge[] = [];
  if (s.selected) out.push({ icon: 'check', cls: styles.bSelected!, label: 'Selected' });
  if (s.actionable && s.actionKind === 'target' && !s.selected)
    out.push({ icon: 'target', cls: styles.bActionable!, label: 'Legal target' });
  if (s.actionable && s.actionKind === 'blockTarget' && !s.selected)
    out.push({ icon: 'sword', cls: styles.bAttack!, label: 'Attacking you: click to block it' });
  if (s.actionable && s.actionKind === 'block' && !s.blocking && !s.selected)
    out.push({ icon: 'shield', cls: styles.bActionable!, label: 'Can block' });
  if (s.actionable && s.actionKind === 'attack' && !s.attacking)
    out.push({ icon: 'sword', cls: styles.bActionable!, label: 'Can attack' });
  if (s.actionable && s.actionKind === 'defender' && !s.selected)
    out.push({ icon: 'sword', cls: styles.bActionable!, label: 'Can be attacked: click it, then your attackers' });
  if (s.attackedBy.length > 0)
    out.push({ icon: 'sword', cls: styles.bAttack!, label: `Attacked by ${s.attackedBy.join(', ')}` });
  if (s.targetSpot)
    out.push({ icon: 'target', cls: styles.bTargeted!, label: `Targeted by ${s.targetedBy.join(', ')}` });
  if (c.faceDown?.seen)
    out.push({ icon: 'eye', cls: styles.bNeutral!, label: `${c.faceDown.foretold ? 'Foretold' : 'Face down'}: only you can look at it` });
  if (c.isCommander) out.push({ icon: 'crown', cls: styles.bNeutral!, label: 'Commander' });
  if (c.summoningSick && isCreature(c) && c.zone === 'battlefield')
    out.push({ icon: 'sick', cls: styles.bNeutral!, label: 'Summoning sick' });
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

export function Card({ card: c, context, count = 1, groupIds, className, style, onActivate, ariaExtra, nameLabel = false }: Props) {
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
  const dir = ptDirection(c);
  // Attackers stay upright during combat so they remain readable (Arena does the same).
  const showTapped = c.tapped && onBoard && !s.attacking;
  const hasIcons = onBoard && c.zone === 'battlefield' && iconKeywords(c.keywords).length > 0;

  // Whether the pointer or focus is on this element: it started the hover and must end it.
  const hovered = useRef(false);
  const hover = (e: MouseEvent | FocusEvent) => {
    hovered.current = true;
    const beside = previewBeside(e.currentTarget as Element);
    setUi((u) => (u.hover?.cardId === c.id && !u.hover.beside === !beside ? u : { ...u, hover: { cardId: c.id, beside } }));
  };
  const unhover = () => {
    hovered.current = false;
    setUi((u) => (u.hover?.cardId === c.id ? { ...u, hover: undefined } : u));
  };
  // pointerleave and blur never fire on an element taken off the page (a land played from the hand, a spell
  // cast): end the hover when the hovered element goes, or the preview stays up until another card is hovered.
  useEffect(() => {
    const id = c.id;
    return () => {
      if (!hovered.current) return;
      hovered.current = false;
      setUi((u) => (u.hover?.cardId === id ? { ...u, hover: undefined } : u));
    };
  }, [c.id, setUi]);
  const actions: CardActions = {
    activate: () => {
      if (onActivate) return onActivate();
      // A group ("Forest ×3") stands for its first card: one click taps one land.
      const id = groupIds?.[0] ?? c.id;
      // An open in-place choice takes the click first; otherwise play, tap for mana or activate.
      if (!pickInPlace({ kind: 'card', id })) click(id);
    },
    inspect: () => setUi({ inspectId: c.id, hover: undefined }),
  };
  const avoid = { [KW_AVOID_ATTR]: '' };

  const label = [
    face.name,
    c.faceDown?.seen ? (c.faceDown.foretold ? 'foretold, face down' : 'face down') : '',
    count > 1 ? `${count} of them` : '',
    c.tapped ? 'tapped' : '',
    c.power !== undefined ? `${c.power}/${c.toughness}` : '',
    s.actionKind === 'mana' ? 'can pay: click to tap for mana' : '',
    onBoard ? c.keywords.map((k) => k.label).join(', ') : '',
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
    s.attacking && onBoard ? styles.nudged : '',
    count > 1 ? styles.grouped : '',
    nameLabel ? styles.labelled : '',
    className ?? '',
  ].join(' ');

  return (
    <div className={cls} style={style} data-card-id={c.id}>
      <button
        type="button"
        className={`${styles.card} ${ring ?? ''}`}
        aria-label={label}
        onClick={actions.activate}
        onContextMenu={(e) => {
          e.preventDefault();
          actions.inspect();
        }}
        onPointerEnter={hover}
        onPointerLeave={unhover}
        onFocus={hover}
        onBlur={unhover}
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
            <span className={styles.noImage}>{face.name}</span>
          )}
        </span>

        {showOverlays ? (
          <>
            <span className={styles.badges}>
              {badges(c, s).map((b) => (
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

            {onBoard && c.counters.length > 0 ? (
              <span className={styles.counters} data-arrow-occluder {...avoid}>
                {c.counters.map((k) => (
                  <span key={k.kind} className={styles.counter} title={`${k.count} ${k.kind} counter(s)`}>
                    {k.kind === '+1/+1' ? `+${k.count}` : `${k.kind} ${k.count}`}
                  </span>
                ))}
              </span>
            ) : null}

            {onBoard && c.damage > 0 ? (
              <span className={styles.damage} title={`${c.damage} damage marked`} data-arrow-occluder {...avoid}>
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
              <span className={`${styles.count} ${hasIcons ? styles.countLeft : ''}`} data-arrow-occluder {...avoid}>
                ×{count}
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
      {nameLabel ? (
        <span className={styles.nameLabel} aria-hidden>
          {face.name}
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
