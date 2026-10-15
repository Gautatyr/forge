import type { CSSProperties } from 'react';
import { groupKey, isCreature, isLand } from '../model/selectors';
import type { CardView, GameView, PlayerView } from '../model/types';
import { cardStatus } from '../state/cardStatus';
import { useMatch } from '../state/MatchContext';
import { CARD_SCALE, type Prefs } from '../state/prefs';
import type { UiState } from '../state/ui';
import { fitBattlefield, fitRow, type LayoutItem, type RowFit } from './battlefieldLayout';
import { Card } from './Card';
import { useSize } from './useSize';
import styles from './Battlefield.module.css';

interface Entry {
  card: CardView;
  ids: string[];
  /** First entry of the support group in a one-row layout: gets a wider gap. */
  separator?: boolean;
}

/** Collapse identical tokens and lands into one entry with a count. */
function group(cards: CardView[], game: GameView, ui: UiState, prefs: Prefs): Entry[] {
  const out: Entry[] = [];
  const byKey = new Map<string, Entry>();
  for (const c of cards) {
    const groupable = (c.isToken && prefs.groupTokens) || (isLand(c) && !c.isToken && prefs.groupLands);
    if (!groupable || c.attachments.length > 0) {
      out.push({ card: c, ids: [c.id] });
      continue;
    }
    const s = cardStatus(game, ui, c.id);
    const key = groupKey(c, JSON.stringify([s.attacking, s.blocking, s.selected, s.actionKind, s.targetedBy, s.dimmed]));
    const e = byKey.get(key);
    if (e) e.ids.push(c.id);
    else {
      const n = { card: c, ids: [c.id] };
      byKey.set(key, n);
      out.push(n);
    }
  }
  return out;
}

function shownTapped(game: GameView, c: CardView): boolean {
  // Attackers are drawn upright during combat (see Card).
  const attacking =
    game.combat?.attacks.some((a) => a.attackerId === c.id) ||
    (game.decision.kind === 'declareAttackers' && game.decision.draft.some((a) => a.attackerId === c.id));
  return c.tapped && !attacking;
}

function Lines({ entries, fit, label }: { entries: Entry[]; fit: RowFit; label: string }) {
  const { game } = useMatch();
  const chunks: Entry[][] = [];
  for (let i = 0; i < entries.length; i += fit.perLine) chunks.push(entries.slice(i, i + fit.perLine));
  return (
    <div className={styles.row} style={{ '--cw': `${fit.cw}px` } as CSSProperties} aria-label={label}>
      {chunks.map((chunk, li) => (
        <div key={li} className={styles.line}>
          {chunk.map((e) => (
            <div
              key={e.card.id}
              className={`${styles.host} ${e.separator ? styles.separator : ''}`}
              style={{ '--host-att': Math.min(2, e.card.attachments.length) } as CSSProperties}
            >
              {e.card.attachments.slice(0, 2).map((aid, j) => {
                const a = game.cards[aid];
                return a ? (
                  <Card
                    key={aid}
                    card={a}
                    context="board"
                    className={styles.attachment}
                    style={{ '--j': e.card.attachments.length - j } as CSSProperties}
                    ariaExtra={`attached to ${e.card.name}`}
                  />
                ) : null;
              })}
              <Card card={e.card} context="board" count={e.ids.length} groupIds={e.ids} />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

interface Props {
  player: PlayerView;
  /** "creatures" shows creatures only (compact seats). */
  rows?: 'all' | 'creatures';
}

export function Battlefield({ player, rows = 'all' }: Props) {
  const { game, ui, prefs } = useMatch();
  const [ref, size] = useSize<HTMLDivElement>();
  const cards = player.battlefield.map((id) => game.cards[id]!).filter((c) => !c.attachedTo);
  const creatures = group(cards.filter(isCreature), game, ui, prefs);
  const others = group(cards.filter((c) => !isCreature(c) && !isLand(c)), game, ui, prefs);
  const lands = group(cards.filter((c) => isLand(c) && !isCreature(c)), game, ui, prefs);
  if (others.length && lands.length) lands[0] = { ...lands[0]!, separator: true };
  const support = rows === 'creatures' ? [] : [...others, ...lands];

  const item = (e: Entry): LayoutItem => ({ tapped: shownTapped(game, e.card), attachments: e.card.attachments.length });
  const gap = 0.55 * size.rem;
  const scale = CARD_SCALE[prefs.cardSize];
  const maxCw = 11 * size.rem;
  const fit =
    rows === 'creatures'
      ? { arrangement: 'one-row' as const, creatures: fitRow(creatures.map(item), size.w, size.h, gap, scale, maxCw), support: { cw: 0, lines: 1, perLine: 1 } }
      : fitBattlefield(creatures.map(item), support.map(item), size.w, size.h, gap, scale, maxCw);

  const style = { '--nudge-dir': player.isYou ? -1 : 1, '--gap': `${gap}px` } as CSSProperties;
  let content = null;
  if (size.w > 0) {
    if (fit.arrangement === 'one-row') {
      const all = [...creatures, ...(support.length && creatures.length ? [{ ...support[0]!, separator: true }, ...support.slice(1)] : support)];
      content = <Lines entries={all} fit={fit.creatures} label="Permanents" />;
    } else {
      const c = <Lines key="c" entries={creatures} fit={fit.creatures} label="Creatures" />;
      const s = <Lines key="s" entries={support} fit={fit.support} label="Lands and other permanents" />;
      content = player.isYou ? [c, s] : [s, c];
    }
  }
  return (
    <div ref={ref} className={styles.bf} style={style} aria-label={`${player.name}'s battlefield`}>
      {content}
    </div>
  );
}
