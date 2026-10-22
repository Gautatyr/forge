import type { PlayerView } from '../model/types';
import { turnPlayerId } from '../state/gameStart';
import { useMatch } from '../state/MatchContext';
import { Battlefield } from './Battlefield';
import { hiddenInCompact } from './battlefieldGroups';
import { PlayerPlate } from './PlayerPlate';
import styles from './Seat.module.css';
import { t } from '../i18n';

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
  const active = turnPlayerId(game) === player.id;
  const compact = density === 'compact';
  const side = orientation === 'side' && !compact;
  const hidden = hiddenInCompact(
    player.battlefield.map((id) => game.cards[id]!),
    game.cards,
  );

  return (
    <section
      className={`${styles.seat} ${side ? styles.side : ''} ${compact ? styles.compact : ''} ${player.isYou ? styles.you : ''} ${active ? styles.active : ''}`}
      aria-label={player.isYou ? t('seat.yours') : t('seat.theirs', { name: player.name })}
    >
      <div className={`${styles.plateCol} ${compact ? styles.compactCol : ''}`}>
        <PlayerPlate player={player} density={density} vertical={side} onExpand={onExpand} />
        {compact ? (
          <div className={styles.summary} data-arrow-occluder>
            <span>
              {t('seat.hidden', { count: hidden.others, lands: hidden.lands, untapped: hidden.untappedLands })}
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
