import { useState, type CSSProperties, type FocusEvent, type MouseEvent } from 'react';
import { currentFace, isCreature } from '../model/selectors';
import type { CardView } from '../model/types';
import { cardStatus, type CardStatus } from '../state/cardStatus';
import { useMatch } from '../state/MatchContext';
import { Icon, type IconName } from './Icon';
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
  /** Show the "playable" notch under hand cards. */
  notch?: boolean;
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
  if (s.targetSpot)
    out.push({ icon: 'target', cls: styles.bTargeted!, label: `Targeted by ${s.targetedBy.join(', ')}` });
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

export function Card({ card: c, context, count = 1, groupIds, className, style, onActivate, ariaExtra, notch = true }: Props) {
  const { game, ui, setUi, activateCard } = useMatch();
  // Scryfall's CDN occasionally refuses a burst of requests: retry once, then show the name.
  const [failures, setFailures] = useState<{ src: string; count: number }>();
  const s = cardStatus(game, ui, c.id);
  const face = currentFace(c);
  const img = face.image ?? c.front.image;
  const onBoard = context === 'board';
  const showOverlays = context !== 'thumb';
  const ring = showOverlays ? ringClass(s) : undefined;
  const dir = ptDirection(c);
  // Attackers stay upright during combat so they remain readable (Arena does the same).
  const showTapped = c.tapped && onBoard && !s.attacking;

  const hover = (e: MouseEvent | FocusEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const side = r.left + r.width / 2 < window.innerWidth / 2 ? 'right' : 'left';
    setUi((u) => (u.hover?.cardId === c.id && u.hover.side === side ? u : { ...u, hover: { cardId: c.id, side } }));
  };
  const unhover = () => setUi((u) => (u.hover?.cardId === c.id ? { ...u, hover: undefined } : u));

  const label = [
    face.name,
    count > 1 ? `${count} of them` : '',
    c.tapped ? 'tapped' : '',
    c.power !== undefined ? `${c.power}/${c.toughness}` : '',
    s.playable ? 'playable' : '',
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
    className ?? '',
  ].join(' ');

  return (
    <div className={cls} style={style} data-card-id={c.id}>
      <button
        type="button"
        className={`${styles.card} ${ring ?? ''}`}
        aria-label={label}
        onClick={() => (onActivate ? onActivate() : activateCard(groupIds?.[0] ?? c.id))}
        onContextMenu={(e) => {
          e.preventDefault();
          setUi({ inspectId: c.id, hover: undefined });
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
                window.setTimeout(
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
                <span key={b.label} className={`${styles.badge} ${b.cls}`} title={b.label}>
                  <Icon name={b.icon} />
                </span>
              ))}
            </span>

            {s.attacking && onBoard ? (
              <span className={`${styles.combatStrip} ${styles.stripAttack}`}>
                <Icon name="sword" />
                <span>{s.attacking.defender}</span>
              </span>
            ) : null}
            {s.blocking && onBoard ? (
              <span className={`${styles.combatStrip} ${styles.stripBlock}`}>
                <Icon name="shield" />
                <span>{s.blocking.attacker}</span>
              </span>
            ) : null}

            {onBoard && c.counters.length > 0 ? (
              <span className={styles.counters}>
                {c.counters.map((k) => (
                  <span key={k.kind} className={styles.counter} title={`${k.count} ${k.kind} counter(s)`}>
                    {k.kind === '+1/+1' ? `+${k.count}` : `${k.kind} ${k.count}`}
                  </span>
                ))}
              </span>
            ) : null}

            {onBoard && c.damage > 0 ? (
              <span className={styles.damage} title={`${c.damage} damage marked`}>
                <Icon name="burst" />
                {c.damage}
              </span>
            ) : null}

            {onBoard && c.power !== undefined ? (
              <span className={`${styles.pt} ${dir === 'up' ? styles.ptUp : dir === 'down' ? styles.ptDown : ''}`}>
                {dir ? <Icon name={dir} /> : null}
                {c.power}/{c.toughness}
              </span>
            ) : null}

            {count > 1 ? <span className={styles.count}>×{count}</span> : null}

            {s.playable && context === 'hand' && notch ? (
              <span className={styles.playNotch} aria-hidden>
                <Icon name="play" />
              </span>
            ) : null}
          </>
        ) : null}
      </button>
    </div>
  );
}
