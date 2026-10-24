import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cardName, currentFace, shownFace } from '../model/selectors';
import { cardStatus } from '../state/cardStatus';
import { useMatch } from '../state/MatchContext';
import { CardArt } from './CardArt';
import { linkNotes } from './cardLinks';
import { Icon } from './Icon';
import { layoutPreview, type Box } from './previewPlacement';
import { hoverLitTargets } from './previewKeep';
import { PREVIEW_BESIDE_ATTR } from './previewSpot';
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
 * The preview shows over the board (also for a card hovered in the rail or drawer), so the rail's panels keep their size
 * (nothing reflows while the pointer moves). One place and one size for every hovered card: the size of the first fixed
 * preview (previewPlacement.ts `overBoardWidth`, from the window only), flush with the rail (or the log drawer), its
 * image bottom on the hand. It may cover the hovered card (the 2026-10-16 behaviour). Only what the open prompt is about
 * moves or narrows it (previewPlacement.ts `layoutPreview`): the cards and tray of the prompt, the targets a hovered
 * stack item lights. The box is the image alone; the notes block hangs out of the flow (above the image, or beside it when
 * its rows do not fit above: previewPlacement.ts `layoutNotes`), so no card's notes ever move or resize the image and no
 * note row is cut. Placed before paint, from the DOM.
 */
function Preview({ keepIds, keepPlayerIds, children }: { keepIds: string[]; keepPlayerIds: string[]; children: ReactNode }) {
  const anchor = useRef<HTMLSpanElement>(null);
  const el = useRef<HTMLDivElement>(null);
  // Every render: the board reflows after paint, and the prompt may have changed.
  useLayoutEffect(() => {
    const column = anchor.current?.parentElement;
    const box = el.current;
    const info = box?.querySelector<HTMLElement>('[data-preview-info]');
    if (!column || !box || !info) return;
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    const m = 0.5 * rem;
    // The board side of the screen: left of the rail, or of the log drawer while it is open (both carry the attribute).
    const right = Math.min(...[...document.querySelectorAll(`[${PREVIEW_BESIDE_ATTR}]`)].map((e) => e.getBoundingClientRect().left), window.innerWidth);
    const top = column.getBoundingClientRect().top;
    // The board above the hand: the preview never covers the hand unless there is no room (the readable floor wins).
    const bottom = document.querySelector('[data-hand]')?.getBoundingClientRect().top ?? window.innerHeight;
    const area: Box = { left: m, top: top + m, width: right - 2 * m, height: bottom - top - 2 * m };
    const cards = (id: string) => [...document.querySelectorAll<HTMLElement>(`[data-card-id="${CSS.escape(id)}"]`)];
    const plates = (id: string) => [...document.querySelectorAll<HTMLElement>(`[data-player-id="${CSS.escape(id)}"]`)];
    const keep = [...keepIds.flatMap(cards), ...keepPlayerIds.flatMap(plates), ...document.querySelectorAll('[data-dock]')].map(boxOf);
    const sizeOf = (e: HTMLElement) => ({ width: e.offsetWidth, height: e.offsetHeight });
    const at = layoutPreview({
      area,
      rem,
      vh: window.innerHeight,
      keep,
      measure: (w) => {
        box.style.setProperty('--pv-w', `${w}px`);
        // offset sizes ignore the `appear` animation's scale, still applied on first mount. The box is the image alone.
        return sizeOf(box);
      },
      measureNotes: (side, maxWidth) => {
        info.dataset.side = side;
        info.style.setProperty('--notes-w', `${maxWidth}px`);
        info.style.maxHeight = 'none';
        return sizeOf(info);
      },
    });
    box.style.left = `${at.left}px`;
    box.style.top = `${at.top}px`;
    info.dataset.side = at.notes.side;
    info.style.setProperty('--notes-w', `${at.notes.maxWidth}px`);
    info.style.maxHeight = at.notes.maxHeight === null ? 'none' : `${at.notes.maxHeight}px`;
    box.style.visibility = 'visible';
  });
  return (
    <>
      <span ref={anchor} hidden />
      {createPortal(
        <div ref={el} className={styles.preview} aria-hidden>
          {children}
        </div>,
        document.body,
      )}
    </>
  );
}

/** Large card image over the board, above the hand, flush with the rail side (previewPlacement.ts). */
export function HoverPreview() {
  const { game, ui } = useMatch();
  if (!ui.hover || ui.inspectId) return null;
  const c = game.cards[ui.hover.cardId];
  if (!c) return null;
  const face = currentFace(c);
  const shown = shownFace(c);
  // The face the image is of (a face without its own image shows the front's): its data is the text card's.
  const artFace = shown.image || !c.front.image ? shown : c.front;
  const img = artFace.image;
  const s = cardStatus(game, ui, c.id);
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
      <CardArt key={img?.large ?? c.id} image={img} face={artFace} size="large" className={styles.img} />
      <div className={styles.info} data-preview-info>
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
  // What the open prompt is about: the cards you picked or are targeting for (the source card of a spell); and
  // what the hovered stack item targets (lit on the board while you hover it).
  const lit = hoverLitTargets(game, ui);
  const keepIds = [...new Set([...Object.keys(game.cards).filter((id) => cardStatus(game, ui, id).selected), ...lit.cards])];
  return (
    <Preview keepIds={keepIds} keepPlayerIds={lit.players}>
      {body}
    </Preview>
  );
}
