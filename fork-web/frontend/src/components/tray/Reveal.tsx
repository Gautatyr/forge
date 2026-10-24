import type { ChooseNPrompt } from '../../model/types';
import { useMatch } from '../../state/MatchContext';
import { Card } from '../Card';
import { RevealList } from './CompactList';
import type { BodyProps } from './TrayBody';
import styles from '../ChoiceTray.module.css';

/** Reveal / look: the cards at hand size, each with the hover preview; the footer's OK answers. */
export function Reveal(props: BodyProps<ChooseNPrompt>) {
  const { prompt, compact } = props;
  const { game } = useMatch();
  if (compact) return <RevealList {...props} />;
  return (
    <div className={styles.options}>
      {prompt.options.map((o) => {
        const card = o.cardId ? game.cards[o.cardId] : undefined;
        return card ? (
          <Card key={o.id} card={card} context="thumb" className={styles.handSize} onActivate={() => undefined} />
        ) : (
          <span key={o.id} className={styles.option}>
            {o.label}
          </span>
        );
      })}
    </div>
  );
}
