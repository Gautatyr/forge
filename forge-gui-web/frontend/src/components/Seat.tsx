import { isCreature, isLand } from '../model/selectors';
import type { PlayerView } from '../model/types';
import { useMatch } from '../state/MatchContext';
import { Battlefield } from './Battlefield';
import { PlayerPlate } from './PlayerPlate';
import styles from './Seat.module.css';

interface Props {
  player: PlayerView;
  /** full: plate + whole battlefield. compact: plate + creatures + summary. */
  density: 'full' | 'compact';
  /** side: plate as a column left of the battlefield. */
  orientation?: 'stacked' | 'side';
  onExpand?: () => void;
}

export function Seat({ player, density, orientation = 'stacked', onExpand }: Props) {
  const { game } = useMatch();
  const active = game.turn.activePlayerId === player.id;
  const compact = density === 'compact';
  const side = orientation === 'side' && !compact;
  const cards = player.battlefield.map((id) => game.cards[id]!);
  const lands = cards.filter((c) => isLand(c) && !isCreature(c));
  const others = cards.filter((c) => !isLand(c) && !isCreature(c));
  const untappedLands = lands.filter((c) => !c.tapped).length;

  return (
    <section
      className={`${styles.seat} ${side ? styles.side : ''} ${compact ? styles.compact : ''} ${player.isYou ? styles.you : ''} ${active ? styles.active : ''}`}
      aria-label={player.isYou ? 'Your side' : `${player.name}'s side`}
    >
      <div className={`${styles.plateCol} ${compact ? styles.compactCol : ''}`}>
        <PlayerPlate player={player} density={density} vertical={side} onExpand={onExpand} />
        {compact ? (
          <div className={styles.summary} data-arrow-occluder>
            <span>
              Hidden here: {others.length} other permanent{others.length === 1 ? '' : 's'}, {lands.length} lands ({untappedLands}{' '}
              untapped)
            </span>
          </div>
        ) : null}
      </div>
      <div className={styles.field}>
        <Battlefield player={player} rows={compact ? 'creatures' : 'all'} />
      </div>
    </section>
  );
}
