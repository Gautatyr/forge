import type { ReactNode } from 'react';
import type { GameView } from '../model/types';
import { SeatGlyph } from './Icon';
import styles from './PlayerText.module.css';

/** Text where `{player:<id>}` becomes that player's seat shape and name ("Let ▲ Mira start"). */
export function PlayerText({ game, text }: { game: GameView; text: string }) {
  const parts: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(/\{player:([^}]+)\}/g)) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const p = game.players.find((x) => x.id === m[1]);
    parts.push(
      <span key={m.index} className={styles.player}>
        {p ? <SeatGlyph seat={p.seat} /> : null}
        {playerWord(game, m[1]!)}
      </span>,
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}

function playerWord(game: GameView, id: string): string {
  const p = game.players.find((x) => x.id === id);
  return p ? (p.isYou ? 'you' : p.name) : 'a player';
}

/** The same text with names only, for logs and accessible names. */
export function playerPlainText(game: GameView, text: string): string {
  return text.replace(/\{player:([^}]+)\}/g, (_, id: string) => playerWord(game, id));
}
