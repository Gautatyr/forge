import type { CSSProperties } from 'react';
import type { ChoiceOption, ChooseNPrompt } from '../../model/types';
import { useMatch } from '../../state/MatchContext';
import { Card } from '../Card';
import { Icon } from '../Icon';
import { ManaCost } from '../ManaCost';
import type { BodyProps } from './TrayBody';
import { toggleOption } from './trayLogic';
import styles from '../ChoiceTray.module.css';

/** Choose N: a card grid, colour symbols, or chips for text options (modes, types). Keys 1–9 toggle the first nine shown. */
export function ChooseN({ prompt, draft, setDraft, visible }: BodyProps<ChooseNPrompt>) {
  const toggle = (id: string) => setDraft(toggleOption(prompt, draft, id));
  const cards = prompt.options.every((o) => o.cardId);
  if (visible.length === 0) return <p className={styles.note}>Nothing matches the filter.</p>;
  return (
    <div className={cards ? styles.options : styles.chips}>
      {visible.map((o, i) =>
        cards ? (
          <CardTile key={o.id} o={o} index={i} chosen={draft.selected.includes(o.id)} onClick={() => toggle(o.id)} />
        ) : (
          <Chip key={o.id} o={o} index={i} chosen={draft.selected.includes(o.id)} onClick={() => toggle(o.id)} />
        ),
      )}
    </div>
  );
}

interface OptionProps {
  o: ChoiceOption;
  index: number;
  chosen: boolean;
  onClick: () => void;
}

function OptionKey({ index, chosen }: { index: number; chosen: boolean }) {
  return (
    <>
      {index < 9 ? <kbd>{index + 1}</kbd> : null}
      {chosen ? <Icon name="check" /> : null}
    </>
  );
}

function CardTile({ o, index, chosen, onClick }: OptionProps) {
  const { game } = useMatch();
  const card = o.cardId ? game.cards[o.cardId] : undefined;
  return (
    <div className={`${styles.tile} ${chosen ? styles.tileChosen : ''}`}>
      {card ? (
        <Card card={card} context="thumb" style={{ '--cw': '6.6rem' } as CSSProperties} onActivate={onClick} ariaExtra={chosen ? 'chosen' : undefined} />
      ) : null}
      <button type="button" className={`${styles.option} ${chosen ? styles.chosen : ''}`} aria-pressed={chosen} onClick={onClick}>
        <OptionKey index={index} chosen={chosen} />
        <span className={styles.optionLabel}>{o.label}</span>
        {o.detail ? <span className={styles.optionDetail}>{o.detail}</span> : null}
      </button>
    </div>
  );
}

/** Text option: never truncated, wraps onto as many lines as it needs. */
function Chip({ o, index, chosen, onClick }: OptionProps) {
  return (
    <button type="button" className={`${styles.option} ${styles.chip} ${chosen ? styles.chosen : ''}`} aria-pressed={chosen} onClick={onClick}>
      <OptionKey index={index} chosen={chosen} />
      {o.symbol ? <ManaCost cost={o.symbol} /> : null}
      <span className={styles.chipText}>
        <span className={styles.optionLabel}>{o.label}</span>
        {o.detail ? <span className={styles.optionDetail}>{o.detail}</span> : null}
      </span>
    </button>
  );
}
