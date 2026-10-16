import { useMatch } from '../state/MatchContext';
import { logParts } from './logParts';
import { ManaSymbol } from './ManaSymbol';
import styles from './LogText.module.css';

/** Renders log text; {card:<id>} tokens become hoverable card names, {R} / {2} mana symbols. */
export function LogText({ text }: { text: string }) {
  const { game, setUi } = useMatch();
  return (
    <>
      {logParts(text).map((part) => {
        if (part.kind === 'text') return part.text;
        if (part.kind === 'mana') {
          return (
            <span key={part.at} className={styles.mana}>
              <ManaSymbol symbol={part.symbol} />
            </span>
          );
        }
        const id = part.id;
        const c = game.cards[id];
        const name = c?.name ?? 'a card';
        const show = () => {
          if (c) setUi({ hover: { cardId: id } });
        };
        return c ? (
          <button
            key={part.at}
            type="button"
            className={styles.ref}
            onPointerEnter={show}
            onPointerLeave={() => setUi({ hover: undefined })}
            onClick={() => setUi({ inspectId: id, hover: undefined })}
            title="Hover to see the card, click to inspect"
          >
            {name}
          </button>
        ) : (
          <span key={part.at}>{name}</span>
        );
      })}
    </>
  );
}
