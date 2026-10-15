import { currentDefender } from '../state/focus';
import { useMatch } from '../state/MatchContext';
import { primaryAction, promptText } from '../state/primaryAction';
import { Icon } from './Icon';
import styles from './ActionPanel.module.css';

/**
 * Bottom of the right panel: what the game wants, and the one button that
 * answers it. Sized to its content and anchored to the bottom edge, so the
 * persistent controls (Undo row, switches) keep their place whatever shows
 * above them; anything that comes and goes takes its height from Recent.
 */
export function ActionPanel() {
  const { game, ui, prefs, send, setUi, canUndo } = useMatch();
  const action = primaryAction(game, ui);
  const prompt = promptText(game);
  const d = game.decision;
  const canCancel =
    d.kind === 'chooseTargets' ||
    ((d.kind === 'declareAttackers' || d.kind === 'declareBlockers') && d.draft.length > 0) ||
    ui.pendingBlocker !== undefined ||
    ui.pendingAttacker !== undefined;

  return (
    <section className={styles.panel} aria-label="Your decision">
      {/* Floating mana (issue 24): shown only while the pool is not empty,
          directly above the prompt. Hidden while empty. */}
      <div className={styles.floatingMana} data-slot="floating-mana" />

      {/* Content-sized (at most 4 lines, full text on hover), so it always
          shows and sits directly on the buttons, at any UI scale. */}
      <p className={styles.prompt} aria-live="polite" title={prompt}>
        {prompt}
      </p>

      {/* Contextual buttons that answer the prompt; the row exists only while
          one shows. It sits above the main button, so nothing below moves. */}
      <div className={styles.contextual}>
        {d.kind === 'declareAttackers' ? (
          <button
            type="button"
            className={styles.secondary}
            onClick={() => send({ type: 'attackWithAll', defenderId: currentDefender(game, ui, prefs.layout)! })}
          >
            <Icon name="sword" />
            Attack all ({d.candidates.length})
            <kbd>A</kbd>
          </button>
        ) : null}
        {canCancel ? (
          <button
            type="button"
            className={styles.small}
            onClick={() => {
              send({ type: 'cancel' });
              setUi({ pendingAttacker: undefined, pendingBlocker: undefined });
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
            {!action.enabled && d.kind === 'waiting' ? <Icon name="hourglass" /> : null}
            {action.label}
          </span>
          {action.detail ? <span className={styles.primaryDetail}>{action.detail}</span> : null}
          {action.enabled ? <kbd className={styles.key}>Space</kbd> : null}
        </button>
      </div>

      {/* Persistent controls: fixed slots, never reordered or wrapped. */}
      <div className={styles.persistent}>
        <button type="button" className={styles.small} disabled={!canUndo} onClick={() => send({ type: 'undo' })}>
          <Icon name="undo" />
          Undo <kbd>Z</kbd>
        </button>
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
    </section>
  );
}
