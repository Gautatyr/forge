import { useEffect, useEffectEvent, type CSSProperties } from 'react';
import { opponents, player, you } from '../model/selectors';
import { gameEndView, headline, outLine, rankingRows, TOAST_MS, youAreOutText } from '../state/gameEnd';
import { useMatch } from '../state/MatchContext';
import { DevPanel } from './Overlays';
import { Icon, SeatGlyph } from './Icon';
import { useJustOut } from './useJustOut';
import styles from './GameEnd.module.css';

/**
 * Players leaving and the end of the game (design pass 4 §2.6): the "is out"
 * toast, the "You're out" dialog, the concede confirm, the end-of-game panel
 * and the page left after "Back to lobby".
 */

/** "Back to lobby" from any of the views: the game ends and the screen says where the lobby is. */
function useLeave() {
  const { send, setUi } = useMatch();
  return () => {
    send({ type: 'leaveMatch' });
    setUi({ leftMatch: true, overlay: undefined });
  };
}

/** Keys a dialog owns while open (capture phase, so the screen's shortcuts never see them). */
function useDialogKeys(handlers: Partial<Record<'Escape' | 'Enter', () => void>>) {
  const onKey = useEffectEvent((e: KeyboardEvent) => {
    const h = handlers[e.key as 'Escape' | 'Enter'];
    // Enter on a focused button presses that button, as usual.
    if (!h || (e.key === 'Enter' && e.target instanceof HTMLButtonElement)) return;
    e.preventDefault();
    e.stopPropagation();
    h();
  });
  useEffect(() => {
    const k = (e: KeyboardEvent) => onKey(e);
    window.addEventListener('keydown', k, true);
    return () => window.removeEventListener('keydown', k, true);
  }, []);
}

/** "■ Theo is out: 21 commander damage from Krenko, Mob Boss." at the top of the board for 5 s. */
export function OutToast() {
  const { game, prefs } = useMatch();
  const yourShare = opponents(game).length === 1 ? 50 : 100 - prefs.opponentShare;
  const out = useJustOut(game, TOAST_MS)
    .map((id) => player(game, id))
    .filter((p) => !p.isYou);
  return (
    <div className={styles.toasts} style={{ '--your-share': `${yourShare}%` } as CSSProperties} role="status" aria-live="polite">
      {out.map((p) => (
        <p key={p.id} className={styles.toast}>
          <SeatGlyph seat={p.seat} />
          <span>{outLine(p)}</span>
        </p>
      ))}
    </div>
  );
}

/** You are out of a multiplayer game: watch the rest, or leave. Over your board. */
export function YouAreOut() {
  const { game, ui, prefs, setUi } = useMatch();
  const leave = useLeave();
  const open = gameEndView(game, ui) === 'out';
  const watch = () => setUi({ watchingGame: game.id });
  if (!open) return null;
  const yourShare = opponents(game).length === 1 ? 50 : 100 - prefs.opponentShare;
  return (
    <div className={styles.overYourBoard} style={{ '--your-share': `${yourShare}%` } as CSSProperties}>
      <DialogKeys onEscape={watch} />
      <div className={styles.dialog} role="alertdialog" aria-labelledby="you-out-text">
        <p id="you-out-text" className={styles.dialogText}>
          {youAreOutText(you(game))}
        </p>
        <div className={styles.buttons}>
          <button type="button" className={styles.primary} onClick={watch} autoFocus>
            <Icon name="eye" />
            Watch the rest <kbd>Esc</kbd>
          </button>
          <button type="button" className={styles.secondary} onClick={leave}>
            Back to lobby
          </button>
        </div>
      </div>
    </div>
  );
}

function DialogKeys({ onEscape, onEnter }: { onEscape: () => void; onEnter?: () => void }) {
  useDialogKeys({ Escape: onEscape, Enter: onEnter });
  return null;
}

/** Game menu → "Concede game…": "Keep playing" has focus; "Concede" needs a click or Enter on it. */
export function ConcedeDialog() {
  const { game, ui, setUi, send } = useMatch();
  if (gameEndView(game, ui) !== 'concede') return null;
  const close = () => setUi({ overlay: undefined });
  const live = opponents(game).filter((p) => !p.hasLost);
  const after = live.length === 1 ? `${live[0]!.name} wins.` : 'the others keep playing.';
  return (
    <div className={styles.scrim}>
      <DialogKeys onEscape={close} />
      <div className={styles.dialog} role="alertdialog" aria-labelledby="concede-title" aria-describedby="concede-text">
        <p className={styles.dialogText}>
          <b id="concede-title">Concede this game?</b> <span id="concede-text">You're out; {after}</span>
        </p>
        <div className={styles.buttons}>
          <button type="button" className={styles.secondary} onClick={close} autoFocus>
            Keep playing
          </button>
          <button
            type="button"
            className={styles.danger}
            onClick={() => {
              close();
              send({ type: 'concede' });
            }}
          >
            <Icon name="close" />
            Concede
          </button>
        </div>
      </div>
    </div>
  );
}

/** The end of the game: headline, reason, ranking; Back to lobby or Next game (Enter), View the board (Esc). */
export function GameOverPanel() {
  const { game, ui, setUi, send } = useMatch();
  const leave = useLeave();
  if (gameEndView(game, ui) !== 'over' || !game.result) return null;
  const r = game.result;
  const head = headline(game);
  const winner = head.playerId ? player(game, head.playerId) : undefined;
  const view = () => setUi({ boardViewGame: game.id, overlay: undefined });
  const primary = r.nextGame ? () => send({ type: 'nextGame' }) : leave;
  return (
    <div className={styles.scrim}>
      <DialogKeys onEscape={view} onEnter={primary} />
      <section className={styles.panel} role="dialog" aria-modal="true" aria-labelledby="game-over-title">
        <h2 id="game-over-title" className={styles.headline}>
          {winner ? <SeatGlyph seat={winner.seat} /> : null}
          {head.text}
        </h2>
        <p className={styles.reason}>{r.reason}</p>
        <ol className={styles.ranking}>
          {rankingRows(game).map((row) => (
            <li key={row.playerId} className={row.ordinal === '1st' ? styles.first : undefined}>
              <span className={styles.place}>{row.ordinal}</span>
              <SeatGlyph seat={row.seat} />
              <span>
                <b>{row.name}</b>
                {row.detail ? <span className={styles.detail}>, {row.detail}</span> : null}
              </span>
            </li>
          ))}
        </ol>
        <div className={styles.buttons}>
          <button type="button" className={styles.primary} onClick={primary} autoFocus>
            {r.nextGame ? 'Next game' : 'Back to lobby'} <kbd>Enter</kbd>
          </button>
          <button type="button" className={styles.secondary} onClick={view}>
            <Icon name="eye" />
            View the board <kbd>Esc</kbd>
          </button>
        </div>
      </section>
    </div>
  );
}

/** Top-bar chip while viewing the board after the game: "Game over · Back to lobby" (or "· Next game"). */
export function GameOverChip({ className }: { className: string }) {
  const { game, ui, send } = useMatch();
  const leave = useLeave();
  if (!game.result || ui.boardViewGame !== game.id) return null;
  const next = game.result.nextGame;
  return (
    <button type="button" className={className} onClick={next ? () => send({ type: 'nextGame' }) : leave}>
      <Icon name="stop" /> Game over · {next ? 'Next game' : 'Back to lobby'}
    </button>
  );
}

/** After "Back to lobby": the bridge hands control back to Forge's lobby. */
export function LeftMatch() {
  return (
    <main className={styles.left}>
      <p className={styles.dialogText}>Match finished. Forge's lobby is open; you can close this tab.</p>
      <DevPanel />
    </main>
  );
}
