/**
 * Players leaving and the end of the game (design pass 4 §2.6): the words,
 * the ranking, who just went out, and which game-end view is open.
 */
import { opponents, player, you } from '../model/selectors';
import type { GameView, OutReason, PlayerId, PlayerView } from '../model/types';
import type { UiState } from './ui';

/** "Krenko, Mob Boss" → "Krenko". */
export const shortName = (name: string) => name.split(',')[0]!.trim();

/** How long an opponent's column takes to leave the board. */
export const LEAVE_MS = 250;
/** How long the "is out" toast stays. */
export const TOAST_MS = 5000;

export function outReasonText(r: OutReason, o: { short?: boolean; you?: boolean } = {}): string {
  switch (r.kind) {
    case 'commanderDamage':
      return `${r.amount} commander damage from ${o.short ? shortName(r.commanderName) : r.commanderName}`;
    case 'life':
      return `life down to ${String(r.life).replace('-', '−')}`;
    case 'poison':
      return `${r.count} poison counters`;
    case 'emptyLibrary':
      return 'drew from an empty library';
    case 'conceded':
      return o.you ? 'you conceded' : 'conceded';
    case 'other':
      return r.text;
  }
}

/** Toast and log line: "Theo is out: 21 commander damage from Krenko, Mob Boss." (the seat shape goes before it). */
export function outLine(p: PlayerView): string {
  return p.out ? `${p.name} is out: ${outReasonText(p.out.reason)}.` : `${p.name} is out.`;
}

export function youAreOutText(p: PlayerView): string {
  return `You're out${p.out ? `: ${outReasonText(p.out.reason, { you: true })}` : ''}. The game continues.`;
}

export function ordinal(n: number): string {
  const teen = n % 100 >= 11 && n % 100 <= 13;
  const suffix = teen ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th';
  return `${n}${suffix}`;
}

export interface RankRow {
  playerId: PlayerId;
  seat: number;
  ordinal: string;
  /** "Theo", or "Hugo (you)". */
  name: string;
  /** "turn 12, 21 commander damage from Krenko"; empty for the winner. */
  detail: string;
}

/** The ranked list of the end-of-game panel, 1st first. */
export function rankingRows(game: GameView): RankRow[] {
  return (game.result?.ranking ?? []).map((id, i) => {
    const p = player(game, id);
    return {
      playerId: id,
      seat: p.seat,
      ordinal: ordinal(i + 1),
      name: p.isYou ? `${p.name} (you)` : p.name,
      detail: p.out ? `turn ${p.out.turn}, ${outReasonText(p.out.reason, { short: true })}` : '',
    };
  });
}

/** "You won" / "Mira won" (the seat shape goes before the name) / "Draw". */
export function headline(game: GameView): { playerId?: PlayerId; text: string } {
  const w = game.result?.winnerId;
  if (!w) return { text: 'Draw' };
  if (w === game.youId) return { playerId: undefined, text: 'You won' };
  return { playerId: w, text: `${player(game, w).name} won` };
}

export const liveIds = (game: GameView): PlayerId[] => game.players.filter((p) => !p.hasLost).map((p) => p.id);

/** Players who were live in `before` and are out now. */
export function newlyOut(before: PlayerId[], game: GameView): PlayerId[] {
  return game.players.filter((p) => p.hasLost && before.includes(p.id)).map((p) => p.id);
}

/** Opponents the board draws: the live ones, plus those whose column is still leaving, in seat order. */
export function boardOpponents(game: GameView, leaving: PlayerId[]): PlayerView[] {
  return opponents(game).filter((p) => !p.hasLost || leaving.includes(p.id));
}

/** You are out and the game goes on without you: the action block reads "Watching". */
export function watching(game: GameView): boolean {
  return you(game).hasLost && !game.result;
}

export type GameEndView = 'concede' | 'out' | 'over';

/** The game-end dialog or panel open now; they take the keyboard while open. */
export function gameEndView(game: GameView, ui: UiState): GameEndView | undefined {
  if (game.result) return ui.boardViewGame === game.id ? undefined : 'over';
  if (watching(game)) return ui.watchingGame === game.id ? undefined : 'out';
  if (ui.overlay === 'concede') return 'concede';
  return undefined;
}
