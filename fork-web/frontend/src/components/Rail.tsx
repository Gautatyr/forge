import type { CSSProperties } from 'react';
import { cardName, player, targetName } from '../model/selectors';
import type { TargetRef } from '../model/types';
import { spotlightItem, stackTargetSpot } from '../state/cardStatus';
import { useMatch } from '../state/MatchContext';
import { ActionPanel } from './ActionPanel';
import { Card } from './Card';
import { CombatPanel } from './CombatPanel';
import { HoverPreview } from './HoverPreview';
import { Icon, SeatGlyph } from './Icon';
import { LogText } from './LogText';
import { PREVIEW_BESIDE_ATTR } from './previewSpot';
import { isAlwaysYielded, offersAlwaysYield, yieldKeyOf } from './stackYield';
import { recentRows } from './recentRows';
import { zoneCardIds, zoneTitle } from './zoneBrowser';
import styles from './Rail.module.css';
import { t, tDynamic, type MsgKey } from '../i18n';

/**
 * Right panel, full height and in the same place in every layout. Top: the
 * regions that come and go (stack when not empty, combat, an open zone), then
 * Recent, which takes the height left. Bottom: the action block, sized to its
 * content and anchored to the bottom edge, so its persistent controls never
 * move. Each region keeps its header in view and scrolls its own body, so an
 * open zone never pushes the log out of reach. The hover preview shows over
 * the board, above the hand, flush with the rail (HoverPreview.tsx).
 */
export function Rail() {
  return (
    <aside className={styles.rail} {...{ [PREVIEW_BESIDE_ATTR]: '' }}>
      <div className={styles.upper}>
        <div className={styles.regions}>
          <StackPanel />
          <CombatPanel />
          <ZoneViewer />
          <RecentEvents />
        </div>
        <HoverPreview />
      </div>
      <ActionPanel />
    </aside>
  );
}

function StackPanel() {
  const { game, ui, setUi, send } = useMatch();
  if (game.stack.length === 0) return null;
  const items = [...game.stack].reverse();
  const spot = spotlightItem(game, ui);
  const spotSrc = spot ? game.cards[spot.sourceCardId] : undefined;
  // Targeting a spell or ability (counterspells, Stifle, redirects): the items the input accepts are lit and
  // clickable, only while it is open (highlights are answers, never hints).
  const d = game.decision;
  const isTarget = (list: TargetRef[], id: string) => list.some((x) => x.kind === 'stackItem' && x.id === id);
  const picking = d.kind === 'chooseTargets' && items.some((it) => isTarget(d.legal, it.id));
  return (
    <section className={`${styles.block} ${styles.stack}`} aria-label={t('rail.stack')}>
      <header className={styles.head}>
        <h2>
          {t('rail.stackTitle')} <span className={styles.count}>{game.stack.length}</span>
        </h2>
        <label className={styles.inlineToggle} title={t('rail.autoYieldTitle')}>
          <input type="checkbox" checked={game.autoYield} onChange={(e) => send({ type: 'setAutoYield', on: e.target.checked })} />
          {game.autoYield ? t('rail.autoYieldOn') : t('rail.autoYieldOff')}
        </label>
      </header>
      <p className={styles.hint}>
        {picking
          ? t('rail.pickHint')
          : t('rail.stackHint')}
      </p>
      <ol className={`${styles.body} ${styles.items}`} data-scroll-region>
        {items.map((item, i) => {
          const src = game.cards[item.sourceCardId];
          const ctrl = player(game, item.controllerId);
          const yieldKey = yieldKeyOf(game, item);
          const yielding = isAlwaysYielded(game, item);
          const chosen = d.kind === 'chooseTargets' && isTarget(d.chosen, item.id);
          const legal = d.kind === 'chooseTargets' && isTarget(d.legal, item.id);
          const toggle = legal || chosen ? () => send({ type: 'toggleTarget', target: { kind: 'stackItem', id: item.id } }) : undefined;
          // Targeted by the spotlight item (a counterspell, a Stifle): ringed like a targeted card, no line.
          const targeted = stackTargetSpot(game, ui, item.id);
          return (
            <li
              key={item.id}
              className={[
                styles.item,
                spot?.id === item.id ? styles.itemSpot : '',
                chosen
                  ? styles.itemChosen
                  : legal
                    ? styles.itemLegal
                    : targeted === 'hover'
                      ? styles.itemTargetedStrong
                      : targeted
                        ? styles.itemTargeted
                        : '',
              ].join(' ')}
              onPointerEnter={() => setUi({ hoveredStackItem: item.id })}
              onPointerLeave={() => setUi({ hoveredStackItem: undefined })}
              data-stack-id={item.id}
            >
              <span className={styles.order}>{i === 0 ? t('rail.top') : i + 1}</span>
              {src ? <Card card={src} context="thumb" style={{ '--cw': '3.6rem' } as CSSProperties} onActivate={toggle} /> : null}
              <div className={styles.itemText}>
                <span className={styles.itemName}>
                  {src ? cardName(src) : undefined}
                  {item.kind !== 'spell' ? <em> · {tDynamic(`rail.kind.${item.kind}` as MsgKey)}</em> : null}
                </span>
                <span className={styles.by}>
                  <SeatGlyph seat={ctrl.seat} />
                  {ctrl.isYou ? t('common.you') : ctrl.name}
                </span>
                {item.targets.map((tg) => (
                  <span key={`${tg.kind}${tg.id}`} className={styles.targetLine}>
                    <Icon name="target" />
                    {targetName(game, tg)}
                    {tg.kind === 'card' && game.cards[tg.id]?.controllerId === game.youId ? ` ${t('rail.yours')}` : ''}
                  </span>
                ))}
                {targeted && spot ? (
                  <span className={styles.targetedBy}>
                    <Icon name="target" />
                    {t('rail.targetedBy', { name: spotSrc ? cardName(spotSrc) : t('rail.aSpell') })}
                  </span>
                ) : null}
                {toggle ? (
                  <button
                    type="button"
                    className={`${styles.pick} ${chosen ? styles.pickOn : ''}`}
                    aria-pressed={chosen}
                    onClick={toggle}
                    title={chosen ? t('rail.chosenTitle') : t('rail.chooseTitle')}
                  >
                    <Icon name={chosen ? 'check' : 'target'} />
                    {chosen ? t('rail.targetChosen') : t('rail.targetThis')}
                  </button>
                ) : null}
                {offersAlwaysYield(item) ? (
                  <button
                    type="button"
                    className={`${styles.yield} ${yielding ? styles.yieldOn : ''}`}
                    aria-pressed={yielding}
                    onClick={() => send({ type: 'toggleAutoYieldTo', key: yieldKey })}
                    title={t('rail.yieldTitle')}
                  >
                    {yielding ? t('rail.yieldOn') : t('rail.yieldTo')}
                  </button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function ZoneViewer() {
  const { game, ui, setUi } = useMatch();
  const z = ui.zoneView;
  if (!z || z.large) return null;
  const ids = zoneCardIds(game, z.playerId, z.zone);
  const title = zoneTitle(game, z.playerId, z.zone);
  return (
    <section className={`${styles.block} ${styles.zone}`} aria-label={title}>
      <header className={styles.head}>
        <h2>
          {title} <span className={styles.count}>{ids.length}</span>
        </h2>
        <span className={styles.headTools}>
          <button
            type="button"
            className={styles.close}
            onClick={() => setUi({ zoneView: { ...z, large: true } })}
            aria-label={t('rail.largeView', { title: title.toLowerCase() })}
            title={t('rail.largeViewTitle')}
          >
            <Icon name="expand" />
          </button>
          <button type="button" className={styles.close} onClick={() => setUi({ zoneView: undefined })} aria-label={t('common.close')}>
            <Icon name="close" />
          </button>
        </span>
      </header>
      {ids.length === 0 ? <p className={styles.hint}>{t('rail.empty')}</p> : null}
      <div className={`${styles.body} ${styles.zoneGrid}`} data-scroll-region>
        {ids.map((id) => {
          const c = game.cards[id];
          return c ? <Card key={id} card={c} context="thumb" style={{ '--cw': '7.3rem' } as CSSProperties} /> : null;
        })}
      </div>
    </section>
  );
}

/** Newest first; older ones scroll. The drawer (L) has the whole game. */
const RECENT_EVENTS = 20;

function RecentEvents() {
  const { game, setUi } = useMatch();
  const rows = recentRows(game, RECENT_EVENTS);
  return (
    <section className={`${styles.block} ${styles.recent}`} aria-label={t('rail.recentAria')}>
      <header className={styles.head}>
        <h2>{t('rail.recent')}</h2>
        <button type="button" className={styles.link} onClick={() => setUi({ logOpen: true })}>
          {t('rail.fullLog')} <kbd>L</kbd>
        </button>
      </header>
      <ol className={`${styles.body} ${styles.events}`} data-scroll-region>
        {rows.map((r) =>
          r.kind === 'divider' ? (
            <li key={r.key} className={styles.turnDivider}>
              <span className={styles.turnLabel}>
                {r.seat !== undefined ? <SeatGlyph seat={r.seat} /> : null}
                {r.label}
              </span>
            </li>
          ) : (
            <li key={r.key} className={r.bold ? styles.eventLoss : undefined}>
              {r.entry.playerId ? (
                <span className={styles.eventSeat}>
                  <SeatGlyph seat={player(game, r.entry.playerId).seat} />
                </span>
              ) : null}
              <span>
                <LogText text={r.entry.text} />
              </span>
            </li>
          ),
        )}
      </ol>
    </section>
  );
}
