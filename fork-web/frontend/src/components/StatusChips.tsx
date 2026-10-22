import { useMatch } from '../state/MatchContext';
import type { PlayerView } from '../model/types';
import { Icon } from './Icon';
import styles from './PlayerPlate.module.css';
import { statusChips } from './statusChips';

/**
 * Effects in force for a player (the Monarch, emblems, engine effect cards) and cards attached to them (a Curse),
 * as chips in their plate: hover shows the card, click inspects it. They are state, never cards you cast, so they
 * are not in the group beside the hand.
 */
export function StatusChips({ player }: { player: PlayerView }) {
  const { game, setUi } = useMatch();
  const chips = statusChips(player, game);
  const show = (cardId: string) => setUi((u) => (u.hover?.cardId === cardId ? u : { ...u, hover: { cardId } }));
  const hide = (cardId: string) => setUi((u) => (u.hover?.cardId === cardId ? { ...u, hover: undefined } : u));
  const inspect = (cardId: string) => setUi({ inspectId: cardId, hover: undefined });
  return (
    <>
      {chips.map((x) => (
        <button
          key={x.key}
          type="button"
          className={`${styles.zone} ${styles.zoneButton} ${styles.statusChip}`}
          data-status-chip={x.cardId}
          title={x.title}
          aria-label={`${x.title} Hover to see it, click to inspect.`}
          onPointerEnter={() => show(x.cardId)}
          onPointerLeave={() => hide(x.cardId)}
          onFocus={() => show(x.cardId)}
          onBlur={() => hide(x.cardId)}
          onClick={(e) => {
            e.stopPropagation();
            inspect(x.cardId);
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            inspect(x.cardId);
          }}
        >
          <Icon name={x.kind === 'effect' ? 'effect' : 'aura'} />
          <span className={`${styles.zoneLabel} ${styles.statusName}`}>{x.name}</span>
          {x.count > 1 ? <span className={styles.zoneCount}>×{x.count}</span> : null}
        </button>
      ))}
    </>
  );
}
