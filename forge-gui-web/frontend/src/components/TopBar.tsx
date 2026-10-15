import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { player } from '../model/selectors';
import { useMatch } from '../state/MatchContext';
import { AI_CHIP_DELAY_MS, fitLevel, nextPlayer, waitingOn } from '../state/turnStrip';
import type { Overlay } from '../state/ui';
import { Icon, SeatGlyph, type IconName } from './Icon';
import { PhaseTrack } from './PhaseTrack';
import styles from './TopBar.module.css';

/**
 * True once `key` has stayed the same for `delayMs` (0: at once). The "Waiting
 * for <AI>" chip uses it: AI opponents pass in a blink, so it would flicker.
 */
function useSettled(key: string, delayMs: number): boolean {
  const [settled, setSettled] = useState<string>();
  useEffect(() => {
    if (delayMs <= 0) return;
    const t = setTimeout(() => setSettled(key), delayMs);
    return () => clearTimeout(t);
  }, [key, delayMs]);
  return delayMs <= 0 || settled === key;
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
  const [level, setLevel] = useState<0 | 1 | 2>(0);

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
    const trackW = folded
      ? outer(track) - outer(folded) + outer(track.querySelector('[data-combat-run="measure"]'))
      : outer(track);
    let toolWords = 0;
    for (const w of tools.querySelectorAll('[data-tool-word]')) {
      const gap = parseFloat(getComputedStyle(w.parentElement!).columnGap) || 0;
      toolWords += outer(w) + gap;
    }
    const wordsHidden = tools.dataset.words === 'hidden';
    const toolsW = outer(tools) + (wordsHidden ? toolWords : 0);
    setLevel(fitLevel({ available, left: leftW, track: trackW, tools: toolsW, toolWords, gaps }));
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
  const active = player(game, game.turn.activePlayerId);
  const next = nextPlayer(game);
  const waiting = player(game, waitingOn(game));
  const chipShown = useSettled(waiting.id, waiting.isAi ? AI_CHIP_DELAY_MS : 0);
  const { barRef, leftRef, trackRef, toolsRef, level, measure } = useFit();
  const toggle = (o: Overlay) => setUi((u) => ({ ...u, overlay: u.overlay === o ? undefined : o }));
  const wordsHidden = level >= 1;

  // Names and step change the natural widths without resizing a constrained box: re-measure.
  const contentKey = `${active.id}|${next?.id}|${waiting.id}|${game.turn.number}|${game.turn.step}`;
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

  const whose = active.isYou ? 'Your turn' : `${active.name}'s turn`;
  const turnLine = `Turn ${game.turn.number}${next ? ` · next: ${next.isYou ? 'you' : next.name}` : ''}`;
  const chipText = waiting.isYou ? 'Waiting for you' : `Waiting for ${waiting.name}`;

  return (
    <header ref={barRef} className={styles.bar}>
      <div ref={leftRef} className={styles.turn}>
        <span className={styles.whose} title={whose}>
          <SeatGlyph seat={active.seat} /> {whose}
        </span>
        <span className={styles.turnLine} title={turnLine}>
          Turn {game.turn.number}
          {next ? (
            <>
              {' · next: '}
              <SeatGlyph seat={next.seat} /> {next.isYou ? 'you' : next.name}
            </>
          ) : null}
        </span>
        <span
          className={`${styles.chip} ${waiting.isYou ? styles.chipYou : ''} ${chipShown ? '' : styles.chipPending}`}
          role="status"
          title={chipText}
        >
          <Icon name="hourglass" /> {waiting.isYou ? null : <SeatGlyph seat={waiting.seat} />} {chipText}
        </span>
      </div>
      <PhaseTrack ref={trackRef} foldCombat={level >= 2} />
      <div className={styles.tools}>
        <div ref={toolsRef} className={styles.toolsInner} data-words={wordsHidden ? 'hidden' : 'shown'}>
          {tool('log', 'Log', 'L', ui.logOpen, () => setUi((u) => ({ ...u, logOpen: !u.logOpen })), 'Log (L)')}
          {tool('sliders', 'Display', 'D', ui.overlay === 'display', () => toggle('display'), 'Display (D)')}
          {tool('keyboard', 'Keys', '?', ui.overlay === 'shortcuts', () => toggle('shortcuts'), 'Keys (?)')}
          {tool('menu', 'Game', undefined, ui.overlay === 'menu', () => toggle('menu'), 'Game menu: concede, settings')}
        </div>
      </div>
    </header>
  );
}
