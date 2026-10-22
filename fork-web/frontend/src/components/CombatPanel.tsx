import { defendingPlayerOf, player } from '../model/selectors';
import type { Attack, CardView } from '../model/types';
import { strikeDamage } from '../state/combatForecast';
import { currentAttackAim, pickDefender } from '../state/focus';
import { useMatch } from '../state/MatchContext';
import { Icon, SeatGlyph } from './Icon';
import styles from './CombatPanel.module.css';
import { t } from '../i18n';

/** Current loyalty (planeswalker) or defense (battle): what an attack on it takes away. */
function defense(c: CardView): number | undefined {
  return c.counters.find((k) => k.kind === 'Loyalty' || k.kind === 'Defense')?.count;
}

/**
 * Rail block shown only during combat: who attacks whom, your blocks, and
 * (while you attack) which opponent, planeswalker or battle new attackers go at.
 */
export function CombatPanel() {
  const { game, ui, prefs, setUi, send } = useMatch();
  const d = game.decision;
  const attacks = d.kind === 'declareAttackers' ? d.draft : (game.combat?.attacks ?? []);
  const blocks = d.kind === 'declareBlockers' ? d.draft : (game.combat?.blocks ?? []);
  // Once the game is decided, combat is over: its last attackers are not a live list.
  if (game.result || (d.kind !== 'declareAttackers' && !game.combat)) return null;

  if (d.kind === 'declareAttackers') {
    const aim = currentAttackAim(game, ui, prefs.layout);
    const atPlayer = (id: string) => (a: Attack) => a.defenderId === id && !a.defenderCardId;
    return (
      <section className={`${styles.panel} ${styles.attack}`} aria-label={t('combat.declareAtk')}>
        <h2>
          <Icon name="sword" /> {t('combat.declareAtk')}
        </h2>
        <p className={styles.hint}>{t('combat.atkHint')}</p>
        <div className={styles.defenders} role="radiogroup" aria-label={t('combat.whatToAttack')} data-scroll-region>
          {d.defenders.map((id) => {
            const p = player(game, id);
            const n = attacks.filter(atPlayer(id)).length;
            const on = aim?.defenderId === id && !aim.defenderCardId;
            return (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={on}
                className={`${styles.defender} ${on ? styles.on : ''}`}
                onClick={() => setUi(pickDefender(game, { kind: 'player', id }))}
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
          {d.defenderCards.map((id) => {
            const c = game.cards[id];
            if (!c) return null;
            const p = player(game, defendingPlayerOf(c));
            const n = attacks.filter((a) => a.defenderCardId === id).length;
            const on = aim?.defenderCardId === id;
            const left = defense(c);
            return (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={on}
                className={`${styles.defender} ${on ? styles.on : ''}`}
                title={`${c.name} (${p.name})`}
                onClick={() => setUi(pickDefender(game, { kind: 'card', id }))}
              >
                {on ? <Icon name="check" /> : <SeatGlyph seat={p.seat} />}
                {c.name}
                {left !== undefined ? <span className={styles.life}>{left}</span> : null}
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
    <section className={`${styles.panel} ${d.kind === 'declareBlockers' ? styles.block : styles.attack}`} aria-label={t('combat.title')}>
      <h2>
        <Icon name={d.kind === 'declareBlockers' ? 'shield' : 'sword'} /> {d.kind === 'declareBlockers' ? t('combat.declareBlk') : t('combat.title')}
      </h2>
      {pendingBlocker ? (
        <p className={styles.pending}>
          <Icon name="check" /> {t('combat.pendingBlocker', { name: pendingBlocker.name })}
          {blocks.some((b) => b.blockerId === ui.pendingBlocker) ? t('combat.dropBlock') : '.'}
        </p>
      ) : pendingAttacker ? (
        <p className={styles.pending}>
          <Icon name="check" /> {t('combat.pendingAttacker', { name: pendingAttacker.name })}
        </p>
      ) : null}
      <ul className={styles.list} data-scroll-region>
        {attacks.map((a) => {
          const att = game.cards[a.attackerId];
          const def = player(game, a.defenderId);
          // An attack on a planeswalker or battle names it (issue #65); a battle you protect is not yours (issue #75).
          const walker = a.defenderCardId ? game.cards[a.defenderCardId] : undefined;
          const yours = walker?.controllerId === game.youId;
          const target = walker
            ? def.isYou ? (yours ? t('combat.yourWalker', { name: walker.name }) : t('combat.protect', { name: walker.name })) : walker.name
            : def.isYou ? t('combat.you') : def.name;
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
                {target}
              </span>
              {blockers.map((b) => (
                <span key={b.blockerId} className={styles.blocker}>
                  <Icon name="shield" />
                  {game.cards[b.blockerId]?.name}
                  {d.kind === 'declareBlockers' ? (
                    <button
                      type="button"
                      className={styles.remove}
                      aria-label={t('combat.removeBlock', { name: game.cards[b.blockerId]?.name ?? '' })}
                      onClick={() => send({ type: 'removeBlock', blockerId: b.blockerId, attackerId: b.attackerId })}
                    >
                      <Icon name="close" />
                    </button>
                  ) : null}
                </span>
              ))}
              {def.isYou && blockers.length === 0 && d.kind === 'declareBlockers' ? (
                <span className={styles.unblocked}>
                  {t('combat.unblocked', { damage: strikeDamage(att), target })}
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
