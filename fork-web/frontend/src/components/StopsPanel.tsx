import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react';
import { GROUP_CAPTIONS, PRIORITY_STEPS, STEP_RUNS } from '../model/phases';
import type { PlayerView, StepId } from '../model/types';
import { useMatch } from '../state/MatchContext';
import type { StopPrefs } from '../state/prefs';
import {
  opponentCell,
  resetStops,
  setOpponentStop,
  setSharedOpponentStop,
  setYourStop,
  sharedOpponentCell,
  type StopCell,
} from '../state/stops';
import { Icon, SeatGlyph } from './Icon';
import styles from './StopsPanel.module.css';
import { t } from '../i18n';

const cellWord = (c: StopCell): string => (c === 'stop' ? t('stops.cellStop') : c === 'pass' ? t('stops.cellPass') : t('stops.cellMixed'));

/** Where the strip's steps sit, in px from the board area's left edge. */
interface Columns {
  lefts: number[];
  widths: number[];
  /** 1 rem in px. */
  rem: number;
}

/** Undefined while the strip folds its combat steps (1366 px, French): the grid then sizes itself. */
function measureColumns(host: HTMLElement): Columns | undefined {
  const hostLeft = host.getBoundingClientRect().left;
  const lefts: number[] = [];
  const widths: number[] = [];
  for (const s of PRIORITY_STEPS) {
    const el = [...document.querySelectorAll(`[data-strip-step="${s.id}"]`)].find((e) => !e.closest('[inert]'));
    if (!el) return undefined;
    const r = el.getBoundingClientRect();
    lefts.push(Math.round(r.left - hostLeft));
    widths.push(Math.round(r.width));
  }
  return { lefts, widths, rem: parseFloat(getComputedStyle(document.documentElement).fontSize) || 16 };
}

const sameColumns = (a: Columns | undefined, b: Columns | undefined) =>
  a === b || (!!a && !!b && a.rem === b.rem && a.lefts.every((x, i) => x === b.lefts[i]) && a.widths.every((x, i) => x === b.widths[i]));

function useStripColumns(panelRef: RefObject<HTMLElement | null>) {
  const [cols, setCols] = useState<Columns>();
  useLayoutEffect(() => {
    const host = panelRef.current?.parentElement;
    if (!host) return;
    const ro = new ResizeObserver(() => {
      const next = measureColumns(host);
      setCols((c) => (sameColumns(c, next) ? c : next));
    });
    ro.observe(host);
    const strip = document.querySelector('[data-strip-step]')?.closest('nav');
    if (strip) ro.observe(strip);
    return () => ro.disconnect();
  }, [panelRef]);
  return cols;
}

/**
 * The Stops editor: where the game waits for you, a word in every cell.
 * Drops over the opponents' area without locking the board; Done or Esc
 * closes it. Changes apply at once (no Save).
 */
export function StopsPanel() {
  const { ui } = useMatch();
  return ui.overlay === 'stops' ? <StopsEditor /> : null;
}

const firstOfRun = new Set(STEP_RUNS.map((r) => r.steps[0]!.id));
/** The spec's "│" around the combat steps. */
const SEPARATOR_BEFORE = new Set<StepId>(['beginCombat', 'main2']);

function StopsEditor() {
  const { setUi, game, prefs, setPrefs, send } = useMatch();
  const panelRef = useRef<HTMLElement>(null);
  const cols = useStripColumns(panelRef);
  const stops = prefs.stops;
  const opponents = game.players.filter((p) => p.id !== game.youId && !p.hasLost);
  const opponentIds = opponents.map((p) => p.id);
  const multi = opponents.length > 1;
  const [perOpen, setPerOpen] = useState(
    () => multi && PRIORITY_STEPS.some((s) => sharedOpponentCell(stops, opponentIds, s.id) === 'mixed'),
  );
  const setStops = (next: StopPrefs) => setPrefs({ stops: next });

  // Line the step columns up under the strip's steps; the label column takes
  // the room left of them (at least 9 rem, else the panel starts further left).
  let panelStyle: CSSProperties | undefined;
  let gridStyle: CSSProperties | undefined;
  if (cols) {
    const pad = 0.75 * cols.rem;
    const first = cols.lefts[0]!;
    const left = Math.max(pad, first - pad - 9 * cols.rem);
    const tracks = cols.lefts.map((x, i) => (i + 1 < cols.lefts.length ? cols.lefts[i + 1]! - x : cols.widths[i]!));
    panelStyle = { left };
    gridStyle = { gridTemplateColumns: `${first - left - pad}px ${tracks.map((w) => `${w}px`).join(' ')}` };
  }
  const cellStyle = (i: number): CSSProperties | undefined => (cols ? { width: cols.widths[i] } : undefined);
  const cellClass = (id: StepId) => `${styles.cell} ${SEPARATOR_BEFORE.has(id) ? styles.separator : ''}`;

  const toggle = (cell: StopCell, rowLabel: string, stepLabel: string, onToggle: (on: boolean) => void) => (
    <button
      type="button"
      className={`${styles.toggle} ${styles[cell]}`}
      aria-pressed={cell === 'mixed' ? 'mixed' : cell === 'stop'}
      aria-label={t('stops.toggleAria', { row: rowLabel, step: stepLabel, cell: cellWord(cell) })}
      title={t('stops.toggleTitle', { row: rowLabel, step: stepLabel, cell: cellWord(cell), action: cell === 'stop' ? t('stops.actionPass') : t('stops.actionStop') })}
      onClick={() => onToggle(cell !== 'stop')}
    >
      {cellWord(cell)}
    </button>
  );

  const row = (
    key: string,
    label: ReactNode,
    rowLabel: string,
    cellOf: (id: StepId) => StopCell,
    set: (id: StepId, on: boolean) => void,
    sub = false,
  ) => (
    <div key={key} className={`${styles.row} ${sub ? styles.sub : ''}`} role="row">
      <span className={styles.rowLabel} role="rowheader">
        {label}
      </span>
      {PRIORITY_STEPS.map((s, i) => (
        <span key={s.id} className={cellClass(s.id)} role="cell">
          <span className={styles.cellBox} style={cellStyle(i)}>
            {toggle(cellOf(s.id), rowLabel, s.longLabel, (on) => set(s.id, on))}
          </span>
        </span>
      ))}
    </div>
  );

  const theirTurns = multi ? t('stops.onOpps') : t('stops.onOpp');
  const opponentRow = (p: PlayerView) =>
    row(
      p.id,
      <>
        <SeatGlyph seat={p.seat} /> {p.name}
      </>,
      t('stops.onName', { name: p.name }),
      (id) => opponentCell(stops, p.id, id),
      (id, on) => setStops(setOpponentStop(stops, p.id, id, on)),
      true,
    );

  return (
    <section ref={panelRef} className={styles.panel} style={panelStyle} role="dialog" aria-modal="false" aria-labelledby="stops-title">
      <header className={styles.head}>
        <div className={styles.titles}>
          <h2 id="stops-title">{t('stops.title')}</h2>
          <p className={styles.help}>{t('stops.help')}</p>
        </div>
        <button type="button" className={styles.done} onClick={() => setUi({ overlay: undefined })}>
          {t('stops.done')} <kbd>{t('key.esc')}</kbd>
        </button>
      </header>

      <div className={styles.grid} style={gridStyle} data-aligned={cols ? true : undefined} role="table" aria-label={t('stops.byStep')}>
        <div className={`${styles.row} ${styles.heads}`} role="row">
          <span className={styles.rowLabel} role="columnheader" />
          {PRIORITY_STEPS.map((s, i) => (
            <span key={s.id} className={cellClass(s.id)} role="columnheader" aria-label={s.longLabel}>
              <span className={styles.cellBox} style={cellStyle(i)}>
                <span className={styles.caption} aria-hidden>
                  {firstOfRun.has(s.id) && s.group ? GROUP_CAPTIONS[s.group] : ''}
                </span>
                <span className={styles.stepName}>{s.label}</span>
              </span>
            </span>
          ))}
        </div>
        {row(
          'you',
          t('stops.onMine'),
          t('stops.onMine'),
          (id) => (stops.yourTurn.includes(id) ? 'stop' : 'pass'),
          (id, on) => setStops(setYourStop(stops, id, on)),
        )}
        {row(
          'opponents',
          theirTurns,
          theirTurns,
          (id) => sharedOpponentCell(stops, opponentIds, id),
          (id, on) => setStops(setSharedOpponentStop(stops, id, on)),
        )}
        {multi && perOpen ? opponents.map(opponentRow) : null}
      </div>

      <footer className={styles.foot}>
        {multi ? (
          <button type="button" className={styles.link} aria-expanded={perOpen} onClick={() => setPerOpen((o) => !o)}>
            {t('stops.perOpp')} <span aria-hidden>{perOpen ? '▾' : '▸'}</span>
          </button>
        ) : null}
        <button type="button" className={styles.link} onClick={() => setStops(resetStops())}>
          <Icon name="undo" />
          {t('stops.reset')}
        </button>
        <label className={styles.switchRow} title={t('action.autoPassTitle')}>
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
            {t('stops.autoPass')} <b>{game.autoPass ? t('common.on') : t('common.off')}</b>
          </span>
        </label>
      </footer>
    </section>
  );
}
