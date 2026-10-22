import { useLayoutEffect, useRef } from 'react';
import type { ChooseNPrompt } from '../../model/types';
import { useMatch } from '../../state/MatchContext';
import { Icon } from '../Icon';
import { ManaCost } from '../ManaCost';
import { anchorMenu } from './trayLogic';
import styles from './AbilityMenu.module.css';
import { t } from '../../i18n';
import { cardName } from '../../model/selectors';

/**
 * Which ability (or face) to use, anchored to its card (design pass 4 P2):
 * one row per ability with its cost symbols and text. Keys 1–9 pick a row
 * and Esc closes (handled with the tray's keys in ChoiceTray).
 */
export function AbilityMenu({ prompt }: { prompt: ChooseNPrompt }) {
  const { game, send } = useMatch();
  const ref = useRef<HTMLDivElement>(null);
  const source = prompt.sourceCardId ? game.cards[prompt.sourceCardId] : undefined;
  const answer = (optionIds: string[]) => send({ type: 'answer', promptId: prompt.id, answer: { shape: 'chooseN', optionIds } });

  // Placed imperatively: it needs its own size and the card's rect, and the
  // card can move after the menu opens (the hand re-centres, the board lays
  // itself out after paint), so it follows the card every frame while open.
  useLayoutEffect(() => {
    let frame = 0;
    let last = '';
    const place = () => {
      frame = requestAnimationFrame(place);
      const el = ref.current;
      if (!el) return;
      const anchor = prompt.sourceCardId
        ? document.querySelector(`[data-card-id="${CSS.escape(prompt.sourceCardId)}"]`)
        : null;
      const view = { w: window.innerWidth, h: window.innerHeight };
      const size = { w: el.offsetWidth, h: el.offsetHeight };
      const gap = parseFloat(getComputedStyle(document.documentElement).fontSize) * 0.5;
      const pos = anchor
        ? anchorMenu(anchor.getBoundingClientRect(), size, view, gap)
        : { left: (view.w - size.w) / 2, top: (view.h - size.h) / 2 };
      const key = `${Math.round(pos.left)},${Math.round(pos.top)}`;
      if (key === last) return;
      last = key;
      el.style.left = `${pos.left}px`;
      el.style.top = `${pos.top}px`;
      el.style.visibility = 'visible';
    };
    place();
    return () => cancelAnimationFrame(frame);
  }, [prompt.sourceCardId]);

  return (
    <div ref={ref} className={styles.menu} role="menu" aria-label={prompt.title}>
      <header className={styles.head}>
        <span className={styles.title}>{source ? cardName(source) : prompt.title}</span>
        {source ? <span className={styles.sub}>{prompt.title}</span> : null}
      </header>
      {prompt.options.map((o, i) => (
        <button key={o.id} type="button" role="menuitem" className={styles.row} onClick={() => answer([o.id])}>
          {i < 9 ? <kbd>{i + 1}</kbd> : <span />}
          <span className={styles.cost}>{o.cost ? <ManaCost cost={o.cost} /> : null}</span>
          <span className={styles.text}>
            <span>
              {o.label.split(/(\{[^}]+\})/).map((part, j) => (j % 2 ? <ManaCost key={j} cost={part} /> : part))}
            </span>
            {o.detail ? <span className={styles.detail}>{o.detail}</span> : null}
          </span>
        </button>
      ))}
      <button type="button" className={styles.cancel} onClick={() => answer([])}>
        <Icon name="close" />
        {t('common.cancel')} <kbd>{t('key.esc')}</kbd>
      </button>
    </div>
  );
}
