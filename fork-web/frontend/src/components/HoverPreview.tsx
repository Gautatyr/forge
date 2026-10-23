import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cardName, currentFace, shownFace } from '../model/selectors';
import { cardStatus } from '../state/cardStatus';
import { useMatch } from '../state/MatchContext';
import { CardArt } from './CardArt';
import { linkNotes } from './cardLinks';
import { Icon } from './Icon';
import { overBoardWidth, placePreview, type Box } from './previewPlacement';
import { PREVIEW_BESIDE_ATTR, previewSpot } from './previewSpot';
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

const boxOf = (el: Element): Box => {
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width, height: r.height };
};

/**
 * Short rail column: the preview shows over the board (also for a card hovered in the rail or drawer), so the rail's panels keep their size (nothing reflows while
 * the pointer moves). It takes the readable size of the 1920 in-rail preview and sits where it covers neither the
 * hovered card nor a card or tray of the open prompt (previewPlacement.ts). Placed before paint, from the DOM.
 */
function OverBoard({ cardId, beside, keepIds, children }: { cardId: string; beside: boolean; keepIds: string[]; children: ReactNode }) {
  const anchor = useRef<HTMLSpanElement>(null);
  const el = useRef<HTMLDivElement>(null);
  // Every render: the board reflows after paint, and the hovered card or the prompt may have changed.
  useLayoutEffect(() => {
    const column = anchor.current?.parentElement;
    const box = el.current;
    if (!column || !box) return;
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    const m = 0.5 * rem;
    // The board side of the screen: left of the rail, or of the log drawer while it is open (both carry the attribute).
    const right = Math.min(...[...document.querySelectorAll(`[${PREVIEW_BESIDE_ATTR}]`)].map((e) => e.getBoundingClientRect().left), window.innerWidth);
    const top = column.getBoundingClientRect().top;
    const area: Box = { left: m, top: top + m, width: right - 2 * m, height: window.innerHeight - top - 2 * m };
    box.style.setProperty('--pv-w', `${overBoardWidth(rem, area.height)}px`);
    const cards = (id: string) => [...document.querySelectorAll<HTMLElement>(`[data-card-id="${CSS.escape(id)}"]`)];
    const hoveredEls = cards(cardId);
    // Hovered in the rail or drawer (a stack item, a zone card, a Recent link): that very element, which the area
    // never contains, so the preview lands beside the panel at its height. Elsewhere: the card on the board.
    const inPanel = beside
      ? ([...document.querySelectorAll(`[${PREVIEW_BESIDE_ATTR}] :hover`)].pop() ??
        document.querySelector(`[${PREVIEW_BESIDE_ATTR}] :focus-visible`) ??
        undefined)?.closest('[data-card-id], button')
      : undefined;
    const hovered = inPanel ?? hoveredEls.find((e) => e.matches(':hover') || e.contains(document.activeElement)) ?? hoveredEls[0];
    const keep = [...keepIds.flatMap(cards), ...document.querySelectorAll('[data-dock]')].map(boxOf);
    // offset sizes ignore the `appear` animation's scale, still applied on first mount.
    const { offsetWidth: width, offsetHeight: height } = box;
    const at = placePreview({ area, size: { width, height }, hovered: hovered && boxOf(hovered), keep });
    box.style.left = `${at.left}px`;
    box.style.top = `${at.top}px`;
    box.style.visibility = 'visible';
  });
  return (
    <>
      <span ref={anchor} hidden />
      {createPortal(
        <div ref={el} className={`${styles.preview} ${styles.overBoard}`} aria-hidden>
          {children}
        </div>,
        document.body,
      )}
    </>
  );
}

/**
 * Large card image in a fixed place: over the rail, or left of the rail / log drawer when the card is in it; over
 * the board when the rail's column is too short (previewSpot.ts). `columnRem`: that column's height in rem.
 */
export function HoverPreview({ columnRem }: { columnRem: number }) {
  const { game, ui } = useMatch();
  if (!ui.hover || ui.inspectId) return null;
  const c = game.cards[ui.hover.cardId];
  if (!c) return null;
  const face = currentFace(c);
  const img = shownFace(c).image ?? c.front.image;
  const s = cardStatus(game, ui, c.id);
  const spot = previewSpot(ui.hover, ui.logOpen, columnRem);
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

  const body = (
    <>
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
    </>
  );
  if (spot === 'overBoard') {
    // What the open prompt is about: the cards you picked or are targeting for (the source card of a spell).
    const keepIds = Object.keys(game.cards).filter((id) => cardStatus(game, ui, id).selected);
    return (
      <OverBoard cardId={c.id} beside={!!ui.hover.beside} keepIds={keepIds}>
        {body}
      </OverBoard>
    );
  }
  return (
    <div className={spot === 'rail' ? styles.preview : `${styles.preview} ${styles[spot]}`} aria-hidden>
      {body}
    </div>
  );
}
