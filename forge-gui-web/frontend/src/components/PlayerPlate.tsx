import { poolEntries } from '../model/mana';
import { commanderTax } from '../model/selectors';
import type { PlayerView } from '../model/types';
import { playerTargetSpot, spotlightItem } from '../state/cardStatus';
import { currentDefender } from '../state/focus';
import { useMatch } from '../state/MatchContext';
import { playerChoice } from './tray/inPlace';
import { useInPlacePick } from './tray/useInPlacePick';
import type { ViewableZone } from '../state/ui';
import { commanderChips, COMMANDER_LETHAL } from './commanderChips';
import { Icon, SeatGlyph, type IconName } from './Icon';
import { useLifeChange } from './lifeMarker';
import { ManaSymbol, manaName } from './ManaSymbol';
import styles from './PlayerPlate.module.css';

interface Props {
  player: PlayerView;
  density: 'full' | 'compact';
  /** Life on top, details below: used when the plate sits left of the battlefield. */
  vertical?: boolean;
  /** Focus layout, compact seats: expand this opponent. Lives in the name row so a short seat never clips it. */
  onExpand?: () => void;
}

export function PlayerPlate({ player: p, density, vertical = false, onExpand }: Props) {
  const { game, ui, prefs, setUi, activatePlayer } = useMatch();
  const d = game.decision;
  const active = game.turn.activePlayerId === p.id;
  const priority = game.turn.priorityPlayerId === p.id;
  const legalTarget = d.kind === 'chooseTargets' && d.legal.some((t) => t.kind === 'player' && t.id === p.id);
  const chosenTarget = d.kind === 'chooseTargets' && d.chosen.some((t) => t.kind === 'player' && t.id === p.id);
  const defenderPick = d.kind === 'declareAttackers' && d.defenders.includes(p.id);
  const isDefender = defenderPick && currentDefender(game, ui, prefs.layout) === p.id;
  const incoming = game.combat?.attacks.filter((a) => a.defenderId === p.id).length ?? 0;
  const draftIncoming = d.kind === 'declareAttackers' ? d.draft.filter((a) => a.defenderId === p.id).length : 0;
  const pickInPlace = useInPlacePick();
  const choice = playerChoice(game, ui, p.id);
  const clickable = legalTarget || defenderPick || choice !== undefined;
  const onActivate = () => (choice ? pickInPlace({ kind: 'player', id: p.id }) : activatePlayer(p.id));
  const stackSpot = playerTargetSpot(game, ui, p.id);
  const spotSource = stackSpot ? game.cards[spotlightItem(game, ui)?.sourceCardId ?? '']?.name : undefined;

  const zoneChip = (zone: ViewableZone | 'hand' | 'library', icon: IconName, label: string, n: number) => {
    const viewable = zone === 'graveyard' || zone === 'exile';
    const open = ui.zoneView?.playerId === p.id && ui.zoneView.zone === zone;
    const content = (
      <>
        <Icon name={icon} />
        <span className={styles.zoneLabel}>{label}</span>
        <span className={styles.zoneCount}>{n}</span>
      </>
    );
    return viewable ? (
      <button
        type="button"
        className={`${styles.zone} ${styles.zoneButton} ${open ? styles.zoneOpen : ''}`}
        onClick={(e) => {
          e.stopPropagation();
          setUi({ zoneView: open ? undefined : { playerId: p.id, zone } });
        }}
        aria-pressed={open}
        title={`Show ${p.isYou ? 'your' : `${p.name}'s`} ${label.toLowerCase()}`}
      >
        {content}
      </button>
    ) : (
      <span className={styles.zone} title={label}>
        {content}
      </span>
    );
  };

  const cmdDamage = commanderChips(game, p);
  const lifeChange = useLifeChange(p.life, game.id);
  // An opponent's floating mana, only while their pool is not empty (yours sits above the prompt).
  const floating = p.isYou ? [] : poolEntries(p.manaPool);
  const ring = chosenTarget || choice?.chosen
    ? styles.ringSelected
    : isDefender
      ? styles.ringDefender
      : legalTarget || defenderPick || choice
        ? styles.ringActionable
        : stackSpot === 'hover'
          ? styles.ringTargetedStrong
          : stackSpot === 'top'
            ? styles.ringTargeted
            : '';

  return (
    <div
      className={[styles.plate, density === 'compact' && styles.compact, vertical ? styles.vertical : styles.inline, active && styles.active, ring]
        .filter(Boolean)
        .join(' ')}
      data-player-id={p.id}
      data-arrow-occluder
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={clickable ? onActivate : undefined}
      onKeyDown={clickable ? (e) => e.key === 'Enter' && onActivate() : undefined}
      aria-pressed={choice ? choice.chosen : undefined}
      aria-label={
        clickable
          ? choice
            ? `Choose ${p.name}`
            : legalTarget
              ? `Target ${p.name}`
              : `Attack ${p.name} with the next creatures you choose`
          : undefined
      }
    >
      <div className={styles.lifeBox} title={`${p.name}: ${p.life} life`}>
        <span className={styles.life}>{p.life}</span>
        {/* Life change for 4 s (design pass 4, P6): ▼ loss / ▲ gain, never colour alone.
            It takes the "life" label's place, whose slot is sized for it, so nothing moves. */}
        <span className={styles.lifeTag} role="status">
          <span className={styles.lifeLabel} style={lifeChange !== 0 ? { visibility: 'hidden' } : undefined}>
            life
          </span>
          {lifeChange !== 0 ? (
            <span
              key={`${lifeChange}`}
              className={`${styles.lifeChange} ${lifeChange < 0 ? styles.lifeLoss : styles.lifeGain}`}
              aria-label={`${p.isYou ? 'You' : p.name} ${lifeChange < 0 ? 'lost' : 'gained'} ${Math.abs(lifeChange)} life`}
            >
              <span aria-hidden>{lifeChange < 0 ? '▼' : '▲'}</span>
              {lifeChange < 0 ? '−' : '+'}
              {Math.abs(lifeChange)}
            </span>
          ) : null}
        </span>
      </div>

      <div className={styles.main}>
        <div className={styles.nameRow}>
          <span className={styles.glyph}>
            <SeatGlyph seat={p.seat} />
          </span>
          <span className={styles.name}>{p.isYou ? `${p.name} (you)` : p.name}</span>
          {onExpand ? (
            <button
              type="button"
              className={styles.expand}
              onClick={(e) => {
                e.stopPropagation();
                onExpand();
              }}
              aria-label={`Show ${p.name}'s whole board`}
              title="Show whole board"
            >
              <Icon name="eye" />
              Show board
            </button>
          ) : null}
          {active ? (
            <span className={`${styles.tag} ${styles.tagTurn}`} title={p.isYou ? 'Your turn' : 'Their turn'}>
              <Icon name="play" />
              <span className={styles.tagText}>{p.isYou ? 'Your turn' : 'Their turn'}</span>
            </span>
          ) : null}
          {priority ? (
            <span className={`${styles.tag} ${styles.tagPriority}`} title="Priority">
              <Icon name="hourglass" />
              <span className={styles.tagText}>Priority</span>
            </span>
          ) : null}
          {incoming > 0 ? (
            <span className={`${styles.tag} ${styles.tagAttacked}`} title={`${incoming} attacking`}>
              <Icon name="sword" />
              {incoming}
              <span className={styles.tagText}> attacking</span>
            </span>
          ) : null}
          {draftIncoming > 0 ? (
            <span className={`${styles.tag} ${styles.tagAttacked}`} title={`${draftIncoming} from you`}>
              <Icon name="sword" />
              {draftIncoming}
              <span className={styles.tagText}> from you</span>
            </span>
          ) : null}
          {stackSpot ? (
            <span className={`${styles.tag} ${styles.tagTargeted}`} title={`Targeted by ${spotSource ?? 'a stack item'}`}>
              <Icon name="target" />
              <span className={styles.tagText}>Targeted</span>
            </span>
          ) : null}
          {choice?.chosen ? (
            <span className={`${styles.tag} ${styles.tagChosen}`} title="Chosen">
              <Icon name="check" />
              <span className={styles.tagText}>Chosen</span>
            </span>
          ) : null}
          {legalTarget && !chosenTarget ? (
            <span className={`${styles.tag} ${styles.tagTarget}`} title="Target">
              <Icon name="target" />
              <span className={styles.tagText}>Target</span>
            </span>
          ) : null}
          {cmdDamage.length > 0 ? (
            <span className={styles.cmdGroup}>
              <span className={styles.cmdLabel}>Commander damage taken</span>
              {cmdDamage.map((x) => (
                <span
                  key={x.commanderId}
                  className={`${styles.cmd} ${x.danger ? styles.warn : ''}`}
                  title={x.title}
                  aria-label={x.title}
                  role="img"
                >
                  <Icon name={x.danger ? 'burst' : 'crown'} />
                  <span className={styles.cmdSeat}>
                    <SeatGlyph seat={x.seat} />
                  </span>
                  <span className={styles.cmdName}>{x.shortName}</span>
                  <b>{x.amount}</b>
                  <span className={styles.of21}>/{COMMANDER_LETHAL}</span>
                </span>
              ))}
            </span>
          ) : null}
        </div>

        <div className={styles.chips}>
          {zoneChip('hand', 'hand', 'Hand', p.isYou ? p.hand.length : p.handCount)}
          {zoneChip('library', 'library', 'Library', p.libraryCount)}
          {zoneChip('graveyard', 'grave', 'Graveyard', p.graveyard.length)}
          {zoneChip('exile', 'exile', 'Exile', p.exile.length)}
          {p.poison > 0 ? (
            <span className={`${styles.zone} ${styles.warn}`}>
              <Icon name="poison" />
              <span className={styles.zoneLabel}>Poison</span>
              <span className={styles.zoneCount}>{p.poison}</span>
            </span>
          ) : null}
          {p.counters.map((k) => (
            <span key={k.kind} className={styles.zone}>
              <span className={styles.counterLabel}>{k.kind}</span>
              <span className={styles.zoneCount}>{k.count}</span>
            </span>
          ))}
          {floating.length > 0 ? (
            <span
              className={`${styles.zone} ${styles.floating}`}
              title={`${p.name}'s floating mana: ${floating.map(([c, n]) => `${n} ${manaName(c)}`).join(', ')}`}
            >
              <span className={styles.zoneLabel}>Floating</span>
              {floating.flatMap(([c, n]) => Array.from({ length: n }, (_, i) => <ManaSymbol key={`${c}${i}`} symbol={c} />))}
            </span>
          ) : null}
        </div>

      </div>

      {/* Full seats show the commander in the battlefield's support row; compact seats keep a chip. */}
      {p.command.length > 0 && density === 'compact' ? (
        <div className={styles.command} aria-label="Command zone">
          {p.command.map((id) => {
            const c = game.cards[id];
            if (!c) return null;
            const tax = commanderTax(p, id);
            return (
              <span key={id} className={styles.zone} title={`${c.name} in the command zone, tax +${tax}`}>
                <Icon name="crown" />
                <span className={styles.zoneCount}>+{tax}</span>
              </span>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
