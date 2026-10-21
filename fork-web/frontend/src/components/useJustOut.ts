import { useEffect, useRef, useState } from 'react';
import type { GameView, PlayerId } from '../model/types';
import { liveIds, newlyOut } from '../state/gameEnd';

/**
 * Players who went out while this screen was showing the game, each kept for
 * `ms` (the column leaving, the toast). A player already out when a game or
 * scenario loads is not "just out". Undo bringing a player back drops them.
 */
export function useJustOut(game: GameView, ms: number): PlayerId[] {
  const live = liveIds(game);
  const key = `${game.id}|${live.join(',')}`;
  const [seen, setSeen] = useState({ gameId: game.id, live, key });
  const [recent, setRecent] = useState<string[]>([]);

  // Adjusting state during render: React's pattern for state derived from a change.
  if (seen.key !== key) {
    const same = seen.gameId === game.id;
    const gone = same ? newlyOut(seen.live, game).map((id) => `${game.id}|${id}`) : [];
    setSeen({ gameId: game.id, live, key });
    setRecent((r) => [...(same ? r.filter((k) => !live.includes(k.split('|')[1]!)) : []), ...gone]);
  }

  const timers = useRef(new Map<string, number>());
  useEffect(() => {
    for (const k of recent) {
      if (timers.current.has(k)) continue;
      timers.current.set(
        k,
        window.setTimeout(() => {
          timers.current.delete(k);
          setRecent((r) => r.filter((x) => x !== k));
        }, ms),
      );
    }
  }, [recent, ms]);
  useEffect(() => {
    const t = timers.current;
    return () => {
      for (const id of t.values()) window.clearTimeout(id);
      t.clear();
    };
  }, []);

  return recent.filter((k) => k.startsWith(`${game.id}|`)).map((k) => k.slice(game.id.length + 1));
}
