import type { CSSProperties } from 'react';
import { opponents, you } from '../model/selectors';
import { focusedOpponent } from '../state/focus';
import { useMatch } from '../state/MatchContext';
import { Seat } from './Seat';
import styles from './Board.module.css';

/**
 * Opponents plus your own seat. Three opponent arrangements for multiplayer
 * (see docs/fork/design/mockup-notes.md); 1v1 always uses one wide seat.
 */
export function Board() {
  const { game, ui, setUi, prefs } = useMatch();
  const opps = opponents(game);
  const me = you(game);
  const duel = opps.length === 1;
  const layout = duel ? 'duel' : opps.length === 3 || prefs.layout !== 'table' ? prefs.layout : 'columns';
  // Multiplayer split between opponents and you (Display options); 1v1 stays even.
  const split: CSSProperties = {
    gridTemplateRows: `minmax(0, ${prefs.opponentShare}fr) minmax(0, ${100 - prefs.opponentShare}fr)`,
  };

  // In the table layout your seat is narrow, so its plate goes on top.
  const mine = (
    <div className={styles.me}>
      <Seat player={me} density="full" orientation={layout === 'table' ? 'stacked' : 'side'} />
    </div>
  );

  if (layout === 'duel') {
    return (
      <div className={`${styles.board} ${styles.duel}`}>
        <div className={styles.opps}>
          <Seat player={opps[0]!} density="full" orientation="side" />
        </div>
        {mine}
      </div>
    );
  }

  if (layout === 'table') {
    const [left, top, right] = opps;
    return (
      <div className={`${styles.board} ${styles.table}`} style={split}>
        <div className={styles.left}>{left ? <Seat player={left} density="full" /> : null}</div>
        <div className={styles.top}>{top ? <Seat player={top} density="full" /> : null}</div>
        <div className={styles.right}>{right ? <Seat player={right} density="full" /> : null}</div>
        {mine}
      </div>
    );
  }

  if (layout === 'focus') {
    const focusedId = focusedOpponent(game, ui);
    const focused = opps.find((p) => p.id === focusedId) ?? opps[0]!;
    const rest = opps.filter((p) => p.id !== focused.id);
    return (
      <div className={`${styles.board} ${styles.focus}`} style={split}>
        <div className={styles.opps}>
          <Seat player={focused} density="full" />
          <div className={styles.compactCol}>
            {rest.map((p) => (
              <Seat key={p.id} player={p} density="compact" onExpand={() => setUi({ focusOpponentId: p.id })} />
            ))}
          </div>
        </div>
        {mine}
      </div>
    );
  }

  return (
    <div className={`${styles.board} ${styles.columns}`} style={split}>
      <div className={styles.opps} style={{ gridTemplateColumns: `repeat(${opps.length}, minmax(0, 1fr))` }}>
        {opps.map((p) => (
          <Seat key={p.id} player={p} density="full" />
        ))}
      </div>
      {mine}
    </div>
  );
}
