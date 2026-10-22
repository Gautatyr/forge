import { useEffect } from 'react';
import { you } from '../model/selectors';
import { currentAttackAim } from '../state/focus';
import { watching } from '../state/gameEnd';
import { useMatch } from '../state/MatchContext';
import { primaryAction, promptText } from '../state/primaryAction';
import { Icon } from './Icon';
import { FloatingMana, PaymentCost } from './Payment';
import styles from './ActionPanel.module.css';

/** How long the neutral note ("You can't play … right now.") holds the prompt line. */
const NOTE_MS = 3000;

/**
 * Bottom of the right panel: what the game wants, and the one button that
 * answers it. Sized to its content and anchored to the bottom edge, so the
 * persistent controls (Undo row, switches) keep their place whatever shows
 * above them; anything that comes and goes takes its height from Recent.
 */
export function ActionPanel() {
  const { game, ui, prefs, send, setUi, canUndo } = useMatch();
  const action = primaryAction(game, ui, prefs.stops);
  const prompt = promptText(game);
  const d = game.decision;
  const paying = d.kind === 'payMana' ? d : undefined;
  const note = ui.promptNote;
  // Out of the game or game over: the block reads "Watching" / "Game over" and offers nothing (§2.6).
  const ended = game.result !== undefined || watching(game);
  const canCancel =
    d.kind === 'chooseTargets' ||
    d.kind === 'payMana' ||
    ((d.kind === 'declareAttackers' || d.kind === 'declareBlockers') && d.draft.length > 0) ||
    ui.pendingBlocker !== undefined ||
    ui.pendingAttacker !== undefined;

  useEffect(() => {
    if (!note) return;
    const t = window.setTimeout(() => setUi((u) => (u.promptNote?.id === note.id ? { ...u, promptNote: undefined } : u)), NOTE_MS);
    return () => window.clearTimeout(t);
  }, [note, setUi]);

  return (
    <section className={styles.panel} aria-label="Your decision">
      {/* Floating mana: shown only while the pool is not empty, directly above the prompt. */}
      <div className={styles.floatingMana} data-slot="floating-mana">
        <FloatingMana pool={you(game).manaPool} paying={paying} onSpend={(colour) => send({ type: 'spendPool', colour })} />
      </div>

      {/* Payment mode (design pass 4, §2.1): the cost with paid symbols filled. */}
      {paying ? <PaymentCost game={game} paying={paying} /> : null}

      {/* Content-sized (at most 4 lines, full text on hover), so it always
          shows and sits directly on the buttons, at any UI scale. A neutral
          note replaces it for 3 s. */}
      {note ? (
        <p className={`${styles.prompt} ${styles.note}`} aria-live="polite" title={note.text}>
          {note.text}
        </p>
      ) : prompt ? (
        <p className={styles.prompt} aria-live="polite" title={prompt}>
          {prompt}
        </p>
      ) : null}

      {/* Contextual buttons that answer the prompt; the row exists only while
          one shows. It sits above the main button, so nothing below moves. */}
      <div className={styles.contextual}>
        {d.kind === 'declareAttackers' ? (
          <button
            type="button"
            className={styles.secondary}
            onClick={() => send({ type: 'attackWithAll', ...currentAttackAim(game, ui, prefs.layout)! })}
          >
            <Icon name="sword" />
            Attack all ({d.candidates.length})
            <kbd>A</kbd>
          </button>
        ) : null}
        {paying?.lifePays ? (
          // Phyrexian mana: auto-pay never pays life (issue #66); each click pays 2 life for one symbol.
          <button type="button" className={styles.secondary} onClick={() => send({ type: 'payLife' })}>
            Pay 2 life
          </button>
        ) : null}
        {canCancel ? (
          <button
            type="button"
            className={styles.small}
            onClick={() => {
              send({ type: 'cancel' });
              setUi({ pendingAttacker: undefined, pendingBlocker: undefined, manaChoice: undefined });
            }}
          >
            <Icon name="close" />
            Cancel <kbd>Esc</kbd>
          </button>
        ) : null}
      </div>

      <div className={styles.mainRow}>
        <button
          type="button"
          className={`${styles.primary} ${styles[action.tone]}`}
          disabled={!action.enabled}
          onClick={() => action.intent && send(action.intent)}
        >
          <span className={styles.primaryLabel}>
            {action.tone === 'attack' ? <Icon name="sword" /> : action.tone === 'block' ? <Icon name="shield" /> : null}
            {ended ? <Icon name="eye" /> : !action.enabled && d.kind === 'waiting' ? <Icon name="hourglass" /> : null}
            {action.label}
            {action.enabled ? <kbd className={styles.key}>Space</kbd> : null}
          </span>
          {action.detail ? (
            <span className={styles.primaryDetail} title={action.detail}>
              {action.detail}
            </span>
          ) : null}
        </button>
      </div>

      {/* Persistent controls: fixed slots, never reordered or wrapped. While
          paying, Undo takes back the last tap. */}
      <div className={styles.persistent}>
        {paying ? (
          <button
            type="button"
            className={styles.small}
            disabled={!paying.canUndoTap}
            title="Untap the last source, or return the last floating mana spent"
            onClick={() => send({ type: 'undoTap' })}
          >
            <Icon name="undo" />
            Undo tap <kbd>Z</kbd>
          </button>
        ) : (
          <button type="button" className={styles.small} disabled={!canUndo || ended} onClick={() => send({ type: 'undo' })}>
            <Icon name="undo" />
            Undo <kbd>Z</kbd>
          </button>
        )}
        {game.passingUntilYourTurn ? (
          <button type="button" className={`${styles.small} ${styles.on}`} onClick={() => send({ type: 'cancelPassUntilYourTurn' })}>
            <Icon name="close" />
            Stop passing
          </button>
        ) : (
          <button
            type="button"
            className={styles.small}
            title="Pass priority until your next turn. Stops and the stack still interrupt."
            disabled={ended}
            onClick={() => send({ type: 'passUntilYourTurn' })}
          >
            <Icon name="endTurn" />
            To my turn <kbd>⇧↵</kbd>
          </button>
        )}
      </div>

      <label className={styles.toggle} title="Pass priority automatically when you have nothing you can play. Off by default.">
        <input
          type="checkbox"
          role="switch"
          checked={game.autoPass}
          onChange={(e) => send({ type: 'setAutoPass', on: e.target.checked })}
        />
        <span className={styles.switch} aria-hidden>
          <span className={styles.knob} />
        </span>
        <span>
          Auto-pass when I can't act <b>{game.autoPass ? 'On' : 'Off'}</b>
        </span>
        <kbd>P</kbd>
      </label>

      <label className={styles.toggle} title="Pay mana costs at once when you cast or activate. Off by default: you click your lands.">
        <input
          type="checkbox"
          role="switch"
          checked={game.autoPay ?? false}
          onChange={(e) => send({ type: 'setAutoPay', on: e.target.checked })}
        />
        <span className={styles.switch} aria-hidden>
          <span className={styles.knob} />
        </span>
        <span>
          Auto-pay mana <b>{game.autoPay ? 'On' : 'Off'}</b>
        </span>
      </label>
    </section>
  );
}
