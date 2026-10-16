import type { CSSProperties } from 'react';
import { player, targetName } from '../model/selectors';
import { spotlightItem } from '../state/cardStatus';
import { useMatch } from '../state/MatchContext';
import { ActionPanel } from './ActionPanel';
import { Card } from './Card';
import { CombatPanel } from './CombatPanel';
import { HoverPreview } from './HoverPreview';
import { Icon, SeatGlyph } from './Icon';
import { LogText } from './LogText';
import { recentRows } from './recentRows';
import { zoneCardIds, zoneTitle } from './zoneBrowser';
import styles from './Rail.module.css';

/**
 * Right panel, full height and in the same place in every layout. Top: the
 * regions that come and go (stack when not empty, combat, an open zone), then
 * Recent, which takes the height left. Bottom: the action block, sized to its
 * content and anchored to the bottom edge, so its persistent controls never
 * move. Each region keeps its header in view and scrolls its own body, so an
 * open zone never pushes the log out of reach. The hover preview shows over
 * the regions, never over the board, the seats, the hand or the action block.
 */
export function Rail() {
  return (
    <aside className={styles.rail}>
      <div className={styles.upper}>
        <div className={styles.regions}>
          <StackPanel />
          <CombatPanel />
          <ZoneViewer />
          <RecentEvents />
        </div>
        <HoverPreview />
      </div>
      <ActionPanel />
    </aside>
  );
}

function StackPanel() {
  const { game, ui, setUi, send } = useMatch();
  if (game.stack.length === 0) return null;
  const items = [...game.stack].reverse();
  const spot = spotlightItem(game, ui);
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
      <p className={styles.hint}>Top resolves first; its targets are lit. Hover another item to see its targets.</p>
      <ol className={`${styles.body} ${styles.items}`} data-scroll-region>
        {items.map((item, i) => {
          const src = game.cards[item.sourceCardId];
          const ctrl = player(game, item.controllerId);
          const yieldKey = src?.name ?? item.text;
          const yielding = game.autoYieldTo.includes(yieldKey);
          return (
            <li
              key={item.id}
              className={`${styles.item} ${spot?.id === item.id ? styles.itemSpot : ''}`}
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
  if (!z || z.large) return null;
  const ids = zoneCardIds(game, z.playerId, z.zone);
  const title = zoneTitle(game, z.playerId, z.zone);
  return (
    <section className={`${styles.block} ${styles.zone}`} aria-label={title}>
      <header className={styles.head}>
        <h2>
          {title} <span className={styles.count}>{ids.length}</span>
        </h2>
        <span className={styles.headTools}>
          <button
            type="button"
            className={styles.close}
            onClick={() => setUi({ zoneView: { ...z, large: true } })}
            aria-label={`Large view of ${title.toLowerCase()}`}
            title="Large view: search it by name or type"
          >
            <Icon name="expand" />
          </button>
          <button type="button" className={styles.close} onClick={() => setUi({ zoneView: undefined })} aria-label="Close">
            <Icon name="close" />
          </button>
        </span>
      </header>
      {ids.length === 0 ? <p className={styles.hint}>Nothing here yet.</p> : null}
      <div className={`${styles.body} ${styles.zoneGrid}`} data-scroll-region>
        {ids.map((id) => {
          const c = game.cards[id];
          return c ? <Card key={id} card={c} context="thumb" style={{ '--cw': '7.3rem' } as CSSProperties} /> : null;
        })}
      </div>
    </section>
  );
}

/** Newest first; older ones scroll. The drawer (L) has the whole game. */
const RECENT_EVENTS = 20;

function RecentEvents() {
  const { game, setUi } = useMatch();
  const rows = recentRows(game, RECENT_EVENTS);
  return (
    <section className={`${styles.block} ${styles.recent}`} aria-label="Recent events">
      <header className={styles.head}>
        <h2>Recent</h2>
        <button type="button" className={styles.link} onClick={() => setUi({ logOpen: true })}>
          Full log <kbd>L</kbd>
        </button>
      </header>
      <ol className={`${styles.body} ${styles.events}`} data-scroll-region>
        {rows.map((r) =>
          r.kind === 'divider' ? (
            <li key={r.key} className={styles.turnDivider}>
              <span className={styles.turnLabel}>
                {r.seat !== undefined ? <SeatGlyph seat={r.seat} /> : null}
                {r.label}
              </span>
            </li>
          ) : (
            <li key={r.key} className={r.bold ? styles.eventLoss : undefined}>
              {r.entry.playerId ? (
                <span className={styles.eventSeat}>
                  <SeatGlyph seat={player(game, r.entry.playerId).seat} />
                </span>
              ) : null}
              <span>
                <LogText text={r.entry.text} />
              </span>
            </li>
          ),
        )}
      </ol>
    </section>
  );
}
