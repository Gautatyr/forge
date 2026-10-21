import { useState, type CSSProperties } from 'react';
import { useMatch } from '../state/MatchContext';
import { Card } from './Card';
import { Icon } from './Icon';
import { zoneBrowserCards, zoneCardIds, zoneTitle } from './zoneBrowser';
import styles from './ZoneBrowser.module.css';

/**
 * A graveyard or exile at a large size, over the board (playtest 1): search it by name or type.
 * Opened from the side panel's zone view; Esc or × closes it, "Side panel" puts it back there.
 */
export function ZoneBrowser() {
  const { ui } = useMatch();
  const z = ui.zoneView;
  if (!z?.large) return null;
  // A new zone starts with an empty filter.
  return <Browser key={`${z.playerId}|${z.zone}`} />;
}

function Browser() {
  const { game, ui, setUi } = useMatch();
  const z = ui.zoneView!;
  const [query, setQuery] = useState('');
  const title = zoneTitle(game, z.playerId, z.zone);
  const total = zoneCardIds(game, z.playerId, z.zone).length;
  const ids = zoneBrowserCards(game, z.playerId, z.zone, query);
  return (
    <section className={styles.browser} role="dialog" aria-modal="false" aria-label={title}>
      <header className={styles.head}>
        <h2>
          {title} <span className={styles.count}>{query.trim() ? `${ids.length} of ${total}` : total}</span>
        </h2>
        <input
          type="search"
          className={styles.filter}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter by name or type"
          aria-label="Filter by name or type"
          autoFocus
        />
        <button type="button" className={styles.ghost} onClick={() => setUi({ zoneView: { playerId: z.playerId, zone: z.zone } })}>
          <Icon name="shrink" />
          Side panel
        </button>
        <button type="button" className={styles.close} onClick={() => setUi({ zoneView: undefined })} aria-label="Close" title="Close (Esc)">
          <Icon name="close" />
        </button>
      </header>
      {ids.length === 0 ? <p className={styles.empty}>{total === 0 ? 'Nothing here yet.' : 'No card matches.'}</p> : null}
      <div className={styles.grid} data-scroll-region>
        {ids.map((id) => {
          const c = game.cards[id];
          return c ? <Card key={id} card={c} context="thumb" style={{ '--cw': 'var(--zone-cw)' } as CSSProperties} /> : null;
        })}
      </div>
    </section>
  );
}
