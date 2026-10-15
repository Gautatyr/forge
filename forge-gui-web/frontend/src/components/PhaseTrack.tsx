import { STEPS } from '../model/phases';
import { useMatch } from '../state/MatchContext';
import { Icon } from './Icon';
import styles from './PhaseTrack.module.css';

/**
 * Labelled steps of the turn, with the current one marked. Under each step,
 * two stop toggles: left = stop there on your turns, right = on opponents'
 * turns. Filled octagon = stop, hollow = pass through.
 */
export function PhaseTrack() {
  const { game, send } = useMatch();
  const current = game.turn.step;
  const currentIndex = STEPS.findIndex((s) => s.id === current);
  const yours = game.turn.activePlayerId === game.youId;

  return (
    <nav className={styles.track} aria-label="Turn steps and stops">
      <div className={styles.legend} aria-hidden>
        <span className={styles.legendTitle}>Step</span>
        <span>
          Stop on: <b>your</b> · <b>their</b> turns
        </span>
      </div>
      {STEPS.map((s, i) => {
        const isCurrent = s.id === current;
        const youStop = game.stops.yourTurn.includes(s.id);
        const oppStop = game.stops.opponentsTurn.includes(s.id);
        const relevantStop = yours ? youStop : oppStop;
        return (
          <div
            key={s.id}
            className={`${styles.step} ${s.combat ? styles.combat : ''} ${isCurrent ? styles.current : ''} ${i < currentIndex ? styles.past : ''} ${s.combat && STEPS[i - 1]?.combat !== true ? styles.combatStart : ''} ${s.combat && STEPS[i + 1]?.combat !== true ? styles.combatEnd : ''}`}
            title={`${s.longLabel}${isCurrent ? ' (now)' : ''}${relevantStop && !s.noPriority ? ' · you will stop here this turn' : ''}`}
          >
            <span className={styles.label} aria-current={isCurrent ? 'step' : undefined}>
              {isCurrent ? <Icon name="play" /> : null}
              {s.label}
            </span>
            {s.noPriority ? (
              <span className={styles.pips} />
            ) : (
              <span className={styles.pips}>
                <button
                  type="button"
                  className={`${styles.pip} ${youStop ? styles.on : ''}`}
                  aria-pressed={youStop}
                  aria-label={`Stop at ${s.longLabel} on your turns`}
                  title={`Stop at ${s.longLabel} on your turns: ${youStop ? 'on' : 'off'}`}
                  onClick={() => send({ type: 'setStop', whose: 'yourTurn', step: s.id, on: !youStop })}
                >
                  <Icon name={youStop ? 'stop' : 'stopOff'} />
                </button>
                <button
                  type="button"
                  className={`${styles.pip} ${oppStop ? styles.on : ''}`}
                  aria-pressed={oppStop}
                  aria-label={`Stop at ${s.longLabel} on opponents' turns`}
                  title={`Stop at ${s.longLabel} on opponents' turns: ${oppStop ? 'on' : 'off'}`}
                  onClick={() => send({ type: 'setStop', whose: 'opponentsTurn', step: s.id, on: !oppStop })}
                >
                  <Icon name={oppStop ? 'stop' : 'stopOff'} />
                </button>
              </span>
            )}
          </div>
        );
      })}
    </nav>
  );
}
