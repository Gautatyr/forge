import { useEffect } from 'react';
import { you } from '../model/selectors';
import { canAttackAll } from '../state/attackLimit';
import { currentAttackAim } from '../state/focus';
import { watching } from '../state/gameEnd';
import { useMatch } from '../state/MatchContext';
import { canCancel, cancelLabel, primaryAction, promptText } from '../state/primaryAction';
import { Icon } from './Icon';
import { FloatingMana, PaymentCost } from './Payment';
import styles from './ActionPanel.module.css';
import { t } from '../i18n';

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
  const cancel = canCancel(game, ui);
  // A Cancel that is a game choice says what it does ("Decline: You lose 3 life", issue #81).
  const cancelText = cancelLabel(game);

  // A refused attack declaration stays until the player acts (send clears it) or the declaration ends.
  const stale = note?.sticky && d.kind !== 'declareAttackers';
  useEffect(() => {
    if (!note) return;
    if (stale) {
      setUi((u) => (u.promptNote?.id === note.id ? { ...u, promptNote: undefined } : u));
      return;
    }
    if (note.sticky) return;
    const timer = window.setTimeout(() => setUi((u) => (u.promptNote?.id === note.id ? { ...u, promptNote: undefined } : u)), NOTE_MS);
    return () => window.clearTimeout(timer);
  }, [note, stale, setUi]);

  return (
    <section className={styles.panel} aria-label={t('action.decision')}>
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
        {d.kind === 'declareAttackers' && canAttackAll(d) ? (
          <button
            type="button"
            className={styles.secondary}
            onClick={() => send({ type: 'attackWithAll', ...currentAttackAim(game, ui, prefs.layout)! })}
          >
            <Icon name="sword" />
            {t('action.attackAll', { count: d.candidates.length })}
            <kbd>A</kbd>
          </button>
        ) : null}
        {paying?.lifePays ? (
          // Phyrexian mana: auto-pay never pays life (issue #66); each click pays 2 life for one symbol.
          <button type="button" className={styles.secondary} onClick={() => send({ type: 'payLife' })}>
            {t('action.payLife')}
          </button>
        ) : null}
        {cancel ? (
          <button
            type="button"
            className={styles.small}
            title={cancelText}
            onClick={() => {
              send({ type: 'cancel' });
              setUi({ pendingAttacker: undefined, pendingBlocker: undefined, manaChoice: undefined });
            }}
          >
            <Icon name="close" />
            <span className={styles.cancelText}>{cancelText}</span> <kbd>{t('key.esc')}</kbd>
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
            {action.enabled ? <kbd className={styles.key}>{t('key.space')}</kbd> : null}
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
            title={t('action.undoTapTitle')}
            onClick={() => send({ type: 'undoTap' })}
          >
            <Icon name="undo" />
            {t('action.undoTap')} <kbd>Z</kbd>
          </button>
        ) : (
          <button type="button" className={styles.small} disabled={!canUndo || ended} onClick={() => send({ type: 'undo' })}>
            <Icon name="undo" />
            {t('action.undo')} <kbd>Z</kbd>
          </button>
        )}
        {game.passingUntilYourTurn ? (
          <button type="button" className={`${styles.small} ${styles.on}`} onClick={() => send({ type: 'cancelPassUntilYourTurn' })}>
            <Icon name="close" />
            {t('action.stopPassing')}
          </button>
        ) : (
          <button
            type="button"
            className={styles.small}
            title={t('action.toMyTurnTitle')}
            disabled={ended}
            onClick={() => send({ type: 'passUntilYourTurn' })}
          >
            <Icon name="endTurn" />
            {t('action.toMyTurn')} <kbd>⇧↵</kbd>
          </button>
        )}
      </div>

      <label className={styles.toggle} title={t('action.autoPassTitle')}>
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
          {t('action.autoPass')} <b>{game.autoPass ? t('common.on') : t('common.off')}</b>
        </span>
        <kbd>P</kbd>
      </label>

      <label className={styles.toggle} title={t('action.autoPayTitle')}>
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
          {t('action.autoPay')} <b>{game.autoPay ? t('common.on') : t('common.off')}</b>
        </span>
      </label>
    </section>
  );
}
