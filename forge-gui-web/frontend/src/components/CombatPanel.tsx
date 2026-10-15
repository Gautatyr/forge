import { player } from '../model/selectors';
import { useMatch } from '../state/MatchContext';
import { Icon, SeatGlyph } from './Icon';
import styles from './CombatPanel.module.css';

/**
 * Rail block shown only during combat: who attacks whom, your blocks, and
 * (while you attack) which opponent new attackers go at.
 */
export function CombatPanel() {
  const { game, ui, setUi, send } = useMatch();
  const d = game.decision;
  const attacks = d.kind === 'declareAttackers' ? d.draft : (game.combat?.attacks ?? []);
  const blocks = d.kind === 'declareBlockers' ? d.draft : (game.combat?.blocks ?? []);
  if (d.kind !== 'declareAttackers' && !game.combat) return null;

  if (d.kind === 'declareAttackers') {
    const current = ui.attackDefender ?? d.defenders[0];
    return (
      <section className={`${styles.panel} ${styles.attack}`} aria-label="Declare attackers">
        <h2>
          <Icon name="sword" /> Declare attackers
        </h2>
        <p className={styles.hint}>Click your creatures to attack. New attackers go at:</p>
        <div className={styles.defenders} role="radiogroup" aria-label="Player to attack" data-scroll-region>
          {d.defenders.map((id) => {
            const p = player(game, id);
            const n = attacks.filter((a) => a.defenderId === id).length;
            const on = current === id;
            return (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={on}
                className={`${styles.defender} ${on ? styles.on : ''}`}
                onClick={() => setUi({ attackDefender: id, focusOpponentId: id })}
              >
                {on ? <Icon name="check" /> : <SeatGlyph seat={p.seat} />}
                {p.name}
                <span className={styles.life}>{p.life}</span>
                {n > 0 ? (
                  <b>
                    <Icon name="sword" />
                    {n}
                  </b>
                ) : null}
              </button>
            );
          })}
        </div>
      </section>
    );
  }

  const pendingBlocker = ui.pendingBlocker ? game.cards[ui.pendingBlocker] : undefined;
  const pendingAttacker = ui.pendingAttacker ? game.cards[ui.pendingAttacker] : undefined;
  return (
    <section className={`${styles.panel} ${d.kind === 'declareBlockers' ? styles.block : styles.attack}`} aria-label="Combat">
      <h2>
        <Icon name={d.kind === 'declareBlockers' ? 'shield' : 'sword'} /> {d.kind === 'declareBlockers' ? 'Declare blockers' : 'Combat'}
      </h2>
      {pendingBlocker ? (
        <p className={styles.pending}>
          <Icon name="check" /> {pendingBlocker.name}: now click the attacker it blocks.
        </p>
      ) : pendingAttacker ? (
        <p className={styles.pending}>
          <Icon name="check" /> {pendingAttacker.name}: now click your creature that blocks it.
        </p>
      ) : null}
      <ul className={styles.list} data-scroll-region>
        {attacks.map((a) => {
          const att = game.cards[a.attackerId];
          const def = player(game, a.defenderId);
          const blockers = blocks.filter((b) => b.attackerId === a.attackerId);
          return (
            <li key={a.attackerId} className={def.isYou ? styles.atYou : ''}>
              <span className={styles.attacker}>
                <Icon name="sword" />
                <b>{att?.name}</b>
                <span className={styles.pt}>
                  {att?.power}/{att?.toughness}
                </span>
                <Icon name="arrowRight" />
                {def.isYou ? 'you' : def.name}
              </span>
              {blockers.map((b) => (
                <span key={b.blockerId} className={styles.blocker}>
                  <Icon name="shield" />
                  {game.cards[b.blockerId]?.name}
                  {d.kind === 'declareBlockers' ? (
                    <button
                      type="button"
                      className={styles.remove}
                      aria-label={`Remove block by ${game.cards[b.blockerId]?.name}`}
                      onClick={() => send({ type: 'removeBlock', blockerId: b.blockerId })}
                    >
                      <Icon name="close" />
                    </button>
                  ) : null}
                </span>
              ))}
              {def.isYou && blockers.length === 0 && d.kind === 'declareBlockers' ? (
                <span className={styles.unblocked}>Unblocked: {att?.power ?? 0} damage to you</span>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
