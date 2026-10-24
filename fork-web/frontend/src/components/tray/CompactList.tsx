import type { ReactNode } from 'react';
import type { ChoiceOption, ChooseNPrompt, OrderPrompt } from '../../model/types';
import { useMatch } from '../../state/MatchContext';
import { Icon } from '../Icon';
import { useCardHover } from '../useCardHover';
import type { BodyProps } from './TrayBody';
import { chosenIn, dropFromGroup, listHint, moveBetween, moveItem, moveLabel, stepGroup, toggleOption } from './trayLogic';
import styles from '../ChoiceTray.module.css';
import { t } from '../../i18n';

/*
 * The compact list (owner ruling 2026-10-24, #140): when the card tiles cannot fit with their labels and key hints even
 * at the smallest size (tileFit.ts), each choice is one row (name, key hint, state) and hovering a row shows the card
 * preview, as hovering a tile does. Same drafts, keys 1-9 and answers as the tiles.
 */

/** A row standing for a card: hovering or focusing it shows the card's preview; the right click inspects it. */
function CardRow({ cardId, className, children }: { cardId?: string; className?: string; children: ReactNode }) {
  const hover = useCardHover(cardId ?? '');
  const { setUi } = useMatch();
  return (
    <li
      className={className}
      data-list-row=""
      data-card-id={cardId}
      {...(cardId ? hover : {})}
      onContextMenu={
        cardId
          ? (e) => {
              e.preventDefault();
              setUi({ inspectId: cardId, hover: undefined });
            }
          : undefined
      }
    >
      {children}
    </li>
  );
}

function RowKey({ index, chosen }: { index: number; chosen: boolean }) {
  return (
    <>
      {index < 9 ? <kbd>{index + 1}</kbd> : null}
      {chosen ? <Icon name="check" /> : null}
    </>
  );
}

/** Choose N over cards: one row per card (identical cards one row with a count, the minus takes one back). */
export function PickList({ prompt, draft, setDraft, groups }: BodyProps<ChooseNPrompt>) {
  return (
    <ul className={styles.compactList}>
      {groups.map(({ option: o, members }, i) => {
        const group = members.length > 1;
        const chosen = chosenIn(draft, members);
        const on = chosen > 0;
        const click = () => setDraft(group ? stepGroup(prompt, draft, members) : toggleOption(prompt, draft, o.id));
        const state = group ? (on ? t('tray.groupChosen', { chosen, total: members.length }) : t('tray.groupCards', { count: members.length })) : o.detail;
        return (
          <CardRow key={o.id} cardId={o.cardId} className={styles.listItem}>
            <button
              type="button"
              className={`${styles.option} ${styles.listRow} ${on ? styles.chosen : ''}`}
              aria-pressed={on}
              aria-label={group ? t('tray.groupAria', { label: o.label, total: members.length, chosen }) : undefined}
              onClick={click}
            >
              <RowKey index={i} chosen={on} />
              <span className={styles.optionLabel}>{group ? `${o.label} ×${members.length}` : o.label}</span>
              {state ? <span className={styles.optionDetail}>{state}</span> : null}
            </button>
            {group && on ? (
              <button type="button" className={`${styles.option} ${styles.minus}`} aria-label={t('tray.fewer', { label: o.label })} onClick={() => setDraft(dropFromGroup(draft, members))}>
                −
              </button>
            ) : null}
          </CardRow>
        );
      })}
    </ul>
  );
}

/** Reveal / look: one row per card, the name; the preview shows on hover and the footer's OK answers. */
export function RevealList({ prompt }: BodyProps<ChooseNPrompt>) {
  return (
    <ul className={styles.compactList}>
      {prompt.options.map((o: ChoiceOption) => (
        <CardRow key={o.id} cardId={o.cardId} className={`${styles.row} ${styles.listItem}`}>
          <span className={styles.rowText} tabIndex={0}>
            <span className={styles.optionLabel}>{o.label}</span>
            {o.detail ? <span className={styles.optionDetail}>{o.detail}</span> : null}
          </span>
        </CardRow>
      ))}
    </ul>
  );
}

/** Scry and surveil: the two piles side by side, one row per card with its move buttons. */
export function PileLists({ prompt, draft, setDraft }: BodyProps<OrderPrompt>) {
  const items = new Map(prompt.lists.flatMap((l) => l.items).map((i) => [i.id, i]));
  return (
    <div className={styles.lists}>
      {prompt.lists.map((l) => {
        const ids = draft.lists[l.id] ?? [];
        const other = prompt.lists.find((x) => x.id !== l.id)!;
        return (
          <section key={l.id} className={styles.list} aria-label={l.label}>
            <h3>
              {l.label} <span>{listHint(l.hint)}</span>
            </h3>
            {ids.length === 0 ? <p className={styles.empty}>{t('tray.emptyList')}</p> : null}
            <ol className={styles.compactPile}>
              {ids.map((id, i) => {
                const o = items.get(id)!;
                const move = () => setDraft(moveBetween(draft, id, l.id, other.id));
                return (
                  <CardRow key={id} cardId={o.cardId} className={`${styles.row} ${styles.listItem}`}>
                    <span className={styles.rowIndex}>{i + 1}</span>
                    <span className={styles.rowText}>
                      <span className={styles.optionLabel}>{o.label}</span>
                      {o.detail ? <span className={styles.optionDetail}>{o.detail}</span> : null}
                    </span>
                    <span className={styles.orderControls}>
                      <button type="button" onClick={() => setDraft(moveItem(draft, l.id, i, -1))} disabled={i === 0} aria-label={t('tray.moveUp', { label: o.label })}>
                        ↑
                      </button>
                      <button type="button" className={styles.moveBtn} onClick={move}>
                        {moveLabel(other)}
                      </button>
                      <button
                        type="button"
                        onClick={() => setDraft(moveItem(draft, l.id, i, 1))}
                        disabled={i === ids.length - 1}
                        aria-label={t('tray.moveDown', { label: o.label })}
                      >
                        ↓
                      </button>
                    </span>
                  </CardRow>
                );
              })}
            </ol>
          </section>
        );
      })}
    </div>
  );
}
