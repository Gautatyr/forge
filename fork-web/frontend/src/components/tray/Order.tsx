import { useLayoutEffect, useRef, type CSSProperties, type KeyboardEvent } from 'react';
import type { OrderPrompt } from '../../model/types';
import { useMatch } from '../../state/MatchContext';
import { Card } from '../Card';
import type { BodyProps } from './TrayBody';
import { moveBetween, moveItem, moveLabel, revealScrollTop } from './trayLogic';
import styles from '../ChoiceTray.module.css';

/** One list: a column, first item at the top. Two lists: the scry layout, click moves a card across. */
export function Order(props: BodyProps<OrderPrompt>) {
  return props.prompt.lists.length === 1 ? <SingleList {...props} /> : <TwoLists {...props} />;
}

function SingleList({ prompt, draft, setDraft }: BodyProps<OrderPrompt>) {
  const { game } = useMatch();
  const list = prompt.lists[0]!;
  const items = new Map(list.items.map((i) => [i.id, i]));
  const ids = draft.lists[list.id] ?? [];
  const rows = useRef(new Map<string, HTMLLIElement>());
  const moved = useRef<string | null>(null);
  // After a move, scroll the tray body so the moved (focused) row stays in sight.
  useLayoutEffect(() => {
    const row = moved.current ? rows.current.get(moved.current) : undefined;
    moved.current = null;
    const view = row?.closest<HTMLElement>(`.${styles.body}`);
    if (!row || !view) return;
    // A ↑/↓ button that just became disabled drops focus to <body>: keep it on the row.
    if (document.activeElement === document.body) row.focus({ preventScroll: true });
    const v = view.getBoundingClientRect();
    const r = row.getBoundingClientRect();
    const cs = getComputedStyle(row);
    const ring = (parseFloat(cs.outlineWidth) || 0) + (parseFloat(cs.outlineOffset) || 0); // keep the focus ring in sight
    view.scrollTop = revealScrollTop({ top: v.top, height: view.clientHeight, scrollTop: view.scrollTop }, r, ring);
  }, [draft]);
  const move = (i: number, by: number) => {
    moved.current = ids[i] ?? null;
    setDraft(moveItem(draft, list.id, i, by));
  };
  const onKey = (i: number) => (e: KeyboardEvent) => {
    if (!e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
    e.preventDefault();
    move(i, e.key === 'ArrowUp' ? -1 : 1);
  };
  return (
    <section className={styles.column} aria-label={list.label}>
      <h3>
        {list.label} {list.hint ? <span>{list.hint}</span> : null}
        <span>
          <kbd>Alt</kbd> + <kbd>↑</kbd> / <kbd>↓</kbd> moves the focused item
        </span>
      </h3>
      <ol className={styles.columnItems}>
        {ids.map((id, i) => {
          const o = items.get(id)!;
          const card = o.cardId ? game.cards[o.cardId] : undefined;
          return (
            <li
              key={id}
              ref={(el) => {
                if (el) rows.current.set(id, el);
                else rows.current.delete(id);
              }}
              className={styles.row}
              tabIndex={0}
              onKeyDown={onKey(i)}
              aria-label={`${i + 1}. ${o.label}`}
            >
              <span className={styles.rowIndex}>{i + 1}</span>
              {card ? <Card card={card} context="thumb" style={{ '--cw': '1.5rem' } as CSSProperties} onActivate={() => undefined} /> : null}
              <span className={styles.rowText}>
                <span className={styles.optionLabel}>{o.label}</span>
                {o.detail ? <span className={styles.optionDetail}>{o.detail}</span> : null}
              </span>
              <span className={styles.orderControls}>
                <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move ${o.label} up`}>
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => move(i, 1)}
                  disabled={i === ids.length - 1}
                  aria-label={`Move ${o.label} down`}
                >
                  ↓
                </button>
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function TwoLists({ prompt, draft, setDraft }: BodyProps<OrderPrompt>) {
  const { game } = useMatch();
  const items = new Map(prompt.lists.flatMap((l) => l.items).map((i) => [i.id, i]));
  return (
    <div className={styles.lists}>
      {prompt.lists.map((l) => {
        const ids = draft.lists[l.id] ?? [];
        const other = prompt.lists.find((x) => x.id !== l.id)!;
        const move = (id: string) => setDraft(moveBetween(draft, id, l.id, other.id));
        return (
          <section key={l.id} className={styles.list} aria-label={l.label}>
            <h3>
              {l.label} <span>{l.hint}</span>
            </h3>
            <div className={styles.listCards}>
              {ids.length === 0 ? <p className={styles.empty}>Empty — click a card on the other side to move it here.</p> : null}
              {ids.map((id, i) => {
                const o = items.get(id)!;
                const card = o.cardId ? game.cards[o.cardId] : undefined;
                return (
                  <div key={id} className={styles.orderItem}>
                    {card ? <Card card={card} context="thumb" style={{ '--cw': '6.6rem' } as CSSProperties} onActivate={() => move(id)} /> : null}
                    <div className={styles.orderControls}>
                      <button type="button" onClick={() => setDraft(moveItem(draft, l.id, i, -1))} disabled={i === 0} aria-label={`Move ${o.label} left`}>
                        ◀
                      </button>
                      <button type="button" className={styles.moveBtn} onClick={() => move(id)}>
                        {moveLabel(other)}
                      </button>
                      <button
                        type="button"
                        onClick={() => setDraft(moveItem(draft, l.id, i, 1))}
                        disabled={i === ids.length - 1}
                        aria-label={`Move ${o.label} right`}
                      >
                        ▶
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
