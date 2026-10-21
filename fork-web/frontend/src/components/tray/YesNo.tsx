import type { YesNoPrompt } from '../../model/types';
import { useMatch } from '../../state/MatchContext';
import { Card } from '../Card';
import { PlayerText } from '../PlayerText';
import type { BodyProps } from './TrayBody';
import { yesNoKeys } from './trayLogic';
import styles from '../ChoiceTray.module.css';

/** Two buttons with the engine's labels; the default is primary and answers Space. Y / N (or the prompt's own keys) answer at once. */
export function YesNo({ prompt, send }: BodyProps<YesNoPrompt>) {
  const { game } = useMatch();
  const card = prompt.cardId ? game.cards[prompt.cardId] : undefined;
  const def = prompt.defaultAnswer ?? 'yes';
  const keys = yesNoKeys(prompt);
  const buttons = [
    { yes: true, label: prompt.yesLabel, key: keys.yes },
    { yes: false, label: prompt.noLabel, key: keys.no },
  ];
  return (
    <div className={styles.yesNo}>
      {card ? <Card card={card} context="thumb" className={styles.handSize} /> : null}
      <div className={styles.yesNoButtons}>
        {buttons.map((b) => {
          const primary = (def === 'yes') === b.yes;
          return (
            <button
              key={String(b.yes)}
              type="button"
              className={primary ? styles.confirm : styles.secondary}
              onClick={() => send({ type: 'answer', promptId: prompt.id, answer: { shape: 'yesNo', yes: b.yes } })}
            >
              <PlayerText game={game} text={b.label} />
              {b.key ? <kbd>{b.key}</kbd> : null}
              {primary ? <kbd>Space</kbd> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
