import { useEffect, useEffectEvent, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { opponents, player } from '../model/selectors';
import type { ChoicePrompt } from '../model/types';
import { useMatch } from '../state/MatchContext';
import type { ChoiceDraft } from '../state/ui';
import { Card } from './Card';
import { Icon, SeatGlyph } from './Icon';
import { AbilityMenu } from './tray/AbilityMenu';
import { TrayBody } from './tray/TrayBody';
import {
  counterText,
  FILTER_FROM,
  groupOptions,
  inPlaceRefs,
  initialDraft,
  isAbilityMenu,
  isReveal,
  keyAction,
  trayConfirm,
  trayDraft,
  visibleOptions,
} from './tray/trayLogic';
import styles from './ChoiceTray.module.css';
import { t } from '../i18n';

/**
 * Every question the engine asks outside targeting and combat (design pass 4
 * §2.2). Non-modal and over your board only. Three presentations:
 * - the tray (choose N, yes/no, order, reveal, and the number shapes of #31);
 * - a one-line bar when the options are picked in place on the board;
 * - the ability menu, anchored to its card.
 */
export function ChoiceTray() {
  const { game } = useMatch();
  const d = game.decision;
  if (d.kind !== 'choice') return null;
  return <PromptView key={d.prompt.id} prompt={d.prompt} />;
}

function PromptView({ prompt }: { prompt: ChoicePrompt }) {
  const { game, ui, prefs, setUi, send } = useMatch();
  const [query, setQuery] = useState('');
  const draft = trayDraft(prompt, ui.choiceDraft);
  const setDraft = (next: ChoiceDraft) => setUi({ choiceDraft: next });
  const confirm = trayConfirm(prompt, draft);
  const answer = () => confirm.answer && send({ type: 'answer', promptId: prompt.id, answer: confirm.answer });
  const refs = inPlaceRefs(game, prompt);
  const mode = isAbilityMenu(prompt) ? 'menu' : refs ? 'inPlace' : ui.trayPeek ? 'peek' : 'tray';
  // The tray may grow to the height of your board (the opponents keep theirs).
  const yourShare = opponents(game).length === 1 ? 50 : 100 - prefs.opponentShare;
  const barRef = useRef<HTMLDivElement>(null);
  const trayRef = useRef<HTMLDivElement>(null);

  // The in-place bar sits at the bottom centre of your board; when that covers
  // an option, it takes the corner of your board that covers the fewest.
  useLayoutEffect(() => {
    const el = barRef.current;
    const area = el?.offsetParent;
    if (!el || !refs || !(area instanceof HTMLElement)) return;
    const covered = () => {
      const b = el.getBoundingClientRect();
      const opts = [
        ...[...refs.cards.keys()].flatMap((id) => [...area.querySelectorAll(`[data-card-id="${CSS.escape(id)}"]`)]),
        ...[...refs.players.keys()].flatMap((id) => [...area.querySelectorAll(`[data-player-id="${CSS.escape(id)}"]`)]),
      ];
      return opts.filter((o) => {
        const r = o.getBoundingClientRect();
        return r.bottom > b.top && r.top < b.bottom && r.right > b.left && r.left < b.right;
      }).length;
    };
    const set = (s: Partial<Record<'top' | 'bottom' | 'left' | 'right' | 'transform', string>>) => {
      el.style.top = s.top ?? '';
      el.style.bottom = s.bottom ?? '';
      el.style.left = s.left ?? '';
      el.style.right = s.right ?? '';
      el.style.transform = s.transform ?? '';
    };
    let frame = 0;
    // Every frame while open: the board lays itself out after paint and reflows.
    const place = () => {
      frame = requestAnimationFrame(place);
      set({});
      if (covered() === 0) return;
      const gap = `${area.clientHeight - el.offsetTop - el.offsetHeight}px`;
      const top = { top: `calc(${100 - yourShare}% + ${gap})`, bottom: 'auto' };
      const right = { left: 'auto', right: gap, transform: 'none' };
      const left = { left: gap, transform: 'none' };
      // Bottom centre first, then the other corners of your board: the first that covers the fewest options.
      const spots = [{}, top, right, { ...top, ...right }, left, { ...top, ...left }];
      let best = spots[0]!;
      let fewest = Infinity;
      for (const s of spots) {
        set(s);
        const n = covered();
        if (n < fewest) [best, fewest] = [s, n];
        if (n === 0) break;
      }
      set(best);
    };
    place();
    return () => cancelAnimationFrame(frame);
  });

  // The tray keeps the cards the prompt is about (its source, the sources of the triggers to order, listed
  // permanents) in view: when its usual place over your board covers one, it docks over the hand instead (CSS
  // `data-dock`), or to a side; Peek still shows everything.
  useLayoutEffect(() => {
    const el = trayRef.current;
    const area = el?.offsetParent;
    if (!el || !(area instanceof HTMLElement)) return;
    const ids = new Set<string>();
    if (prompt.sourceCardId) ids.add(prompt.sourceCardId);
    const lists = prompt.shape === 'order' ? prompt.lists.map((l) => l.items) : prompt.shape === 'chooseN' ? [prompt.options] : [];
    for (const o of lists.flat()) if (o.cardId) ids.add(o.cardId);
    const onBoard = [...ids].filter((id) => game.cards[id]?.zone === 'battlefield');
    if (onBoard.length === 0) return;
    // The listed cards the tray overlaps now.
    const hits = () => {
      const b = el.getBoundingClientRect();
      return onBoard.flatMap((id) =>
        [...area.querySelectorAll(`[data-card-id="${CSS.escape(id)}"]`)]
          .filter((c) => !el.contains(c))
          .map((c) => c.getBoundingClientRect())
          .filter((r) => r.bottom > b.top && r.top < b.bottom && r.right > b.left && r.left < b.right),
      );
    };
    const covered = () => hits().length;
    // Over the hand the tray may be a little too tall to clear the lowest card above it: cap its height there
    // (its body scrolls) when that still leaves a usable tray.
    const MIN_DOCKED = 260;
    const capAboveCards = () => {
      const h = hits();
      if (h.length === 0) return;
      const room = el.getBoundingClientRect().bottom - Math.max(...h.map((r) => r.bottom)) - 2;
      if (room >= MIN_DOCKED) el.style.maxHeight = `${room}px`;
    };
    let frame = 0;
    // Every frame while open: the board lays itself out after paint and reflows.
    const place = () => {
      frame = requestAnimationFrame(place);
      delete el.dataset.dock;
      el.style.maxHeight = '';
      let fewest = covered();
      if (fewest === 0) return;
      let best = '';
      let bestCap = '';
      // Over the hand first, then the sides of the board column; uncapped first, then capped: the first that
      // covers none, else the one that covers the fewest.
      outer: for (const capped of [false, true]) {
        for (const dock of ['hand', 'handRight', 'handLeft', 'right', 'left']) {
          if (capped && !dock.startsWith('hand')) continue;
          el.dataset.dock = dock;
          el.style.maxHeight = '';
          if (capped) capAboveCards();
          const n = covered();
          if (n < fewest) [best, bestCap, fewest] = [dock, el.style.maxHeight, n];
          if (n === 0) break outer;
        }
      }
      if (best) {
        el.dataset.dock = best;
        el.style.maxHeight = bestCap;
      } else {
        delete el.dataset.dock;
        el.style.maxHeight = '';
      }
    };
    place();
    return () => {
      cancelAnimationFrame(frame);
      delete el.dataset.dock;
      el.style.maxHeight = '';
    };
  });
  const filterable = prompt.shape === 'chooseN' && prompt.options.length > FILTER_FROM;
  const matching =
    prompt.shape === 'chooseN' && mode === 'tray'
      ? visibleOptions(prompt.options, filterable ? query : '', (id) => game.cards[id]?.front.typeLine)
      : [];
  // Identical cards (17 Swamps of a library search) are one tile with a count; digit keys name the tiles.
  const groups = groupOptions(matching, (id) => game.cards[id]?.name);
  const visible = groups.map((g) => g.option);
  const groupMembers = new Map(groups.map((g) => [g.option.id, g.members]));

  // Store the starting draft so the main button (primaryAction) answers the
  // engine's default too, e.g. a yes/no whose default is "no".
  const stored = ui.choiceDraft?.promptId === prompt.id;
  useEffect(() => {
    if (!stored) setUi({ choiceDraft: initialDraft(prompt) });
  }, [stored, prompt, setUi]);

  // Capture phase, so the prompt's keys win over the screen's shortcuts.
  const onKey = useEffectEvent((e: KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey || ui.inspectId || ui.overlay) return;
    const el = e.target as HTMLElement | null;
    const inInput = !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT');
    const a = keyAction(prompt, draft, visible, { key: e.key, alt: e.altKey, inInput }, groupMembers);
    if (!a || (a.kind === 'peek' && mode !== 'tray' && mode !== 'peek')) return;
    e.preventDefault();
    e.stopPropagation();
    if (a.kind === 'answer') send({ type: 'answer', promptId: prompt.id, answer: a.answer });
    else if (a.kind === 'draft') setDraft(a.draft);
    else setUi((u) => ({ ...u, trayPeek: !u.trayPeek }));
  });
  useEffect(() => {
    const h = (e: KeyboardEvent) => onKey(e);
    window.addEventListener('keydown', h, true);
    return () => window.removeEventListener('keydown', h, true);
  }, []);

  if (mode === 'menu' && prompt.shape === 'chooseN') return <AbilityMenu prompt={prompt} />;

  const counter = prompt.shape === 'chooseN' && !isReveal(prompt) ? counterText(prompt, draft.selected.length) : '';
  const confirmButton = (
    <button type="button" className={styles.confirm} disabled={!confirm.enabled} onClick={answer}>
      {confirm.label}
      {confirm.enabled ? <kbd>{t('key.space')}</kbd> : null}
    </button>
  );

  if (mode === 'inPlace') {
    return (
      <div ref={barRef} className={`${styles.tray} ${styles.bar}`} role="region" aria-label={prompt.title}>
        <h2 className={styles.barTitle}>{prompt.title}</h2>
        <span className={styles.status}>{counter}</span>
        {confirmButton}
      </div>
    );
  }

  if (mode === 'peek') {
    return (
      <div className={`${styles.tray} ${styles.peek}`} role="region" aria-label={t('tray.peekAria', { title: prompt.title })}>
        <span className={styles.peekTitle}>
          <Icon name="hourglass" />
          {t('tray.waiting', { title: prompt.title })}
        </span>
        <button type="button" className={styles.ghost} onClick={() => setUi({ trayPeek: false })}>
          <Icon name="eye" />
          {t('tray.back')} <kbd>V</kbd>
        </button>
      </div>
    );
  }

  const source = prompt.sourceCardId ? game.cards[prompt.sourceCardId] : undefined;
  const by = prompt.byPlayerId ? player(game, prompt.byPlayerId) : undefined;
  const footer =
    prompt.shape === 'yesNo' ? null : (
      <footer className={styles.foot}>
        <span className={styles.status}>
          {counter || (prompt.shape === 'order' && prompt.lists.length > 1 ? t('tray.orderHint') : '')}
        </span>
        {confirmButton}
      </footer>
    );

  return (
    <div ref={trayRef} className={`${styles.tray} ${prompt.shape === 'order' ? styles.narrow : ''}`} role="region" aria-label={prompt.title} style={{ '--tray-max': `${yourShare}%` } as CSSProperties}>
      <header className={styles.head}>
        {source ? <Card card={source} context="thumb" style={{ '--cw': '2.6rem' } as CSSProperties} /> : null}
        <div className={styles.titles}>
          <h2>
            {by ? (
              <span className={styles.byGlyph}>
                <SeatGlyph seat={by.seat} />
              </span>
            ) : null}
            {prompt.title}
          </h2>
          {prompt.instruction ? <p>{prompt.instruction}</p> : null}
        </div>
        <button type="button" className={styles.ghost} onClick={() => setUi({ trayPeek: true })}>
          <Icon name="eye" />
          {t('tray.peek')} <kbd>V</kbd>
        </button>
      </header>

      {filterable ? (
        <div className={styles.filter}>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('tray.filter')}
            aria-label={t('tray.filter')}
          />
        </div>
      ) : null}

      <div className={styles.body}>
        <TrayBody prompt={prompt} draft={draft} setDraft={setDraft} visible={visible} groups={groups} send={send} />
      </div>

      {footer}
    </div>
  );
}
