import { useEffect, useEffectEvent, useRef, useState, type ReactNode } from 'react';
import { player } from '../model/selectors';
import { SCENARIOS } from '../mock/scenarios';
import { SHORTCUTS } from '../state/keymap';
import { useMatch } from '../state/MatchContext';
import { OPPONENT_SHARES, type OpponentLayout, type OpponentShare } from '../state/prefs';
import { Icon, SeatGlyph } from './Icon';
import { LogText } from './LogText';
import styles from './Overlays.module.css';

function Popover({ title, onClose, children, className }: { title: string; onClose: () => void; children: ReactNode; className?: string }) {
  return (
    <div className={`${styles.popover} ${className ?? ''}`} role="dialog" aria-label={title}>
      <header className={styles.head}>
        <h2>{title}</h2>
        <button type="button" className={styles.close} onClick={onClose} aria-label="Close">
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
    <Popover title="Display" onClose={() => setUi({ overlay: undefined })} className={styles.display}>
      <div className={styles.field}>
        <span className={styles.fieldLabel}>Opponents layout {multiplayer ? '' : '(multiplayer only)'}</span>
        <Segmented<OpponentLayout>
          label="Opponents layout"
          value={prefs.layout}
          onChange={(layout) => setPrefs({ layout })}
          options={[
            ['columns', 'Columns'],
            ['table', 'Table'],
            ['focus', 'Focus'],
          ]}
        />
        <span className={styles.help}>
          {prefs.layout === 'columns'
            ? 'All opponents side by side across the top, same size.'
            : prefs.layout === 'table'
              ? 'Seats around you in turn order: next player on your left.'
              : 'One opponent large, the others compact. Click “Show board” on a small seat to switch.'}
        </span>
      </div>
      <div className={styles.field}>
        <span className={styles.fieldLabel}>Board height for opponents {multiplayer ? '' : '(multiplayer only)'}</span>
        <Segmented<string>
          label="Board split"
          value={String(prefs.opponentShare)}
          onChange={(v) => setPrefs({ opponentShare: Number(v) as OpponentShare })}
          options={OPPONENT_SHARES.map((n) => [String(n), `${n}%`])}
        />
        <span className={styles.help}>
          Opponents {prefs.opponentShare}%, you {100 - prefs.opponentShare}%. Default 45%.
        </span>
      </div>
      <label className={styles.check}>
        <input type="checkbox" checked={prefs.nameLabels} onChange={(e) => setPrefs({ nameLabels: e.target.checked })} />
        Name labels on small cards
      </label>
      <label className={styles.check}>
        <input type="checkbox" checked={prefs.groupLands} onChange={(e) => setPrefs({ groupLands: e.target.checked })} />
        Group identical lands
      </label>
      <label className={styles.check}>
        <input type="checkbox" checked={prefs.groupTokens} onChange={(e) => setPrefs({ groupTokens: e.target.checked })} />
        Group identical tokens
      </label>
      <ScaleSlider value={prefs.uiScale} onCommit={(uiScale) => setPrefs({ uiScale })} />
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
        Interface scale <b>{Math.round(shown * 100)}%</b>
        {pending ? <span className={styles.help}> · release to apply</span> : null}
      </span>
      <input
        ref={ref}
        type="range"
        min={75}
        max={200}
        step={5}
        value={Math.round(shown * 100)}
        onChange={(e) => setDraft(Number(e.target.value) / 100)}
        aria-label="Interface scale"
        aria-valuetext={`${Math.round(shown * 100)}%`}
      />
    </div>
  );
}

export function ShortcutsOverlay() {
  const { ui, setUi } = useMatch();
  if (ui.overlay !== 'shortcuts') return null;
  const groups = ['Play', 'Look', 'Screen'] as const;
  return (
    <div className={styles.scrim} onClick={() => setUi({ overlay: undefined })}>
      <div className={styles.sheet} role="dialog" aria-label="Keyboard shortcuts" onClick={(e) => e.stopPropagation()}>
        <header className={styles.head}>
          <h2>Keyboard shortcuts</h2>
          <button type="button" className={styles.close} onClick={() => setUi({ overlay: undefined })} aria-label="Close">
            <Icon name="close" />
          </button>
        </header>
        <div className={styles.keyGroups}>
          {groups.map((g) => (
            <section key={g}>
              <h3>{g}</h3>
              <dl className={styles.keys}>
                {SHORTCUTS.filter((s) => s.group === g).map((s) => (
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
        <p className={styles.help}>Every shortcut also has a visible button. Keys will be rebindable in settings.</p>
      </div>
    </div>
  );
}

export function GameMenu() {
  const { ui, setUi } = useMatch();
  if (ui.overlay !== 'menu') return null;
  return (
    <Popover title="Game" onClose={() => setUi({ overlay: undefined })} className={styles.menu}>
      <button type="button" className={styles.menuItem} onClick={() => setUi({ overlay: 'display' })}>
        <Icon name="sliders" /> Display options
      </button>
      <button type="button" className={styles.menuItem} disabled title="Opens Forge's Yield Settings window (Swing) in the real app">
        <Icon name="hourglass" /> Yield and stop settings…
      </button>
      <button type="button" className={`${styles.menuItem} ${styles.danger}`} disabled title="Not wired in the mockup">
        <Icon name="close" /> Concede this game
      </button>
    </Popover>
  );
}

export function LogDrawer() {
  const { game, ui, setUi } = useMatch();
  if (!ui.logOpen) return null;
  const turns = [...new Set(game.log.map((e) => e.turn))].sort((a, b) => b - a);
  return (
    <aside className={styles.drawer} aria-label="Game log">
      <header className={styles.head}>
        <h2>Game log</h2>
        <button type="button" className={styles.close} onClick={() => setUi({ logOpen: false })} aria-label="Close log">
          <Icon name="close" />
        </button>
      </header>
      <div className={styles.logBody}>
        {turns.map((t) => (
          <section key={t}>
            <h3>Turn {t}</h3>
            <ol className={styles.log}>
              {game.log
                .filter((e) => e.turn === t)
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
        title="Mock scenarios (`)"
      >
        Mock
      </button>
      {ui.overlay === 'dev' ? (
        <Popover title="Mock scenarios" onClose={() => setUi({ overlay: undefined })} className={styles.dev}>
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
