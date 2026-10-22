import { useRef } from 'react';
import { nameLabel } from '../model/selectors';
import type { Attack, MulliganState, PlayerView } from '../model/types';
import { playerTargetSpot, spotlightItem } from '../state/cardStatus';
import { mulliganTag, turnPlayerId } from '../state/gameStart';
import { currentAttackAim } from '../state/focus';
import { useMatch } from '../state/MatchContext';
import { playerChoice } from './tray/inPlace';
import { useInPlacePick } from './tray/useInPlacePick';
import type { ViewableZone } from '../state/ui';
import { commanderChips, COMMANDER_LETHAL } from './commanderChips';
import { commandZoneChips } from './commandZone';
import { Icon, SeatGlyph, type IconName } from './Icon';
import { useLifeChange } from './lifeMarker';
import { ManaSymbol, manaName } from './ManaSymbol';
import styles from './PlayerPlate.module.css';
import { poolGroups } from './poolGroups';
import { useRoomForNames } from './useRoomForNames';

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
  // A player picked for an effect, not targeted (issue #81).
  const picking = d.kind === 'chooseTargets' && d.purpose === 'pick';
  const chosenTarget = d.kind === 'chooseTargets' && d.chosen.some((t) => t.kind === 'player' && t.id === p.id);
  const defenderPick = d.kind === 'declareAttackers' && d.defenders.includes(p.id);
  const aim = currentAttackAim(game, ui, prefs.layout);
  const isDefender = defenderPick && aim?.defenderId === p.id && !aim.defenderCardId;
  // Attacks on the player; those on their planeswalkers and battles show on those cards (issue #65).
  const atPlayer = (a: Attack) => a.defenderId === p.id && !a.defenderCardId;
  const incoming = game.combat?.attacks.filter(atPlayer).length ?? 0;
  const draftIncoming = d.kind === 'declareAttackers' ? d.draft.filter(atPlayer).length : 0;
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
  // An opponent's commanders in the command zone (playtest 1): a chip, the card in the hover preview.
  const commandZone = commandZoneChips(p, game);
  const showCard = (cardId: string) => setUi((u) => (u.hover?.cardId === cardId ? u : { ...u, hover: { cardId } }));
  const hideCard = (cardId: string) => setUi((u) => (u.hover?.cardId === cardId ? { ...u, hover: undefined } : u));
  const plateRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLDivElement>(null);
  useRoomForNames(plateRef, mainRef, !p.isYou && !vertical && cmdDamage.length > 0);
  const lifeChange = useLifeChange(p.life, game.id);
  // An opponent's floating mana, only while their pool is not empty (yours sits above the prompt).
  const floating = p.isYou ? [] : poolGroups(p.manaPool);
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
      className={[styles.plate, density === 'compact' && styles.compact, vertical ? styles.vertical : styles.inline, active && styles.active, ring]
        .filter(Boolean)
        .join(' ')}
      ref={plateRef}
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
              ? `${picking ? 'Choose' : 'Target'} ${p.name}`
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
            <span key={`${lifeChange}`} className={`${styles.lifeChange} ${lifeChange < 0 ? styles.lifeLoss : styles.lifeGain}`}>
              <span aria-hidden>{lifeChange < 0 ? '▼' : '▲'}</span>
              <span aria-hidden>
                {lifeChange < 0 ? '−' : '+'}
                {Math.abs(lifeChange)}
              </span>
              <span className={styles.srOnly}>
                {`${p.isYou ? 'You' : p.name} ${lifeChange < 0 ? 'lost' : 'gained'} ${Math.abs(lifeChange)} life`}
              </span>
            </span>
          ) : null}
        </span>
      </div>

      <div className={styles.main} ref={mainRef}>
        <div className={styles.nameRow}>
          <span className={styles.glyph}>
            <SeatGlyph seat={p.seat} />
          </span>
          <span className={styles.name}>{nameLabel(p)}</span>
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
          {legalTarget && !chosenTarget && !picking ? (
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
          {commandZone.map((x) => (
            <button
              key={x.cardId}
              type="button"
              className={`${styles.zone} ${styles.zoneButton} ${styles.commandZone}`}
              data-command-zone={x.cardId}
              title={x.title}
              aria-label={`${x.title} Hover to see it, click to inspect.`}
              onPointerEnter={() => showCard(x.cardId)}
              onPointerLeave={() => hideCard(x.cardId)}
              onFocus={() => showCard(x.cardId)}
              onBlur={() => hideCard(x.cardId)}
              onClick={(e) => {
                e.stopPropagation();
                setUi({ inspectId: x.cardId, hover: undefined });
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                setUi({ inspectId: x.cardId, hover: undefined });
              }}
            >
              <Icon name="crown" />
              <span className={styles.zoneLabel}>Commander</span>
              {x.tax > 0 ? <span className={styles.zoneCount}>+{x.tax}</span> : null}
            </button>
          ))}
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
        {/* Outside the zone chips, so in a one-line header it flows beside the name and tags. */}
        {floating.length > 0 ? (
          <span
            className={`${styles.zone} ${styles.floating}`}
            title={`${p.name}'s floating mana: ${floating.map((g) => `${g.times ?? g.symbols} ${manaName(g.colour)}`).join(', ')}`}
          >
            <Icon name="mana" />
            <span className={styles.zoneLabel}>Floating</span>
            {floating.map((g) => (
              <span key={g.colour} className={styles.poolGroup}>
                {Array.from({ length: g.symbols }, (_, i) => (
                  <ManaSymbol key={i} symbol={g.colour} />
                ))}
                {g.times ? <span className={styles.zoneCount}>×{g.times}</span> : null}
              </span>
            ))}
          </span>
        ) : null}
      </div>

    </div>
  );
}
