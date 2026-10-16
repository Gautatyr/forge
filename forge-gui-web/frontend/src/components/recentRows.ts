import type { GameView, LogEntry } from '../model/types';

export type RecentRow =
  | { kind: 'divider'; key: string; label: string; seat?: number }
  | { kind: 'entry'; key: string; entry: LogEntry; bold: boolean };

/**
 * Recent (design pass 4, P6): the newest `limit` entries, newest first, with a
 * divider above each turn's entries ("Theo’s turn 10"), and the lines where you
 * lose life or a permanent in bold.
 */
export function recentRows(game: GameView, limit: number): RecentRow[] {
  const rows: RecentRow[] = [];
  let turnKey: string | undefined;
  for (const entry of game.log.slice(-limit).reverse()) {
    const key = `${entry.turn}|${entry.turnPlayerId ?? ''}`;
    if (key !== turnKey) {
      turnKey = key;
      const p = entry.turnPlayerId ? game.players.find((x) => x.id === entry.turnPlayerId) : undefined;
      const label = !p ? `Turn ${entry.turn}` : p.isYou ? `Your turn ${entry.turn}` : `${p.name}’s turn ${entry.turn}`;
      rows.push({ kind: 'divider', key: `turn-${entry.id}`, label, seat: p?.seat });
    }
    rows.push({ kind: 'entry', key: entry.id, entry, bold: entry.youLost !== undefined });
  }
  return rows;
}
