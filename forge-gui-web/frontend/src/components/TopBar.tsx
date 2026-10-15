import { player } from '../model/selectors';
import { useMatch } from '../state/MatchContext';
import type { Overlay } from '../state/ui';
import { Icon, SeatGlyph, type IconName } from './Icon';
import { PhaseTrack } from './PhaseTrack';
import styles from './TopBar.module.css';

export function TopBar() {
  const { game, ui, setUi } = useMatch();
  const active = player(game, game.turn.activePlayerId);
  const toggle = (o: Overlay) => setUi((u) => ({ ...u, overlay: u.overlay === o ? undefined : o }));

  const tool = (icon: IconName, label: string, key: string, pressed: boolean, onClick: () => void) => (
    <button type="button" className={styles.tool} aria-pressed={pressed} onClick={onClick} title={`${label} (${key})`}>
      <Icon name={icon} />
      <span>{label}</span>
      <kbd>{key}</kbd>
    </button>
  );

  return (
    <header className={styles.bar}>
      <div className={styles.turn}>
        <span className={styles.turnNo}>Turn {game.turn.number}</span>
        <span className={styles.whose}>
          <SeatGlyph seat={active.seat} />
          {active.isYou ? 'Your turn' : `${active.name}'s turn`}
        </span>
      </div>
      <PhaseTrack />
      <div className={styles.tools}>
        {tool('log', 'Log', 'L', ui.logOpen, () => setUi((u) => ({ ...u, logOpen: !u.logOpen })))}
        {tool('sliders', 'Display', 'D', ui.overlay === 'display', () => toggle('display'))}
        {tool('keyboard', 'Keys', '?', ui.overlay === 'shortcuts', () => toggle('shortcuts'))}
        <button
          type="button"
          className={styles.tool}
          aria-pressed={ui.overlay === 'menu'}
          onClick={() => toggle('menu')}
          title="Game menu: concede, settings"
        >
          <Icon name="menu" />
          <span>Game</span>
        </button>
      </div>
    </header>
  );
}
