import type { Ref } from 'react';
import { GROUP_CAPTIONS, STEPS, STEP_RUNS, type StepInfo, type StepRun } from '../model/phases';
import { turnPlayerId } from '../state/gameStart';
import { useMatch } from '../state/MatchContext';
import { stepHint } from '../state/stops';
import { Icon } from './Icon';
import styles from './PhaseTrack.module.css';
import { t } from '../i18n';

interface Props {
  /** The full official names do not fit: each step shows its short name (the full one on hover). */
  shortNames: boolean;
  /** Too narrow (1366 px, French): outside combat, the combat steps fold into one "Combat" pill. */
  foldCombat: boolean;
  ref?: Ref<HTMLElement>;
}

/**
 * The turn strip: the steps of the turn being played, in words, with the
 * current one as a ▶ pill. Stops are not shown here: the main button names
 * the next stop, and clicking a step (or Stops) opens the Stops editor.
 * Untap and Cleanup are left out: nobody gets priority there.
 */
export function PhaseTrack({ shortNames, foldCombat, ref }: Props) {
  const { game, ui, prefs, setUi } = useMatch();
  // No current step before turn 1 or after the game.
  const currentIndex = turnPlayerId(game) ? STEPS.findIndex((s) => s.id === game.turn.step) : -1;
  const stopsOpen = ui.overlay === 'stops';
  const openStops = () => setUi({ overlay: 'stops' });
  const fold = foldCombat && !STEPS[currentIndex]?.combat;
  const combatPast = currentIndex > STEPS.findLastIndex((s) => s.combat);

  const step = (s: StepInfo) => {
    const i = STEPS.indexOf(s);
    const isCurrent = i === currentIndex;
    return (
      <button
        key={s.id}
        type="button"
        data-strip-step={s.id}
        data-names={shortNames ? 'short' : 'full'}
        className={`${styles.step} ${isCurrent ? styles.current : i < currentIndex ? styles.past : ''}`}
        aria-current={isCurrent ? 'step' : undefined}
        title={stepHint(game, prefs.stops, s.id)}
        onClick={openStops}
      >
        {isCurrent ? <Icon name="play" /> : null}
        {/* Both names stay laid out, the unused one out of flow, so the top bar can measure either. */}
        <span data-step-name="full" className={shortNames ? styles.measureOnly : undefined} aria-hidden={shortNames || undefined}>
          {s.longLabel}
        </span>
        <span data-step-name="short" className={shortNames ? undefined : styles.measureOnly} aria-hidden={!shortNames || undefined}>
          {s.label}
        </span>
      </button>
    );
  };

  const run = (r: StepRun, measureOnly = false) => (
    <div
      key={r.steps[0]!.id}
      className={`${styles.run} ${r.group === 'combat' ? styles.combat : ''} ${measureOnly ? styles.measureOnly : ''}`}
      data-combat-run={r.group === 'combat' ? (measureOnly ? 'measure' : 'full') : undefined}
      inert={measureOnly}
      aria-hidden={measureOnly || undefined}
    >
      <span className={styles.caption} aria-hidden>
        {r.group ? GROUP_CAPTIONS[r.group] : ''}
      </span>
      <span className={styles.steps}>{r.steps.map(step)}</span>
    </div>
  );

  return (
    <nav ref={ref} className={styles.track} aria-label={t('track.aria')}>
      {STEP_RUNS.map((r) =>
        r.group === 'combat' && fold ? (
          <div key="combat" className={styles.foldWrap}>
            {run(r, true)}
            <div className={`${styles.run} ${styles.combat}`} data-combat-run="fold">
              <span className={styles.caption} aria-hidden />
              <span className={styles.steps}>
                <button
                  type="button"
                  className={`${styles.step} ${combatPast ? styles.past : ''}`}
                  title={t('track.combatTitle', { steps: STEPS.filter((x) => x.combat).map((x) => x.longLabel.toLowerCase()).join(', ') })}
                  onClick={openStops}
                >
                  {t('track.combat')}
                </button>
              </span>
            </div>
          </div>
        ) : (
          run(r)
        ),
      )}
      <span className={styles.stopsSlot}>
        <span className={styles.caption} aria-hidden />
        <button
          type="button"
          className={styles.stopsButton}
          aria-pressed={stopsOpen}
          aria-haspopup="dialog"
          title={t('track.stopsTitle')}
          onClick={() => setUi({ overlay: stopsOpen ? undefined : 'stops' })}
        >
          <Icon name="stop" />
          {t('track.stops')}
        </button>
      </span>
    </nav>
  );
}
