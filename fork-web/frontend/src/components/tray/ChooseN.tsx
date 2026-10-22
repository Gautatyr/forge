import type { CSSProperties } from 'react';
import type { ChoiceOption, ChooseNPrompt } from '../../model/types';
import { useMatch } from '../../state/MatchContext';
import { Card } from '../Card';
import { Icon } from '../Icon';
import { ManaCost } from '../ManaCost';
import type { BodyProps } from './TrayBody';
import { chosenIn, dropFromGroup, stepGroup, toggleOption } from './trayLogic';
import styles from '../ChoiceTray.module.css';

/** Choose N: a card grid, colour symbols, or chips for text options (modes, types). Keys 1–9 toggle the first nine shown. */
export function ChooseN({ prompt, draft, setDraft, groups }: BodyProps<ChooseNPrompt>) {
  const toggle = (id: string) => setDraft(toggleOption(prompt, draft, id));
  const cards = prompt.options.every((o) => o.cardId);
  if (groups.length === 0) return <p className={styles.note}>Nothing matches the filter.</p>;
  return (
    <div className={cards ? styles.options : styles.chips}>
      {groups.map(({ option: o, members }, i) =>
        cards && members.length > 1 ? (
          <GroupTile
            key={o.id}
            o={o}
            members={members}
            index={i}
            chosen={chosenIn(draft, members)}
            onStep={() => setDraft(stepGroup(prompt, draft, members))}
            onDrop={() => setDraft(dropFromGroup(draft, members))}
          />
        ) : cards ? (
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

/**
 * Identical cards (17 Swamps) as one tile: the card with a stack edge, "×17", and how many are chosen. A click chooses one
 * more, the minus takes one back; the chosen count is in the text and the accessible name, not only in the ring.
 */
function GroupTile({ o, members, index, chosen, onStep, onDrop }: { o: ChoiceOption; members: string[]; index: number; chosen: number; onStep: () => void; onDrop: () => void }) {
  const { game } = useMatch();
  const card = o.cardId ? game.cards[o.cardId] : undefined;
  const state = chosen > 0 ? `${chosen} of ${members.length} chosen` : `${members.length} cards`;
  return (
    <div className={`${styles.tile} ${chosen > 0 ? styles.tileChosen : ''}`}>
      {card ? (
        <Card
          card={card}
          context="thumb"
          count={members.length}
          style={{ '--cw': '6.6rem' } as CSSProperties}
          onActivate={onStep}
          ariaExtra={chosen > 0 ? `${chosen} chosen` : undefined}
        />
      ) : null}
      <div className={styles.groupRow}>
        <button
          type="button"
          className={`${styles.option} ${chosen > 0 ? styles.chosen : ''}`}
          aria-pressed={chosen > 0}
          aria-label={`${o.label}, ${members.length} cards, ${chosen} chosen: choose one more`}
          onClick={onStep}
        >
          <OptionKey index={index} chosen={chosen > 0} />
          <span className={styles.optionLabel}>
            {o.label} ×{members.length}
          </span>
          <span className={styles.optionDetail}>{state}</span>
        </button>
        {chosen > 0 ? (
          <button type="button" className={`${styles.option} ${styles.minus}`} aria-label={`Choose one fewer ${o.label}`} onClick={onDrop}>
            −
          </button>
        ) : null}
      </div>
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
