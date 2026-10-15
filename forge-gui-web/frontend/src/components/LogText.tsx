import type { MouseEvent, ReactNode } from 'react';
import { useMatch } from '../state/MatchContext';
import styles from './LogText.module.css';

/** Renders log text; {card:<id>} tokens become hoverable card names. */
export function LogText({ text }: { text: string }) {
  const { game, setUi } = useMatch();
  const parts: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(/\{card:([^}]+)\}/g)) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const id = m[1]!;
    const c = game.cards[id];
    const name = c?.name ?? 'a card';
    const show = (e: MouseEvent) => {
      const r = e.currentTarget.getBoundingClientRect();
      if (c) setUi({ hover: { cardId: id, side: r.left < window.innerWidth / 2 ? 'right' : 'left' } });
    };
    parts.push(
      c ? (
        <button
          key={`${id}-${m.index}`}
          type="button"
          className={styles.ref}
          onPointerEnter={show}
          onPointerLeave={() => setUi({ hover: undefined })}
          onClick={() => setUi({ inspectId: id, hover: undefined })}
          title="Hover to see the card, click to inspect"
        >
          {name}
        </button>
      ) : (
        <span key={`${id}-${m.index}`}>{name}</span>
      ),
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}
