import type { CSSProperties } from 'react';
import { player, targetName } from '../model/selectors';
import { useMatch } from '../state/MatchContext';
import { Card } from './Card';
import { CombatPanel } from './CombatPanel';
import { Icon, SeatGlyph } from './Icon';
import { LogText } from './LogText';
import styles from './Rail.module.css';

/** Right column: the stack (only when not empty), an open zone, recent events. */
export function Rail() {
  return (
    <aside className={styles.rail}>
      <StackPanel />
      <CombatPanel />
      <ZoneViewer />
      <RecentEvents />
    </aside>
  );
}

function StackPanel() {
  const { game, ui, setUi, send } = useMatch();
  if (game.stack.length === 0) return null;
  const items = [...game.stack].reverse();
  return (
    <section className={`${styles.block} ${styles.stack}`} aria-label="The stack">
      <header className={styles.head}>
        <h2>
          Stack <span className={styles.count}>{game.stack.length}</span>
        </h2>
        <label className={styles.inlineToggle} title="Honour the auto-yields you set on stack items. Off by default.">
          <input type="checkbox" checked={game.autoYield} onChange={(e) => send({ type: 'setAutoYield', on: e.target.checked })} />
          Auto-yield {game.autoYield ? 'on' : 'off'}
        </label>
      </header>
      <p className={styles.hint}>Top resolves first. Hover an item to light its targets.</p>
      <ol className={styles.items}>
        {items.map((item, i) => {
          const src = game.cards[item.sourceCardId];
          const ctrl = player(game, item.controllerId);
          const yieldKey = src?.name ?? item.text;
          const yielding = game.autoYieldTo.includes(yieldKey);
          return (
            <li
              key={item.id}
              className={`${styles.item} ${ui.hoveredStackItem === item.id ? styles.itemHover : ''}`}
              onPointerEnter={() => setUi({ hoveredStackItem: item.id })}
              onPointerLeave={() => setUi({ hoveredStackItem: undefined })}
              data-stack-id={item.id}
            >
              <span className={styles.order}>{i === 0 ? 'Top' : i + 1}</span>
              {src ? <Card card={src} context="thumb" style={{ '--cw': '3.6rem' } as CSSProperties} /> : null}
              <div className={styles.itemText}>
                <span className={styles.itemName}>
                  {src?.name}
                  {item.kind !== 'spell' ? <em> · {item.kind}</em> : null}
                </span>
                <span className={styles.by}>
                  <SeatGlyph seat={ctrl.seat} />
                  {ctrl.isYou ? 'You' : ctrl.name}
                </span>
                {item.targets.map((t) => (
                  <span key={t.id} className={styles.targetLine}>
                    <Icon name="target" />
                    {targetName(game, t)}
                    {t.kind === 'card' && game.cards[t.id]?.controllerId === game.youId ? ' (yours)' : ''}
                  </span>
                ))}
                {!ctrl.isYou ? (
                  <button
                    type="button"
                    className={`${styles.yield} ${yielding ? styles.yieldOn : ''}`}
                    aria-pressed={yielding}
                    onClick={() => send({ type: 'toggleAutoYieldTo', key: yieldKey })}
                    title="Always pass priority when this appears (needs Auto-yield on)"
                  >
                    {yielding ? 'Always yield: on' : 'Always yield to this'}
                  </button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function ZoneViewer() {
  const { game, ui, setUi } = useMatch();
  const z = ui.zoneView;
  if (!z) return null;
  const p = player(game, z.playerId);
  const ids = z.zone === 'graveyard' ? p.graveyard : z.zone === 'exile' ? p.exile : p.command;
  const title = `${p.isYou ? 'Your' : `${p.name}'s`} ${z.zone}`;
  return (
    <section className={`${styles.block} ${styles.zone}`} aria-label={title}>
      <header className={styles.head}>
        <h2>
          {title} <span className={styles.count}>{ids.length}</span>
        </h2>
        <button type="button" className={styles.close} onClick={() => setUi({ zoneView: undefined })} aria-label="Close">
          <Icon name="close" />
        </button>
      </header>
      {ids.length === 0 ? <p className={styles.hint}>Nothing here yet.</p> : null}
      <div className={styles.zoneGrid}>
        {[...ids].reverse().map((id) => {
          const c = game.cards[id];
          return c ? <Card key={id} card={c} context="thumb" style={{ '--cw': '7.3rem' } as CSSProperties} /> : null;
        })}
      </div>
    </section>
  );
}

function RecentEvents() {
  const { game, setUi } = useMatch();
  const recent = game.log.slice(-5).reverse();
  return (
    <section className={`${styles.block} ${styles.recent}`} aria-label="Recent events">
      <header className={styles.head}>
        <h2>Recent</h2>
        <button type="button" className={styles.link} onClick={() => setUi({ logOpen: true })}>
          Full log <kbd>L</kbd>
        </button>
      </header>
      <ol className={styles.events}>
        {recent.map((e) => (
          <li key={e.id}>
            {e.playerId ? (
              <span className={styles.eventSeat}>
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
  );
}
