/**
 * Players leaving and the end of the game (design pass 4 §2.6): the words,
 * the ranking, who just went out, and which game-end view is open.
 */
import { nameLabel, opponents, player, you } from '../model/selectors';
import type { GameView, OutReason, PlayerId, PlayerView } from '../model/types';
import type { UiState } from './ui';
import { t, uiLocale } from '../i18n';

/** "Krenko, Mob Boss" → "Krenko". */
export const shortName = (name: string) => name.split(',')[0]!.trim();

/** How long an opponent's column takes to leave the board. */
export const LEAVE_MS = 250;
/** How long the "is out" toast stays. */
export const TOAST_MS = 5000;

export function outReasonText(r: OutReason, o: { short?: boolean; you?: boolean } = {}): string {
  switch (r.kind) {
    case 'commanderDamage':
      return t('out.commander', { amount: r.amount, name: o.short ? shortName(r.commanderName) : r.commanderName });
    case 'life':
      return t('out.life', { life: String(r.life).replace('-', '−') });
    case 'poison':
      return t('out.poison', { count: r.count });
    case 'emptyLibrary':
      return t('out.library');
    case 'conceded':
      return o.you ? t('out.concededYou') : t('out.conceded');
    case 'other':
      return r.text;
  }
}

/** Toast and log line: "Theo is out: 21 commander damage from Krenko, Mob Boss." (the seat shape goes before it). */
export function outLine(p: PlayerView): string {
  return p.out ? t('out.line', { name: p.name, reason: outReasonText(p.out.reason) }) : t('out.lineBare', { name: p.name });
}

export function youAreOutText(p: PlayerView): string {
  return p.out ? t('out.youReason', { reason: outReasonText(p.out.reason, { you: true }) }) : t('out.youBare');
}

export function ordinal(n: number): string {
  // English: 1st 2nd 3rd 4th; French: 1er, then 2e 3e…
  const form = new Intl.PluralRules(uiLocale(), { type: 'ordinal' }).select(n);
  return t(form === 'one' ? 'ordinal.one' : form === 'two' ? 'ordinal.two' : form === 'few' ? 'ordinal.three' : 'ordinal.other', { n });
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
      name: nameLabel(p),
      detail: p.out ? t('out.detail', { turn: p.out.turn, reason: outReasonText(p.out.reason, { short: true }) }) : '',
    };
  });
}

/** "You won" / "Mira won" (the seat shape goes before the name) / "Draw". */
export function headline(game: GameView): { playerId?: PlayerId; text: string } {
  const w = game.result?.winnerId;
  if (!w) return { text: t('result.draw') };
  if (w === game.youId) return { playerId: undefined, text: t('result.youWon') };
  return { playerId: w, text: t('result.won', { name: player(game, w).name }) };
}

export const liveIds = (game: GameView): PlayerId[] => game.players.filter((p) => !p.hasLost).map((p) => p.id);

/** Players who were live in `before` and are out now. */
export function newlyOut(before: PlayerId[], game: GameView): PlayerId[] {
  return game.players.filter((p) => p.hasLost && before.includes(p.id)).map((p) => p.id);
}

/**
 * Players still in the game when it ended: the first two of the ranking (the
 * winner and the last one out, or the two who drew). Forge removes a loser's
 * objects only while more than 2 players are in the game (Game.onPlayerLost),
 * so their boards stay and keep their seats. Empty while the game goes on.
 */
export function finalPlayers(game: GameView): PlayerId[] {
  return game.result ? game.result.ranking.slice(0, 2) : [];
}

/** Just-out players whose column leaves: not the final players, who stay on the board. */
export function leavingIds(game: GameView, justOut: PlayerId[]): PlayerId[] {
  const final = finalPlayers(game);
  return justOut.filter((id) => !final.includes(id));
}

/** Opponents the board draws, in seat order: the live ones, the final players, and those whose column is still leaving. */
export function boardOpponents(game: GameView, leaving: PlayerId[]): PlayerView[] {
  const final = finalPlayers(game);
  return opponents(game).filter((p) => !p.hasLost || final.includes(p.id) || leaving.includes(p.id));
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
