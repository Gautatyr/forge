import { useCallback, useEffect, useLayoutEffect, useReducer, useRef, useState } from 'react';
import { player } from '../model/selectors';
import { useMatch } from '../state/MatchContext';
import { turnHeading } from '../state/gameStart';
import { AI_CHIP_DELAY_MS, fitLevel, SettleGate, waitingOn, type FitLevel } from '../state/turnStrip';
import type { Overlay } from '../state/ui';
import { Icon, SeatGlyph, type IconName } from './Icon';
import { GameOverChip } from './GameEnd';
import { PhaseTrack } from './PhaseTrack';
import styles from './TopBar.module.css';
import { getLanguage, t } from '../i18n';

/**
 * True once `key` has stayed the same for `delayMs` (0: at once), see
 * `SettleGate`. The "Waiting for <AI>" chip uses it: AI opponents pass in a
 * blink, so it would flicker.
 */
function useSettled(key: string, delayMs: number): boolean {
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  const [gate] = useState(() => new SettleGate(rerender));
  useEffect(() => gate.set(key, delayMs), [gate, key, delayMs]);
  useEffect(() => () => gate.dispose(), [gate]);
  return gate.shown(key, delayMs);
}

/** Width of a one-line block's content, even while it is cut with "…". */
const natural = (el: Element | null | undefined) => (el instanceof HTMLElement ? el.scrollWidth : 0);
const outer = (el: Element | null | undefined) => (el instanceof HTMLElement ? el.offsetWidth : 0);

/**
 * How much of the top bar fits (see `fitLevel`): measured from natural widths,
 * so the result does not depend on the level currently drawn and cannot
 * oscillate. Parts hidden at a level stay laid out out of flow to be measured.
 */
function useFit() {
  const barRef = useRef<HTMLElement>(null);
  const leftRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLElement>(null);
  const toolsRef = useRef<HTMLDivElement>(null);
  const [level, setLevel] = useState<FitLevel>(0);

  const measure = useCallback(() => {
    const bar = barRef.current;
    const left = leftRef.current;
    const track = trackRef.current;
    const tools = toolsRef.current;
    if (!bar || !left || !track || !tools) return;
    const cs = getComputedStyle(bar);
    const available = bar.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const gaps = 2 * (parseFloat(cs.columnGap) || 0);
    const leftW = Math.max(0, ...[...left.children].map(natural));
    // Folded: swap the fold pill's run for the full combat run.
    const folded = track.querySelector('[data-combat-run="fold"]');
    const drawnW = folded
      ? outer(track) - outer(folded) + outer(track.querySelector('[data-combat-run="measure"]'))
      : outer(track);
    // Each step's width with its full and its short name (the unused one is laid out out of flow).
    let fullMinusDrawn = 0;
    let trackShort = 0;
    for (const b of track.querySelectorAll<HTMLElement>('[data-strip-step]')) {
      const full = outer(b.querySelector('[data-step-name="full"]'));
      const short = outer(b.querySelector('[data-step-name="short"]'));
      const shortDrawn = b.dataset.names === 'short';
      const minW = parseFloat(getComputedStyle(b).minWidth) || 0;
      const fullW = shortDrawn ? b.offsetWidth - short + full : b.offsetWidth;
      const shortW = Math.max(minW, fullW - full + short);
      if (shortDrawn) fullMinusDrawn += fullW - b.offsetWidth;
      trackShort += fullW - shortW;
    }
    const trackW = drawnW + fullMinusDrawn;
    let toolWords = 0;
    for (const w of tools.querySelectorAll('[data-tool-word]')) {
      const gap = parseFloat(getComputedStyle(w.parentElement!).columnGap) || 0;
      toolWords += outer(w) + gap;
    }
    const wordsHidden = tools.dataset.words === 'hidden';
    const toolsW = outer(tools) + (wordsHidden ? toolWords : 0);
    setLevel(fitLevel({ available, left: leftW, track: trackW, trackShort, tools: toolsW, toolWords, gaps }));
  }, []);

  useLayoutEffect(() => {
    const ro = new ResizeObserver(() => measure());
    for (const el of [barRef.current, trackRef.current, toolsRef.current]) if (el) ro.observe(el);
    return () => ro.disconnect();
  }, [measure]);

  return { barRef, leftRef, trackRef, toolsRef, level, measure };
}

export function TopBar() {
  const { game, ui, setUi } = useMatch();
  // Before turn 1 and after the game there is no turn: no "Your turn", number or "next:".
  const heading = turnHeading(game);
  const waiting = player(game, waitingOn(game));
  const chipShown = useSettled(waiting.id, waiting.isAi ? AI_CHIP_DELAY_MS : 0);
  const { barRef, leftRef, trackRef, toolsRef, level, measure } = useFit();
  const toggle = (o: Overlay) => setUi((u) => ({ ...u, overlay: u.overlay === o ? undefined : o }));
  const wordsHidden = level >= 1;

  // Names and step change the natural widths without resizing a constrained box: re-measure.
  const contentKey = `${JSON.stringify(heading)}|${waiting.id}|${game.turn.step}|${getLanguage()}`;
  useLayoutEffect(() => measure(), [contentKey, measure]);

  const tool = (icon: IconName, label: string, key: string | undefined, pressed: boolean, onClick: () => void, title: string) => (
    <button type="button" className={styles.tool} aria-pressed={pressed} onClick={onClick} title={title} aria-label={label}>
      <Icon name={icon} />
      <span data-tool-word className={wordsHidden ? styles.measureOnly : undefined} aria-hidden>
        {label}
      </span>
      {key ? <kbd aria-hidden>{key}</kbd> : null}
    </button>
  );

  const active = heading.kind === 'turn' ? player(game, heading.playerId) : undefined;
  const next = heading.kind === 'turn' && heading.nextId ? player(game, heading.nextId) : undefined;
  // The seat shape of whose turn it is, or of the winner ("● You won", "▲ Mira won").
  const winnerId = game.result?.winnerId;
  const headSeat = active ?? (heading.kind === 'over' && winnerId ? player(game, winnerId) : undefined);
  const whose = heading.kind === 'turn' ? (active!.isYou ? t('top.yourTurn') : t('top.theirTurn', { name: active!.name })) : heading.text;
  const turnLine = heading.kind === 'turn' ? `${t('top.turn', { n: heading.number })}${next ? ` · ${t('top.next')} ${next.isYou ? t('top.you') : next.name}` : ''}` : '';
  const chipText = waiting.isYou ? t('top.waitYou') : t('top.waitName', { name: waiting.name });

  return (
    <header ref={barRef} className={styles.bar}>
      <div ref={leftRef} className={styles.turn}>
        <span className={styles.whose} title={whose}>
          {headSeat ? <SeatGlyph seat={headSeat.seat} /> : heading.kind === 'start' ? <Icon name="hand" /> : null} {whose}
        </span>
        {heading.kind === 'turn' ? (
          <span className={styles.turnLine} title={turnLine}>
            {t('top.turn', { n: heading.number })}
            {next ? (
              <>
                {` · ${t('top.next')} `}
                <SeatGlyph seat={next.seat} /> {next.isYou ? t('top.you') : next.name}
              </>
            ) : null}
          </span>
        ) : null}
        {game.result ? (
          <GameOverChip className={`${styles.chip} ${styles.chipYou}`} />
        ) : (
          <span
            className={`${styles.chip} ${waiting.isYou ? styles.chipYou : ''} ${chipShown ? '' : styles.chipPending}`}
            role="status"
            title={chipText}
          >
            <Icon name="hourglass" /> {waiting.isYou ? null : <SeatGlyph seat={waiting.seat} />} {chipText}
          </span>
        )}
      </div>
      <PhaseTrack ref={trackRef} shortNames={level >= 2} foldCombat={level >= 3} />
      <div className={styles.tools}>
        <div ref={toolsRef} className={styles.toolsInner} data-words={wordsHidden ? 'hidden' : 'shown'}>
          {tool('log', t('top.log'), 'L', ui.logOpen, () => setUi((u) => ({ ...u, logOpen: !u.logOpen })), `${t('top.log')} (L)`)}
          {tool('sliders', t('top.display'), 'D', ui.overlay === 'display', () => toggle('display'), `${t('top.display')} (D)`)}
          {tool('keyboard', t('top.keys'), '?', ui.overlay === 'shortcuts', () => toggle('shortcuts'), `${t('top.keys')} (?)`)}
          {tool('menu', t('top.game'), undefined, ui.overlay === 'menu', () => toggle('menu'), t('top.gameTitle'))}
        </div>
      </div>
    </header>
  );
}
