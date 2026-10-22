import { useEffect, useEffectEvent, useRef, useState, type ReactNode } from 'react';
import { player, you } from '../model/selectors';
import { SCENARIOS } from '../mock/scenarios';
import { shortcuts } from '../state/keymap';
import { useMatch } from '../state/MatchContext';
import { OPPONENT_SHARES, type OpponentLayout, type OpponentShare } from '../state/prefs';
import { Icon, SeatGlyph } from './Icon';
import { LogText } from './LogText';
import { PREVIEW_BESIDE_ATTR } from './previewSpot';
import styles from './Overlays.module.css';
import { LANGS, t, tDynamic, type Lang } from '../i18n';

function Popover({ title, onClose, children, className }: { title: string; onClose: () => void; children: ReactNode; className?: string }) {
  return (
    <div className={`${styles.popover} ${className ?? ''}`} role="dialog" aria-label={title}>
      <header className={styles.head}>
        <h2>{title}</h2>
        <button type="button" className={styles.close} onClick={onClose} aria-label={t('common.close')}>
          <Icon name="close" />
        </button>
      </header>
      {children}
    </div>
  );
}

function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: [T, string][]; onChange: (v: T) => void; label: string }) {
  return (
    <div className={styles.segmented} role="radiogroup" aria-label={label}>
      {options.map(([v, text]) => (
        <button key={v} type="button" role="radio" aria-checked={value === v} className={value === v ? styles.segOn : ''} onClick={() => onChange(v)}>
          {value === v ? <Icon name="check" /> : null}
          {text}
        </button>
      ))}
    </div>
  );
}

export function DisplaySettings() {
  const { ui, setUi, prefs, setPrefs, game } = useMatch();
  if (ui.overlay !== 'display') return null;
  const multiplayer = game.players.length > 2;
  return (
    <Popover title={t('disp.title')} onClose={() => setUi({ overlay: undefined })} className={styles.display}>
      <div className={styles.field}>
        <span className={styles.fieldLabel}>
          {t('disp.layout')} {multiplayer ? '' : t('disp.mpOnly')}
        </span>
        <Segmented<OpponentLayout>
          label={t('disp.layout')}
          value={prefs.layout}
          onChange={(layout) => setPrefs({ layout })}
          options={[
            ['columns', t('disp.columns')],
            ['table', t('disp.table')],
            ['focus', t('disp.focus')],
          ]}
        />
        <span className={styles.help}>
          {prefs.layout === 'columns'
            ? t('disp.columnsHelp')
            : prefs.layout === 'table'
              ? t('disp.tableHelp')
              : t('disp.focusHelp')}
        </span>
      </div>
      <div className={styles.field}>
        <span className={styles.fieldLabel}>
          {t('disp.height')} {multiplayer ? '' : t('disp.mpOnly')}
        </span>
        <Segmented<string>
          label={t('disp.split')}
          value={String(prefs.opponentShare)}
          onChange={(v) => setPrefs({ opponentShare: Number(v) as OpponentShare })}
          options={OPPONENT_SHARES.map((n) => [String(n), `${n}%`])}
        />
        <span className={styles.help}>
          {t('disp.splitHelp', { opp: prefs.opponentShare, you: 100 - prefs.opponentShare })}
        </span>
      </div>
      <label className={styles.check}>
        <input type="checkbox" checked={prefs.nameLabels} onChange={(e) => setPrefs({ nameLabels: e.target.checked })} />
        {t('disp.nameLabels')}
      </label>
      <label className={styles.check}>
        <input type="checkbox" checked={prefs.groupLands} onChange={(e) => setPrefs({ groupLands: e.target.checked })} />
        {t('disp.groupLands')}
      </label>
      <label className={styles.check}>
        <input type="checkbox" checked={prefs.groupTokens} onChange={(e) => setPrefs({ groupTokens: e.target.checked })} />
        {t('disp.groupTokens')}
      </label>
      <ScaleSlider value={prefs.uiScale} onCommit={(uiScale) => setPrefs({ uiScale })} />
      <div className={styles.field}>
        <span className={styles.fieldLabel}>{t('lang.label')}</span>
        <Segmented<Lang>
          label={t('lang.label')}
          value={prefs.language}
          onChange={(language) => setPrefs({ language })}
          options={LANGS.map((l) => [l, l === 'fr' ? t('lang.fr') : t('lang.en')])}
        />
        <span className={styles.help}>{t('lang.help')}</span>
      </div>
    </Popover>
  );
}

/**
 * Interface scale. Dragging only previews the number; the scale applies when
 * the thumb is released, so the layout does not reflow under the pointer
 * (mockup review 1). Arrow keys, Page Up/Down and Home/End apply each step:
 * the browser fires `change` on release and on every keyboard step.
 */
function ScaleSlider({ value, onCommit }: { value: number; onCommit: (v: number) => void }) {
  const [draft, setDraft] = useState<number>();
  const ref = useRef<HTMLInputElement>(null);
  const commit = useEffectEvent((v: number) => {
    setDraft(undefined);
    if (v !== value) onCommit(v);
  });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const h = () => commit(Number(el.value) / 100);
    el.addEventListener('change', h);
    return () => el.removeEventListener('change', h);
  }, []);
  const shown = draft ?? value;
  const pending = draft !== undefined && draft !== value;
  return (
    <div className={styles.field}>
      <span className={styles.fieldLabel}>
        {t('disp.scale')} <b>{Math.round(shown * 100)}%</b>
        {pending ? <span className={styles.help}> {t('disp.release')}</span> : null}
      </span>
      <input
        ref={ref}
        type="range"
        min={75}
        max={200}
        step={5}
        value={Math.round(shown * 100)}
        onChange={(e) => setDraft(Number(e.target.value) / 100)}
        aria-label={t('disp.scale')}
        aria-valuetext={`${Math.round(shown * 100)}%`}
      />
    </div>
  );
}

export function ShortcutsOverlay() {
  const { ui, setUi } = useMatch();
  if (ui.overlay !== 'shortcuts') return null;
  const groups = ['Play', 'Look', 'Screen'] as const;
  const all = shortcuts();
  return (
    <div className={styles.scrim} onClick={() => setUi({ overlay: undefined })}>
      <div className={styles.sheet} role="dialog" aria-label={t('sc.title')} onClick={(e) => e.stopPropagation()}>
        <header className={styles.head}>
          <h2>{t('sc.title')}</h2>
          <button type="button" className={styles.close} onClick={() => setUi({ overlay: undefined })} aria-label={t('common.close')}>
            <Icon name="close" />
          </button>
        </header>
        <div className={styles.keyGroups}>
          {groups.map((g) => (
            <section key={g}>
              <h3>{tDynamic(`sc.group.${g}`)}</h3>
              <dl className={styles.keys}>
                {all.filter((s) => s.group === g).map((s) => (
                  <div key={s.keys}>
                    <dt>
                      <kbd>{s.keys}</kbd>
                    </dt>
                    <dd>{s.action}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
        <p className={styles.help}>{t('sc.note')}</p>
      </div>
    </div>
  );
}

export function GameMenu() {
  const { ui, setUi, game } = useMatch();
  if (ui.overlay !== 'menu') return null;
  const canConcede = !game.result && !you(game).hasLost;
  return (
    <Popover title={t('menu.title')} onClose={() => setUi({ overlay: undefined })} className={styles.menu}>
      <button type="button" className={styles.menuItem} onClick={() => setUi({ overlay: 'display' })}>
        <Icon name="sliders" /> {t('menu.display')}
      </button>
      <button type="button" className={styles.menuItem} disabled title={t('menu.yieldTitle')}>
        <Icon name="hourglass" /> {t('menu.yield')}
      </button>
      <button
        type="button"
        className={`${styles.menuItem} ${styles.danger}`}
        disabled={!canConcede}
        title={canConcede ? undefined : t('menu.alreadyOut')}
        onClick={() => setUi({ overlay: 'concede' })}
      >
        <Icon name="close" /> {t('menu.concede')}
      </button>
    </Popover>
  );
}

export function LogDrawer() {
  const { game, ui, setUi } = useMatch();
  if (!ui.logOpen) return null;
  const turns = [...new Set(game.log.map((e) => e.turn))].sort((a, b) => b - a);
  return (
    <aside className={styles.drawer} aria-label={t('log.title')} {...{ [PREVIEW_BESIDE_ATTR]: '' }}>
      <header className={styles.head}>
        <h2>{t('log.title')}</h2>
        <button type="button" className={styles.close} onClick={() => setUi({ logOpen: false })} aria-label={t('log.close')}>
          <Icon name="close" />
        </button>
      </header>
      <div className={styles.logBody}>
        {turns.map((turn) => (
          <section key={turn}>
            <h3>{t('log.turn', { n: turn })}</h3>
            <ol className={styles.log}>
              {game.log
                .filter((e) => e.turn === turn)
                .reverse()
                .map((e) => (
                  <li key={e.id}>
                    {e.playerId ? (
                      <span className={styles.logSeat} title={player(game, e.playerId).name}>
                        <SeatGlyph seat={player(game, e.playerId).seat} />
                      </span>
                    ) : null}
                    <span>
                      <LogText text={e.text} />
                    </span>
                  </li>
                ))}
            </ol>
          </section>
        ))}
      </div>
    </aside>
  );
}

export function DevPanel() {
  const { ui, setUi, scenarioId, loadScenario } = useMatch();
  return (
    <>
      <button
        type="button"
        className={styles.devToggle}
        onClick={() => setUi((u) => ({ ...u, overlay: u.overlay === 'dev' ? undefined : 'dev' }))}
        aria-pressed={ui.overlay === 'dev'}
        title={t('dev.titleKey')}
      >
        {t('common.mock')}
      </button>
      {ui.overlay === 'dev' ? (
        <Popover title={t('dev.title')} onClose={() => setUi({ overlay: undefined })} className={styles.dev}>
          <div className={styles.scenarios}>
            {SCENARIOS.map((s) => (
              <button
                key={s.id}
                type="button"
                className={`${styles.scenario} ${s.id === scenarioId ? styles.scenarioOn : ''}`}
                onClick={() => loadScenario(s.id)}
                aria-pressed={s.id === scenarioId}
              >
                <b>{s.label}</b>
                <span>{s.description}</span>
              </button>
            ))}
          </div>
        </Popover>
      ) : null}
    </>
  );
}
