import type { CSSProperties } from 'react';
import type { CardView, GameView, PlayerView } from '../model/types';
import { useMatch } from '../state/MatchContext';
import { battlefieldRows, type Entry } from './battlefieldGroups';
import { CHIP_BAND_REM, COMPACT_BELOW, fitBattlefield, fitRow, staggerRaise, tapLift, type LayoutItem, type RowFit } from './battlefieldLayout';
import { Card } from './Card';
import { useSize } from './useSize';
import styles from './Battlefield.module.css';
import { t } from '../i18n';
import { cardName } from '../model/selectors';

function shownTapped(game: GameView, c: CardView): boolean {
  // Attackers are drawn upright during combat (see Card).
  const attacking =
    game.combat?.attacks.some((a) => a.attackerId === c.id) ||
    (game.decision.kind === 'declareAttackers' && game.decision.draft.some((a) => a.attackerId === c.id));
  return c.tapped && !attacking;
}

function Lines({ entries, fit, label, minRaise }: { entries: Entry[]; fit: RowFit; label: string; minRaise: number }) {
  const { game, prefs } = useMatch();
  // Compact cards (pass-3 spec, section 4) get a band over the title bar: the name label, and the counter chips.
  const compact = fit.cw < COMPACT_BELOW;
  const nameLabel = prefs.nameLabels && compact;
  const chunks: Entry[][] = [];
  for (let i = 0; i < entries.length; i += fit.perLine) chunks.push(entries.slice(i, i + fit.perLine));
  const stagger = fit.overlap > 0;
  const rowStyle = {
    '--cw': `${fit.cw}px`,
    '--overlap': `${fit.overlap}px`,
    '--raise': `${staggerRaise(fit.cw, minRaise)}px`,
  } as CSSProperties;
  return (
    <div className={styles.row} style={rowStyle} aria-label={label}>
      {chunks.map((chunk, li) => (
        <div key={li} className={`${styles.line} ${stagger ? styles.stagger : ''}`}>
          {chunk.map((e) => (
            <div
              key={e.card.id}
              className={`${styles.host} ${e.separator ? styles.separator : ''}`}
              style={
                {
                  '--host-att': Math.min(2, e.card.attachments.length),
                  // A tapped card is shorter than its neighbours (the line is bottom-aligned): a back card lifts that
                  // much more, so the strip it shows above the front cards is as tall as an upright one's.
                  '--tap-lift': stagger && shownTapped(game, e.card) ? `${tapLift(fit.cw)}px` : '0px',
                } as CSSProperties
              }
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
                    ariaExtra={t('bf.attachedTo', { name: cardName(e.card) })}
                    nameLabel={nameLabel}
                    // An attached card shows only its top, over the host: its counters always go in the band.
                    compact
                  />
                ) : null;
              })}
              <Card
                card={e.card}
                context="board"
                count={e.ids.length}
                groupIds={e.ids}
                nameLabel={nameLabel}
                compact={compact}
              />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

interface Props {
  player: PlayerView;
  /** "creatures" shows the creature row only (compact seats). */
  rows?: 'all' | 'creatures';
}

/** Card width limits: at most 180 px at 1080p (rem follows the screen height and the UI scale), never below 72 px. */
const MAX_CW_REM = 11.25;
const MIN_CW_PX = 72;

export function Battlefield({ player, rows = 'all' }: Props) {
  const { game, ui, prefs } = useMatch();
  const [ref, size] = useSize<HTMLDivElement>();
  const { creatures, support: all } = battlefieldRows(player, game, ui, prefs);
  const support = rows === 'creatures' ? [] : all;

  const gap = 0.55 * size.rem;
  const item = (e: Entry): LayoutItem => ({
    tapped: shownTapped(game, e.card),
    attachments: e.card.attachments.length,
    separator: e.separator,
  });
  const maxCw = MAX_CW_REM * size.rem;
  const minCw = MIN_CW_PX * prefs.uiScale;
  const minRaise = CHIP_BAND_REM * size.rem;
  // Compact seats (Focus) are short by design: they fit whatever size the space allows.
  const fit =
    rows === 'creatures'
      ? { creatures: fitRow(creatures.map(item), size.w, size.h, gap, maxCw, 2 * size.rem, minRaise), support: undefined }
      : fitBattlefield(creatures.map(item), support.map(item), size.w, size.h, gap, maxCw, minCw, minRaise);

  const style = { '--nudge-dir': player.isYou ? -1 : 1, '--gap': `${gap}px` } as CSSProperties;
  let content = null;
  if (size.w > 0) {
    const c = creatures.length ? <Lines key="c" entries={creatures} fit={fit.creatures} label={t('bf.creatures')} minRaise={minRaise} /> : null;
    const s = fit.support && support.length ? <Lines key="s" entries={support} fit={fit.support} label={t('bf.lands')} minRaise={minRaise} /> : null;
    content = player.isYou ? [c, s] : [s, c];
  }
  return (
    <div ref={ref} className={styles.bf} style={style} aria-label={t('bf.aria', { name: player.name })}>
      {content}
    </div>
  );
}
