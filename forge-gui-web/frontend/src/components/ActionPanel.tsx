import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { currentDefender } from '../state/focus';
import { useMatch } from '../state/MatchContext';
import { primaryAction, promptText } from '../state/primaryAction';
import { Icon } from './Icon';
import styles from './ActionPanel.module.css';

/**
 * How many whole lines fit in an element whose height the layout sets (the
 * prompt takes what the buttons leave). Clamping to that count ends the text
 * on a whole line with an ellipsis instead of slicing a line in half.
 */
function useWholeLines<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [lines, setLines] = useState(4);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const lh = parseFloat(getComputedStyle(el).lineHeight);
      if (!(lh > 0)) return;
      setLines(Math.max(1, Math.min(4, Math.floor((el.clientHeight + 0.5) / lh))));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, lines] as const;
}

/** Bottom-right, beside the hand: what the game wants, and the one button that answers it. */
export function ActionPanel() {
  const { game, ui, prefs, send, setUi, canUndo } = useMatch();
  const action = primaryAction(game, ui);
  const [promptRef, promptLines] = useWholeLines<HTMLParagraphElement>();
  const d = game.decision;
  const canCancel =
    d.kind === 'chooseTargets' ||
    ((d.kind === 'declareAttackers' || d.kind === 'declareBlockers') && d.draft.length > 0) ||
    ui.pendingBlocker !== undefined ||
    ui.pendingAttacker !== undefined;

  return (
    <section className={styles.panel} aria-label="Your decision">
      <p ref={promptRef} className={styles.prompt} aria-live="polite">
        <span className={styles.promptText} style={{ WebkitLineClamp: promptLines } as CSSProperties}>
          {promptText(game)}
        </span>
      </p>

      {/* Reserved slot for contextual buttons: always takes its height, so
          nothing below it moves when they come and go (mockup review 1). */}
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
