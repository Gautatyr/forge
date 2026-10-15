import { useLayoutEffect, useMemo, useState } from 'react';
import { useMatch } from '../state/MatchContext';
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
}

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

/**
 * Lines between things on the board: blocks (solid, shield marker) and the
 * targets of the hovered stack item (dashed, target marker). Shape and dash
 * pattern differ, not only colour.
 */
export function Arrows() {
  const { game, ui } = useMatch();
  const d = game.decision;
  const hovered = ui.hoveredStackItem;

  const specs = useMemo<Spec[]>(() => {
    const out: Spec[] = [];
    const blocks = [...(game.combat?.blocks ?? []), ...(d.kind === 'declareBlockers' ? d.draft : [])];
    for (const b of blocks)
      out.push({ key: `b-${b.blockerId}`, from: `[data-card-id="${b.blockerId}"]`, to: `[data-card-id="${b.attackerId}"]`, kind: 'block' });
    const item = game.stack.find((s) => s.id === hovered);
    for (const t of item?.targets ?? [])
      out.push({
        key: `t-${item!.id}-${t.id}`,
        from: `[data-stack-id="${item!.id}"]`,
        to: t.kind === 'card' ? `[data-card-id="${t.id}"]` : `[data-player-id="${t.id}"]`,
        kind: 'target',
      });
    return out;
  }, [game.combat, d, game.stack, hovered]);

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
        next.push({ ...s, x1, y1: a.top + a.height / 2, x2: b.left + b.width / 2, y2: b.top + b.height / 2 });
      }
      setLines(next);
    };
    const raf = requestAnimationFrame(measure);
    const late = window.setTimeout(measure, 280); // after card transitions settle
    window.addEventListener('resize', measure);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(late);
      window.removeEventListener('resize', measure);
    };
    // specKey captures every change that moves an endpoint.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [specKey]);

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
      </defs>
      {lines.map((l) => (
        <g key={l.key}>
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
