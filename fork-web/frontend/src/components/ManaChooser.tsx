import { Fragment, useEffect, useLayoutEffect, useRef } from 'react';
import type { GameView, ManaColour } from '../model/types';
import { useMatch } from '../state/MatchContext';
import type { UiState } from '../state/ui';
import { ManaSymbol } from './ManaSymbol';
import styles from './ManaChooser.module.css';
import { t } from '../i18n';

/** The open chooser, if the game still offers that source (it closes itself when the decision moves on). */
export function liveManaChoice(game: GameView, ui: UiState): UiState['manaChoice'] {
  const choice = ui.manaChoice;
  if (!choice) return undefined;
  const d = game.decision;
  const offered = d.kind === 'payMana' ? d.sources : d.kind === 'priority' ? (d.manaSources ?? []) : [];
  const source = offered.find((s) => s.cardId === choice.cardId);
  return source && source.colours.length > 1 ? { cardId: source.cardId, colours: source.colours } : undefined;
}

/**
 * "Add {G} · Add {W}" at a land that adds two or more colours (design pass 4,
 * §2.1). Keys 1, 2… pick (MatchScreen); Esc or a click elsewhere closes it.
 */
export function ManaChooser() {
  const { game, ui, setUi, send } = useMatch();
  const choice = liveManaChoice(game, ui);
  const ref = useRef<HTMLDivElement>(null);

  // Anchor above the card (below it when the card is near the top of the screen).
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !choice) return;
    const card = document.querySelector(`[data-card-id="${CSS.escape(choice.cardId)}"]`);
    if (!card) return;
    const r = card.getBoundingClientRect();
    const h = el.offsetHeight;
    const gap = 8;
    const above = r.top - h - gap > 0;
    const w = el.offsetWidth;
    const left = Math.min(Math.max(gap, r.left + r.width / 2 - w / 2), window.innerWidth - w - gap);
    el.style.left = `${left}px`;
    el.style.top = `${above ? r.top - h - gap : r.bottom + gap}px`;
  });

  useEffect(() => {
    if (!choice) return;
    const close = (e: PointerEvent) => {
      if (ref.current?.contains(e.target as Node)) return;
      setUi({ manaChoice: undefined });
    };
    window.addEventListener('pointerdown', close, true);
    return () => window.removeEventListener('pointerdown', close, true);
  }, [choice, setUi]);

  if (!choice) return null;
  const name = game.cards[choice.cardId]?.name ?? t('mana.thisLand');
  const pick = (colour: ManaColour) => {
    setUi({ manaChoice: undefined });
    send({ type: 'tapForMana', cardId: choice.cardId, colour });
  };
  return (
    <div ref={ref} className={styles.chooser} role="menu" aria-label={t('mana.chooserAria', { name })}>
      {choice.colours.map((c, i) => (
        <Fragment key={c}>
          {i > 0 ? (
            <span className={styles.sep} aria-hidden>
              ·
            </span>
          ) : null}
          <button type="button" role="menuitem" className={styles.option} onClick={() => pick(c)}>
            {t('mana.add')} <ManaSymbol symbol={c} />
            {i < 9 ? <kbd>{i + 1}</kbd> : null}
          </button>
        </Fragment>
      ))}
    </div>
  );
}
