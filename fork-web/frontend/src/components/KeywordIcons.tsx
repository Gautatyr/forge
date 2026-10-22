import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type FocusEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import type { CardKeyword } from '../model/types';
import { grantedAria, grantedText, iconKeywords, keywordIcon, keywordLine, slotPlan, type KeywordIcon, type SizeTier } from './keywordCatalog';
import { placeWordChips, type Rect, type WordChipPlacement } from './wordChipLayout';
import styles from './KeywordIcons.module.css';
import { t } from '../i18n';

/** What a click or right-click on the card does; icons and chips forward pointer clicks to it. */
export interface CardActions {
  activate: () => void;
  inspect: () => void;
}

/* --- One tooltip at a time ------------------------------------------------------ */

const SHOW_DELAY_MS = 300;
/** Time to move the pointer from an icon onto its tooltip (WCAG 1.4.13: hoverable). */
const HIDE_DELAY_MS = 150;

interface TipState {
  id: string;
  /** Snapshot of the icon's box; the tooltip closes when something scrolls the icon (see onWindowMove). */
  anchor: DOMRect;
  el: HTMLElement;
}

let tip: TipState | undefined;
let timer: number | undefined;
/** The tooltip `timer` will open or close. */
let timerOwner: string | undefined;
const tipListeners = new Set<() => void>();

function setTip(next: TipState | undefined) {
  window.clearTimeout(timer);
  timer = undefined;
  if (tip === next) return;
  tip = next;
  for (const l of tipListeners) l();
}

function later(owner: string, ms: number, fn: () => void) {
  window.clearTimeout(timer);
  timerOwner = owner;
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
/** Close when the window resizes or a scroll moves the icon (not when the log or another region scrolls). */
const onWindowMove = (e: Event) => {
  if (!tip) return;
  const t = e.target;
  if (e.type === 'resize' || !(t instanceof Node) || t.contains(tip.el)) setTip(undefined);
};

function subscribeTip(l: () => void) {
  if (tipListeners.size === 0) {
    window.addEventListener('keydown', onWindowKey, true);
    window.addEventListener('resize', onWindowMove);
    window.addEventListener('scroll', onWindowMove, true);
  }
  tipListeners.add(l);
  return () => {
    tipListeners.delete(l);
    if (tipListeners.size > 0) return;
    window.removeEventListener('keydown', onWindowKey, true);
    window.removeEventListener('resize', onWindowMove);
    window.removeEventListener('scroll', onWindowMove, true);
  };
}

/**
 * Hover (after 300 ms), keyboard focus and click open the tooltip; leaving, blur and Escape close it.
 * A pointer click also does what a click on the card does, and a right-click inspects the card.
 */
function useTip(card: CardActions) {
  const id = useId();
  useEffect(
    () => () => {
      // Unmounted (card left the battlefield, overlay key held): drop its pending or open tooltip.
      if (timerOwner === id) window.clearTimeout(timer);
      if (tip?.id === id) setTip(undefined);
    },
    [id],
  );
  const anchor = useSyncExternalStore(
    subscribeTip,
    () => (tip?.id === id ? tip.anchor : undefined),
    () => undefined,
  );
  const show = (el: HTMLElement) => setTip({ id, anchor: el.getBoundingClientRect(), el });
  const handlers = {
    onPointerEnter: (e: PointerEvent<HTMLElement>) => {
      const el = e.currentTarget;
      if (tip?.id === id) return window.clearTimeout(timer);
      later(id, tip ? 0 : SHOW_DELAY_MS, () => show(el));
    },
    onPointerLeave: () => later(id, HIDE_DELAY_MS, hideIf(id)),
    onFocus: (e: FocusEvent<HTMLElement>) => show(e.currentTarget),
    onBlur: hideIf(id),
    // Click (or tap) shows it at once; it never toggles off, since a click also focuses.
    // Only a pointer click (detail > 0) reaches the card: Enter on a focused icon just shows it.
    onClick: (e: MouseEvent<HTMLElement>) => {
      if (tip?.id !== id) show(e.currentTarget);
      if (e.detail > 0) card.activate();
    },
    onContextMenu: (e: MouseEvent<HTMLElement>) => {
      e.preventDefault();
      card.inspect();
    },
  };
  const tipProps = {
    id: `${id}-tip`,
    anchor,
    onPointerEnter: () => window.clearTimeout(timer),
    onPointerLeave: () => later(id, HIDE_DELAY_MS, hideIf(id)),
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

function KeywordDisc({ icon, className, card }: { icon: KeywordIcon; className: string; card: CardActions }) {
  const { open, tipId, handlers, tipProps } = useTip(card);
  const k = icon.keyword;
  const line = keywordLine(k);
  const granted = grantedText(k);
  return (
    <>
      <button
        type="button"
        className={`${styles.disc} ${k.grantedBy ? styles.granted : ''} ${className}`}
        aria-label={granted ? grantedAria(k) : k.label}
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

function MoreChip({ hidden, className, card }: { hidden: KeywordIcon[]; className: string; card: CardActions }) {
  const { open, tipId, handlers, tipProps } = useTip(card);
  const labels = hidden.map((i) => i.keyword.label);
  return (
    <>
      <button
        type="button"
        className={`${styles.disc} ${styles.more} ${className}`}
        aria-label={t('kw.moreAria', { count: hidden.length, labels: labels.join(', ') })}
        aria-describedby={open ? tipId : undefined}
        {...handlers}
      >
        +{hidden.length}
      </button>
      <Tooltip {...tipProps}>
        <p className={styles.tipName}>{t('kw.more', { count: hidden.length })}</p>
        <p className={styles.tipLine}>
          {hidden.map((i, n) => (
            <span key={i.keyword.label}>
              {n > 0 ? ' · ' : ''}
              {i.keyword.label}
              {i.keyword.grantedBy ? ` ${t('kw.added')}` : ''}
            </span>
          ))}
        </p>
      </Tooltip>
    </>
  );
}

/** Card overlays the word chips stay clear of (state badges, count, P/T, damage, counters, combat strip). */
export const KW_AVOID_ATTR = 'data-kw-avoid';

const rectIn = (el: Element, box: DOMRect): Rect => {
  const r = el.getBoundingClientRect();
  return { left: r.left - box.left, top: r.top - box.top, right: r.right - box.left, bottom: r.bottom - box.top };
};
const sizeOf = (el: Element | null | undefined) => {
  const r = el?.getBoundingClientRect();
  return { width: r?.width ?? 0, height: r?.height ?? 0 };
};
const half = (n: number) => Math.round(n * 2) / 2;

/**
 * Overlay key held: each icon as a word chip, upright in the slot (the turned
 * box on a tapped card). Chips are placed by measurement (wordChipLayout) so
 * they never cover the card's other overlays; what does not fit becomes "+N".
 */
function WordChips({ icons, card }: { icons: KeywordIcon[]; card: CardActions }) {
  const ref = useRef<HTMLSpanElement>(null);
  const chipEls = useRef<(HTMLSpanElement | null)[]>([]);
  const probeEl = useRef<HTMLSpanElement>(null);
  const [plan, setPlan] = useState<WordChipPlacement>();
  const [, remeasure] = useState(0);

  useEffect(() => {
    const slot = ref.current?.closest('[data-card-id]');
    if (!slot) return;
    const ro = new ResizeObserver(() => remeasure((n) => n + 1));
    ro.observe(slot);
    return () => ro.disconnect();
  }, []);

  // Every render: the card's overlays change with its state. Sizes and overlays
  // do not depend on where the chips are, so this settles in one pass.
  useLayoutEffect(() => {
    const region = ref.current;
    const slot = region?.closest('[data-card-id]');
    if (!region || !slot) return;
    const box = region.getBoundingClientRect();
    const avoid = [...slot.querySelectorAll(`[${KW_AVOID_ATTR}]`)]
      .map((el) => rectIn(el, box))
      .filter((r) => r.right > r.left && r.bottom > r.top);
    const next = placeWordChips(
      sizeOf(region),
      icons.map((_, n) => sizeOf(chipEls.current[n])),
      sizeOf(probeEl.current),
      avoid,
      parseFloat(getComputedStyle(region).rowGap) || 0,
    );
    const rounded: WordChipPlacement = { bottoms: next.bottoms.map(half) };
    if (next.more !== undefined) rounded.more = half(next.more);
    setPlan((p) => (JSON.stringify(p) === JSON.stringify(rounded) ? p : rounded));
  });

  const chipHandlers = {
    onClick: card.activate,
    onContextMenu: (e: MouseEvent<HTMLElement>) => {
      e.preventDefault();
      card.inspect();
    },
  };
  const at = (bottom: number | undefined) =>
    bottom === undefined ? { bottom: 0, visibility: 'hidden' as const } : { bottom };
  const hidden = plan ? icons.slice(plan.bottoms.length) : [];
  return (
    <span ref={ref} className={styles.words}>
      {icons.map((i, n) => {
        const bottom = plan?.bottoms[n];
        return (
          <span
            key={i.keyword.label}
            ref={(el) => {
              chipEls.current[n] = el;
            }}
            className={`${styles.word} ${i.keyword.grantedBy ? styles.granted : ''}`}
            style={at(bottom)}
            title={[i.keyword.label, grantedText(i.keyword)].filter(Boolean).join(' · ')}
            data-arrow-occluder={bottom === undefined ? undefined : ''}
            {...chipHandlers}
          >
            {i.keyword.label}
          </span>
        );
      })}
      {plan?.more !== undefined ? (
        <span
          className={`${styles.word} ${styles.wordMore}`}
          style={at(plan.more)}
          title={hidden.map((i) => i.keyword.label + (i.keyword.grantedBy ? ` ${t('kw.added')}` : '')).join(' · ')}
          data-arrow-occluder=""
          {...chipHandlers}
        >
          +{hidden.length}
        </span>
      ) : null}
      {/* Measures the widest "+N" chip. */}
      <span ref={probeEl} className={`${styles.word} ${styles.wordMore}`} style={at(undefined)} aria-hidden>
        +{icons.length}
      </span>
    </span>
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
  card: CardActions;
}

/**
 * Keyword icons in a column on the card's right edge, stacked up from above
 * the P/T box. The parent frame matches the card box (rotated with it when
 * tapped). How many fit depends on the card width (container queries).
 */
export function KeywordIcons({ keywords, tapped, above, words, card }: Props) {
  const icons = iconKeywords(keywords);
  if (!icons.length) return null;
  if (words) return <WordChips icons={icons} card={card} />;
  const start = { strip: styles.aboveStrip, damage: styles.aboveDamage, pt: styles.abovePt, none: '' }[above];

  const plan = slotPlan(icons.length);
  return (
    <span className={styles.frame}>
      <span className={`${styles.column} ${start} ${tapped ? styles.upright : ''}`} data-arrow-occluder>
        {plan.icons.map(({ index, tiers }) => (
          <KeywordDisc key={index} icon={icons[index]!} className={hideClasses(tiers)} card={card} />
        ))}
        {plan.more.map(({ tier, count }) => (
          <MoreChip key={tier} hidden={icons.slice(icons.length - count)} className={hideClasses([tier])} card={card} />
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
