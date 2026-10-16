import { commanderTax } from '../model/selectors';
import type { MulliganState, PlayerView } from '../model/types';
import { playerTargetSpot, spotlightItem } from '../state/cardStatus';
import { mulliganTag, turnPlayerId } from '../state/gameStart';
import { currentDefender } from '../state/focus';
import { useMatch } from '../state/MatchContext';
import { playerChoice } from './tray/inPlace';
import { useInPlacePick } from './tray/useInPlacePick';
import type { ViewableZone } from '../state/ui';
import { Icon, SeatGlyph, type IconName } from './Icon';
import styles from './PlayerPlate.module.css';

const MULLIGAN_TAG_CLASS: Record<MulliganState['state'], string | undefined> = {
  deciding: styles.mulliganDeciding,
  mulligan: styles.mulliganTaken,
  kept: styles.mulliganKept,
};

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
  // No turn before turn 1 or after the game: no "Your turn" or "Priority" tag then.
  const turnOf = turnPlayerId(game);
  const active = turnOf === p.id;
  const priority = turnOf !== undefined && game.turn.priorityPlayerId === p.id;
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

  const cmdDamage = p.commanderDamageTaken.filter((x) => x.amount > 0);
  // Opening hands (design pass 4 §2.4): opponents' "Deciding…", "Kept 7", "Mulligan → 6".
  const mulligan = p.mulligan && !p.isYou ? mulliganTag(p.mulligan) : undefined;
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
      className={`${styles.plate} ${styles[density]} ${vertical ? styles.vertical : styles.inline} ${active ? styles.active : ''} ${ring}`}
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
        <span className={styles.lifeLabel}>life</span>
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
          {mulligan ? (
            <span className={`${styles.tag} ${MULLIGAN_TAG_CLASS[p.mulligan!.state]}`} title={mulligan.title}>
              <Icon name={mulligan.icon} />
              {/* Not .tagText: the words stay on narrow headers (§2.4 names the tags). */}
              <span>{mulligan.text}</span>
              {mulligan.count}
            </span>
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
              {cmdDamage.map((x) => {
                const src = game.cards[x.commanderId];
                const danger = x.amount >= 15;
                return (
                  <span
                    key={x.commanderId}
                    className={`${styles.cmd} ${danger ? styles.warn : ''}`}
                    title={`${x.amount} of 21 commander damage from ${src?.name ?? 'a commander'}`}
                  >
                    <Icon name={danger ? 'burst' : 'crown'} />
                    <span className={styles.cmdName}>{src?.name.split(',')[0]}</span>
                    <b>{x.amount}</b>
                    <span className={styles.of21}>/21</span>
                  </span>
                );
              })}
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
