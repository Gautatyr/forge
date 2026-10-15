import { useLayoutEffect, useMemo, useState } from 'react';
import { spotlightItem } from '../state/cardStatus';
import { useMatch } from '../state/MatchContext';
import { outsideAnchor, sourceY, type Box } from './arrowGeometry';
import styles from './Arrows.module.css';

type Kind = 'block' | 'target';

interface Spec {
  key: string;
  from: string;
  to: string;
  kind: Kind;
}

interface Line extends Spec {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** Text the line passes behind (masked out). */
  holes: Box[];
}

/** Ring outline (2px offset + 4px) plus the target marker's radius: a player marker clears both. */
const PLAYER_GAP = 17;
const HOLE_PAD = 3;

/** The biggest on-screen element for a selector (a card can also appear as a thumbnail). */
function rectOf(selector: string): DOMRect | undefined {
  let best: DOMRect | undefined;
  for (const el of document.querySelectorAll(selector)) {
    const r = el.getBoundingClientRect();
    if (r.width === 0) continue;
    if (!best || r.width * r.height > best.width * best.height) best = r;
  }
  return best;
}

/** The scroll region holding an element (the stack list scrolls). */
function scrollerOf(selector: string): Box | undefined {
  return document.querySelector(selector)?.closest('[data-scroll-region]')?.getBoundingClientRect();
}

const intersect = (a: Box, b: Box): Box => ({
  left: Math.max(a.left, b.left),
  top: Math.max(a.top, b.top),
  right: Math.min(a.right, b.right),
  bottom: Math.min(a.bottom, b.bottom),
});
const union = (a: Box, b: Box): Box => ({
  left: Math.min(a.left, b.left),
  top: Math.min(a.top, b.top),
  right: Math.max(a.right, b.right),
  bottom: Math.max(a.bottom, b.bottom),
});
const isEmpty = (r: Box) => r.right <= r.left || r.bottom <= r.top;

/**
 * Text a line passes behind (elements marked data-arrow-occluder: player
 * plates, seat summaries, card P/T, counts, counters, damage, combat strips)
 * within `area`, minus any holding either end of the line.
 */
function occluders(from: string, to: string, area: Box): Box[] {
  const ends = [...document.querySelectorAll(`${from}, ${to}`)];
  const out: Box[] = [];
  for (const el of document.querySelectorAll('[data-arrow-occluder]')) {
    const box = el.getBoundingClientRect();
    // The text may overflow its box (a short compact seat squeezes its summary).
    const range = document.createRange();
    range.selectNodeContents(el);
    const text = range.getBoundingClientRect();
    let r: Box = text.width > 0 ? union(box, text) : box;
    if (isEmpty(intersect(r, area)) || ends.some((e) => el.contains(e))) continue;
    // Only the part clipping ancestors leave visible.
    for (let a = el.parentElement; a && !isEmpty(r); a = a.parentElement) {
      if (getComputedStyle(a).overflow !== 'visible') r = intersect(r, a.getBoundingClientRect());
    }
    if (!isEmpty(r)) out.push(r);
  }
  return out;
}

/**
 * Lines between things on the board: blocks (solid, shield marker) and the
 * targets of the stack item in the spotlight, the top one unless another is
 * hovered (dashed, target marker). Shape and dash
 * pattern differ, not only colour. Lines pass behind text (masked out, see
 * `occluders`), and a player target ends outside its plate, so no line or
 * marker covers text.
 */
export function Arrows() {
  const { game, ui, prefs } = useMatch();
  const d = game.decision;
  const item = spotlightItem(game, ui);

  const specs = useMemo<Spec[]>(() => {
    const out: Spec[] = [];
    const blocks = [...(game.combat?.blocks ?? []), ...(d.kind === 'declareBlockers' ? d.draft : [])];
    for (const b of blocks)
      out.push({ key: `b-${b.blockerId}`, from: `[data-card-id="${b.blockerId}"]`, to: `[data-card-id="${b.attackerId}"]`, kind: 'block' });
    for (const t of item?.targets ?? [])
      out.push({
        key: `t-${item!.id}-${t.id}`,
        from: `[data-stack-id="${item!.id}"]`,
        to: t.kind === 'card' ? `[data-card-id="${t.id}"]` : `[data-player-id="${t.id}"]`,
        kind: 'target',
      });
    return out;
  }, [game.combat, d, item]);

  const [lines, setLines] = useState<Line[]>([]);
  const specKey = specs.map((s) => s.key).join(',');

  useLayoutEffect(() => {
    const measure = () => {
      const next: Line[] = [];
      for (const s of specs) {
        const a = rectOf(s.from);
        const b = rectOf(s.to);
        if (!a || !b) continue;
        // Stack items start from their left edge so the line does not cross the rail text.
        const x1 = s.kind === 'target' ? a.left : a.left + a.width / 2;
        // A stack item scrolled out of view has no line: drawn from the list's
        // edge it would start on another item and read as that item's.
        const y1 = s.kind === 'target' ? sourceY(a, scrollerOf(s.from)) : a.top + a.height / 2;
        if (y1 === undefined) continue;
        const end = s.to.startsWith('[data-player-id')
          ? outsideAnchor({ x: x1, y: y1 }, b, PLAYER_GAP)
          : { x: b.left + b.width / 2, y: b.top + b.height / 2 };
        const pad = 12; // the marker
        const area = union({ left: x1 - pad, top: y1 - pad, right: x1 + pad, bottom: y1 + pad }, { left: end.x - pad, top: end.y - pad, right: end.x + pad, bottom: end.y + pad });
        next.push({ ...s, x1, y1, x2: end.x, y2: end.y, holes: occluders(s.from, s.to, area) });
      }
      setLines(next);
    };
    const raf = requestAnimationFrame(measure);
    const late = window.setTimeout(measure, 280); // after card transitions settle
    window.addEventListener('resize', measure);
    // Side-panel regions scroll on their own; follow them.
    window.addEventListener('scroll', measure, true);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(late);
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
    // specKey, the game, the focus and the display prefs capture every change that moves an endpoint.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [specKey, game, prefs, ui.focusOpponentId]);

  if (specs.length === 0) return null;
  return (
    <svg className={styles.arrows} aria-hidden>
      <defs>
        <marker id="m-block" viewBox="0 0 24 24" markerWidth="22" markerHeight="22" refX="12" refY="12" markerUnits="userSpaceOnUse" orient="auto">
          <path d="M12 2.5l8 3v6c0 5-3.4 8.6-8 10-4.6-1.4-8-5-8-10v-6z" className={styles.markBlock} />
        </marker>
        <marker id="m-target" viewBox="0 0 24 24" markerWidth="20" markerHeight="20" refX="12" refY="12" markerUnits="userSpaceOnUse">
          <circle cx="12" cy="12" r="8" className={styles.markTarget} />
          <circle cx="12" cy="12" r="3" className={styles.markTargetDot} />
        </marker>
        {lines.map((l, i) =>
          l.holes.length ? (
            <mask key={`m-${l.key}`} id={`arrow-holes-${i}`} maskUnits="userSpaceOnUse" x="0" y="0" width="100%" height="100%">
              <rect x="0" y="0" width="100%" height="100%" fill="white" />
              {l.holes.map((h, j) => (
                <rect
                  key={j}
                  x={h.left - HOLE_PAD}
                  y={h.top - HOLE_PAD}
                  width={h.right - h.left + 2 * HOLE_PAD}
                  height={h.bottom - h.top + 2 * HOLE_PAD}
                  rx={8}
                  fill="black"
                />
              ))}
            </mask>
          ) : null,
        )}
      </defs>
      {lines.map((l, i) => (
        <g key={l.key} mask={l.holes.length ? `url(#arrow-holes-${i})` : undefined}>
          <line x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} className={styles.halo} />
          <line
            x1={l.x1}
            y1={l.y1}
            x2={l.x2}
            y2={l.y2}
            className={l.kind === 'block' ? styles.block : styles.target}
            markerEnd={l.kind === 'block' ? 'url(#m-block)' : 'url(#m-target)'}
            markerStart={l.kind === 'block' ? 'url(#m-block)' : undefined}
          />
        </g>
      ))}
    </svg>
  );
}
