import type { YesNoPrompt } from '../../model/types';
import { useMatch } from '../../state/MatchContext';
import { Card } from '../Card';
import type { BodyProps } from './TrayBody';
import styles from '../ChoiceTray.module.css';

/** Two buttons with the engine's labels; the default is primary and answers Space. Y / N answer at once. */
export function YesNo({ prompt, send }: BodyProps<YesNoPrompt>) {
  const { game } = useMatch();
  const card = prompt.cardId ? game.cards[prompt.cardId] : undefined;
  const def = prompt.defaultAnswer ?? 'yes';
  const buttons = [
    { yes: true, label: prompt.yesLabel, key: 'Y' },
    { yes: false, label: prompt.noLabel, key: 'N' },
  ];
  return (
    <div className={styles.yesNo}>
      {card ? <Card card={card} context="thumb" className={styles.handSize} /> : null}
      <div className={styles.yesNoButtons}>
        {buttons.map((b) => {
          const primary = (def === 'yes') === b.yes;
          return (
            <button
              key={b.key}
              type="button"
              className={primary ? styles.confirm : styles.secondary}
              onClick={() => send({ type: 'answer', promptId: prompt.id, answer: { shape: 'yesNo', yes: b.yes } })}
            >
              {b.label}
              <kbd>{b.key}</kbd>
              {primary ? <kbd>Space</kbd> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
