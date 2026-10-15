import { opponents, you } from '../model/selectors';
import { useMatch } from '../state/MatchContext';
import { Seat } from './Seat';
import styles from './Board.module.css';

/**
 * Opponents plus your own seat. Three opponent arrangements for multiplayer
 * (see docs/fork/design/mockup-notes.md); 1v1 always uses one wide seat.
 */
export function Board() {
  const { game, prefs, setPrefs } = useMatch();
  const opps = opponents(game);
  const me = you(game);
  const duel = opps.length === 1;
  const layout = duel ? 'duel' : opps.length === 3 || prefs.layout !== 'table' ? prefs.layout : 'columns';

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
      <div className={`${styles.board} ${styles.table}`}>
        <div className={styles.left}>{left ? <Seat player={left} density="full" /> : null}</div>
        <div className={styles.top}>{top ? <Seat player={top} density="full" /> : null}</div>
        <div className={styles.right}>{right ? <Seat player={right} density="full" /> : null}</div>
        {mine}
      </div>
    );
  }

  if (layout === 'focus') {
    const attacking = game.combat?.attacks[0] ? game.cards[game.combat.attacks[0].attackerId]?.controllerId : undefined;
    const active = opps.find((p) => p.id === game.turn.activePlayerId)?.id;
    const focusedId = prefs.focusedOpponentId ?? attacking ?? active ?? opps[0]!.id;
    const focused = opps.find((p) => p.id === focusedId) ?? opps[0]!;
    const rest = opps.filter((p) => p.id !== focused.id);
    return (
      <div className={`${styles.board} ${styles.focus}`}>
        <div className={styles.opps}>
          <Seat player={focused} density="full" />
          <div className={styles.compactCol}>
            {rest.map((p) => (
              <Seat key={p.id} player={p} density="compact" onExpand={() => setPrefs({ focusedOpponentId: p.id })} />
            ))}
          </div>
        </div>
        {mine}
      </div>
    );
  }

  return (
    <div className={`${styles.board} ${styles.columns}`}>
      <div className={styles.opps} style={{ gridTemplateColumns: `repeat(${opps.length}, minmax(0, 1fr))` }}>
        {opps.map((p) => (
          <Seat key={p.id} player={p} density="full" />
        ))}
      </div>
      {mine}
    </div>
  );
}
