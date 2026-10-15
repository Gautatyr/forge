import {
  useId,
  useLayoutEffect,
  useRef,
  useSyncExternalStore,
  type FocusEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import type { CardKeyword } from '../model/types';
import { grantedText, iconKeywords, keywordIcon, keywordLine, slotPlan, type KeywordIcon, type SizeTier } from './keywordCatalog';
import styles from './KeywordIcons.module.css';

/* --- One tooltip at a time ------------------------------------------------------ */

const SHOW_DELAY_MS = 300;
/** Time to move the pointer from an icon onto its tooltip (WCAG 1.4.13: hoverable). */
const HIDE_DELAY_MS = 150;

interface TipState {
  id: string;
  anchor: DOMRect;
}

let tip: TipState | undefined;
let timer: number | undefined;
const tipListeners = new Set<() => void>();

function setTip(next: TipState | undefined) {
  window.clearTimeout(timer);
  timer = undefined;
  if (tip === next) return;
  tip = next;
  for (const l of tipListeners) l();
}

function later(ms: number, fn: () => void) {
  window.clearTimeout(timer);
  timer = window.setTimeout(fn, ms);
}

const hideIf = (id: string) => () => {
  if (tip?.id === id) setTip(undefined);
  else window.clearTimeout(timer);
};

function onWindowKey(e: KeyboardEvent) {
  // Escape dismisses the tooltip without moving the pointer or focus, and does nothing else.
  if (e.key !== 'Escape' || !tip) return;
  e.preventDefault();
  e.stopPropagation();
  setTip(undefined);
}
const onWindowResize = () => setTip(undefined);

function subscribeTip(l: () => void) {
  if (tipListeners.size === 0) {
    window.addEventListener('keydown', onWindowKey, true);
    window.addEventListener('resize', onWindowResize);
  }
  tipListeners.add(l);
  return () => {
    tipListeners.delete(l);
    if (tipListeners.size > 0) return;
    window.removeEventListener('keydown', onWindowKey, true);
    window.removeEventListener('resize', onWindowResize);
  };
}

/** Hover (after 300 ms), keyboard focus and click open the tooltip; leaving, blur and Escape close it. */
function useTip() {
  const id = useId();
  const anchor = useSyncExternalStore(
    subscribeTip,
    () => (tip?.id === id ? tip.anchor : undefined),
    () => undefined,
  );
  const show = (el: HTMLElement) => setTip({ id, anchor: el.getBoundingClientRect() });
  const handlers = {
    onPointerEnter: (e: PointerEvent<HTMLElement>) => {
      const el = e.currentTarget;
      if (tip?.id === id) return window.clearTimeout(timer);
      later(tip ? 0 : SHOW_DELAY_MS, () => show(el));
    },
    onPointerLeave: () => later(HIDE_DELAY_MS, hideIf(id)),
    onFocus: (e: FocusEvent<HTMLElement>) => show(e.currentTarget),
    onBlur: hideIf(id),
    // Click (or tap) shows it at once; it never toggles off, since a click also focuses.
    onClick: (e: MouseEvent<HTMLElement>) => {
      if (tip?.id !== id) show(e.currentTarget);
    },
  };
  const tipProps = {
    id: `${id}-tip`,
    anchor,
    onPointerEnter: () => window.clearTimeout(timer),
    onPointerLeave: () => later(HIDE_DELAY_MS, hideIf(id)),
  };
  return { open: anchor !== undefined, tipId: tipProps.id, handlers, tipProps };
}

interface TooltipProps {
  id: string;
  anchor?: DOMRect;
  onPointerEnter: () => void;
  onPointerLeave: () => void;
  children: ReactNode;
}

/** Beside the icon (right, else left), vertically centred on it, kept on screen. */
function Tooltip({ id, anchor, onPointerEnter, onPointerLeave, children }: TooltipProps) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !anchor) return;
    const { width, height } = el.getBoundingClientRect();
    const margin = 8;
    const right = anchor.right + margin;
    const left = right + width <= window.innerWidth - margin ? right : Math.max(margin, anchor.left - margin - width);
    const top = Math.min(
      Math.max(margin, anchor.top + anchor.height / 2 - height / 2),
      window.innerHeight - margin - height,
    );
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
    el.style.visibility = 'visible';
  }, [anchor]);
  if (!anchor) return null;
  return createPortal(
    <div
      ref={ref}
      id={id}
      role="tooltip"
      className={styles.tip}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
    >
      {children}
    </div>,
    document.body,
  );
}

/* --- Icons ------------------------------------------------------------------------ */

const HIDE_ON: Record<SizeTier, string> = { l: styles.hideL!, m: styles.hideM!, s: styles.hideS! };
const TIERS: SizeTier[] = ['l', 'm', 's'];
const hideClasses = (shownOn: SizeTier[]) =>
  TIERS.filter((t) => !shownOn.includes(t))
    .map((t) => HIDE_ON[t])
    .join(' ');

function KeywordDisc({ icon, className }: { icon: KeywordIcon; className: string }) {
  const { open, tipId, handlers, tipProps } = useTip();
  const k = icon.keyword;
  const line = keywordLine(k);
  const granted = grantedText(k);
  return (
    <>
      <button
        type="button"
        className={`${styles.disc} ${k.grantedBy ? styles.granted : ''} ${className}`}
        aria-label={granted ? `${k.label}, ${granted.replace('Granted', 'granted').replace(' · ', ', ')}` : k.label}
        aria-describedby={open ? tipId : undefined}
        data-keyword={k.label}
        {...handlers}
      >
        <span className={styles.glyph} aria-hidden>
          {icon.char}
        </span>
      </button>
      <Tooltip {...tipProps}>
        <p className={styles.tipName}>{k.label}</p>
        {line ? <p className={styles.tipLine}>{line}</p> : null}
        {granted ? <p className={styles.tipGranted}>{granted}</p> : null}
      </Tooltip>
    </>
  );
}

function MoreChip({ hidden, className }: { hidden: KeywordIcon[]; className: string }) {
  const { open, tipId, handlers, tipProps } = useTip();
  const labels = hidden.map((i) => i.keyword.label);
  return (
    <>
      <button
        type="button"
        className={`${styles.disc} ${styles.more} ${className}`}
        aria-label={`${hidden.length} more keywords: ${labels.join(', ')}`}
        aria-describedby={open ? tipId : undefined}
        {...handlers}
      >
        +{hidden.length}
      </button>
      <Tooltip {...tipProps}>
        <p className={styles.tipName}>{hidden.length} more</p>
        <p className={styles.tipLine}>
          {hidden.map((i, n) => (
            <span key={i.keyword.label}>
              {n > 0 ? ' · ' : ''}
              {i.keyword.label}
              {i.keyword.grantedBy ? ' (added)' : ''}
            </span>
          ))}
        </p>
      </Tooltip>
    </>
  );
}

interface Props {
  keywords: CardKeyword[];
  /** Drawn tapped (rotated): icons turn back upright. */
  tapped: boolean;
  /** Where the column starts: above the combat strip, the damage badge or the P/T box, or the corner. */
  above: 'strip' | 'damage' | 'pt' | 'none';
  /** Overlay key held: every icon as a word chip instead. */
  words: boolean;
}

/**
 * Keyword icons in a column on the card's right edge, stacked up from above
 * the P/T box. The parent frame matches the card box (rotated with it when
 * tapped). How many fit depends on the card width (container queries).
 */
export function KeywordIcons({ keywords, tapped, above, words }: Props) {
  const icons = iconKeywords(keywords);
  if (!icons.length) return null;
  const start = { strip: styles.aboveStrip, damage: styles.aboveDamage, pt: styles.abovePt, none: '' }[above];

  if (words) {
    return (
      <span className={`${styles.words} ${tapped ? '' : start}`} data-arrow-occluder>
        {icons.map((i) => (
          <span
            key={i.keyword.label}
            className={`${styles.word} ${i.keyword.grantedBy ? styles.granted : ''}`}
            title={[i.keyword.label, grantedText(i.keyword)].filter(Boolean).join(' · ')}
          >
            {i.keyword.label}
          </span>
        ))}
      </span>
    );
  }

  const plan = slotPlan(icons.length);
  return (
    <span className={styles.frame}>
      <span className={`${styles.column} ${start} ${tapped ? styles.upright : ''}`} data-arrow-occluder>
        {plan.icons.map(({ index, tiers }) => (
          <KeywordDisc key={index} icon={icons[index]!} className={hideClasses(tiers)} />
        ))}
        {plan.more.map(({ tier, count }) => (
          <MoreChip key={tier} hidden={icons.slice(icons.length - count)} className={hideClasses([tier])} />
        ))}
      </span>
    </span>
  );
}

/** The keyword's disc as a static picture (the inspector's list); an empty slot for keywords without an icon. */
export function KeywordBadge({ keyword }: { keyword: CardKeyword }) {
  const icon = keywordIcon(keyword);
  if (!icon) return <span aria-hidden />;
  return (
    <span className={`${styles.disc} ${styles.badge} ${keyword.grantedBy ? styles.granted : ''}`} aria-hidden>
      <span className={styles.glyph}>{icon.char}</span>
    </span>
  );
}
