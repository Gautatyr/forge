import type { CSSProperties } from 'react';
import type { ChoiceOption, ChooseNPrompt, OrderPrompt } from '../model/types';
import { useMatch } from '../state/MatchContext';
import { draftFor, primaryAction } from '../state/primaryAction';
import type { ChoiceDraft } from '../state/ui';
import { Card } from './Card';
import { Icon } from './Icon';
import styles from './ChoiceTray.module.css';

/**
 * Non-modal tray for every off-board question (choose N, order, yes/no,
 * distribute, type a value). It never covers the opponents, and "Peek at
 * board" folds it away until you bring it back.
 */
export function ChoiceTray() {
  const { game, ui, setUi, send } = useMatch();
  const d = game.decision;
  if (d.kind !== 'choice') return null;
  const prompt = d.prompt;
  const draft = draftFor(prompt, ui.choiceDraft);
  const setDraft = (next: ChoiceDraft) => setUi({ choiceDraft: next });
  const action = primaryAction(game, ui);
  const source = prompt.sourceCardId ? game.cards[prompt.sourceCardId] : undefined;

  if (ui.trayPeek) {
    return (
      <div className={`${styles.tray} ${styles.peek}`} role="region" aria-label={`${prompt.title} (hidden while you look at the board)`}>
        <span className={styles.peekTitle}>
          <Icon name="hourglass" />
          {prompt.title} is waiting for you
        </span>
        <button type="button" className={styles.ghost} onClick={() => setUi({ trayPeek: false })}>
          <Icon name="eye" />
          Back to the choice <kbd>V</kbd>
        </button>
      </div>
    );
  }

  return (
    <div className={styles.tray} role="region" aria-label={prompt.title}>
      <header className={styles.head}>
        {source ? <Card card={source} context="thumb" style={{ '--cw': '2.6rem' } as CSSProperties} /> : null}
        <div className={styles.titles}>
          <h2>{prompt.title}</h2>
          <p>{prompt.instruction}</p>
        </div>
        <button type="button" className={styles.ghost} onClick={() => setUi({ trayPeek: true })}>
          <Icon name="eye" />
          Peek at board <kbd>V</kbd>
        </button>
      </header>

      <div className={styles.body}>
        {prompt.shape === 'chooseN' ? <ChooseN prompt={prompt} draft={draft} setDraft={setDraft} /> : null}
        {prompt.shape === 'order' ? <Order prompt={prompt} draft={draft} setDraft={setDraft} /> : null}
        {prompt.shape === 'yesNo' ? (
          <div className={styles.yesNo}>
            {[
              ['yes', prompt.yesLabel],
              ['no', prompt.noLabel],
            ].map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={`${styles.option} ${draft.selected[0] === id ? styles.chosen : ''}`}
                aria-pressed={draft.selected[0] === id}
                onClick={() => setDraft({ ...draft, selected: [id!] })}
              >
                {label}
              </button>
            ))}
          </div>
        ) : null}
        {prompt.shape === 'distribute' || prompt.shape === 'input' ? (
          <p className={styles.note}>This prompt shape is specified in the view-model but not drawn in the mockup yet.</p>
        ) : null}
      </div>

      <footer className={styles.foot}>
        <span className={styles.status}>{statusLine(prompt, draft)}</span>
        <button
          type="button"
          className={styles.confirm}
          disabled={!action.enabled}
          onClick={() => action.intent && send(action.intent)}
        >
          {prompt.confirmLabel} <kbd>Space</kbd>
        </button>
      </footer>
    </div>
  );
}

function statusLine(prompt: ChooseNPrompt | OrderPrompt | { shape: string }, draft: ChoiceDraft): string {
  if (prompt.shape === 'chooseN') {
    const p = prompt as ChooseNPrompt;
    const range = p.min === p.max ? `${p.max}` : p.min === 0 ? `up to ${p.max}` : `${p.min}–${p.max}`;
    return `Chosen ${draft.selected.length} of ${range}. Keys 1–9 pick options.`;
  }
  if (prompt.shape === 'order') return 'Click a card to move it between the lists. Arrows reorder.';
  return '';
}

function OptionTile({ o, index, chosen, onClick }: { o: ChoiceOption; index: number; chosen: boolean; onClick: () => void }) {
  const { game } = useMatch();
  const card = o.cardId ? game.cards[o.cardId] : undefined;
  return (
    <div className={`${styles.tile} ${chosen ? styles.tileChosen : ''}`}>
      {card ? (
        <Card card={card} context="thumb" style={{ '--cw': '6.6rem' } as CSSProperties} onActivate={onClick} ariaExtra={chosen ? 'chosen' : undefined} />
      ) : null}
      <button type="button" className={`${styles.option} ${chosen ? styles.chosen : ''}`} aria-pressed={chosen} onClick={onClick}>
        <kbd>{index + 1}</kbd>
        {chosen ? <Icon name="check" /> : null}
        <span className={styles.optionLabel}>{o.label}</span>
        {o.detail ? <span className={styles.optionDetail}>{o.detail}</span> : null}
      </button>
    </div>
  );
}

function ChooseN({ prompt, draft, setDraft }: { prompt: ChooseNPrompt; draft: ChoiceDraft; setDraft: (d: ChoiceDraft) => void }) {
  const toggle = (id: string) => {
    const has = draft.selected.includes(id);
    let selected = has ? draft.selected.filter((x) => x !== id) : [...draft.selected, id];
    if (prompt.max === 1 && !has) selected = [id];
    if (selected.length > prompt.max) return;
    setDraft({ ...draft, selected });
  };
  return (
    <div className={styles.options}>
      {prompt.options.map((o, i) => (
        <OptionTile key={o.id} o={o} index={i} chosen={draft.selected.includes(o.id)} onClick={() => toggle(o.id)} />
      ))}
    </div>
  );
}

function Order({ prompt, draft, setDraft }: { prompt: OrderPrompt; draft: ChoiceDraft; setDraft: (d: ChoiceDraft) => void }) {
  const { game } = useMatch();
  const items = new Map(prompt.lists.flatMap((l) => l.items).map((i) => [i.id, i]));
  const move = (itemId: string, from: string) => {
    const to = prompt.lists.find((l) => l.id !== from)?.id;
    if (!to) return;
    setDraft({
      ...draft,
      lists: {
        ...draft.lists,
        [from]: (draft.lists[from] ?? []).filter((x) => x !== itemId),
        [to]: [...(draft.lists[to] ?? []), itemId],
      },
    });
  };
  const shift = (listId: string, i: number, by: number) => {
    const list = [...(draft.lists[listId] ?? [])];
    const j = i + by;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j]!, list[i]!];
    setDraft({ ...draft, lists: { ...draft.lists, [listId]: list } });
  };
  return (
    <div className={styles.lists}>
      {prompt.lists.map((l) => {
        const ids = draft.lists[l.id] ?? [];
        return (
          <section key={l.id} className={styles.list} aria-label={l.label}>
            <h3>
              {l.label} <span>{l.hint}</span>
            </h3>
            <div className={styles.listCards}>
              {ids.length === 0 ? <p className={styles.empty}>Empty — click a card on the other side to move it here.</p> : null}
              {ids.map((id, i) => {
                const o = items.get(id)!;
                const card = o.cardId ? game.cards[o.cardId] : undefined;
                const other = prompt.lists.find((x) => x.id !== l.id)!;
                return (
                  <div key={id} className={styles.orderItem}>
                    {card ? <Card card={card} context="thumb" style={{ '--cw': '6.6rem' } as CSSProperties} onActivate={() => move(id, l.id)} /> : null}
                    <div className={styles.orderControls}>
                      <button type="button" onClick={() => shift(l.id, i, -1)} disabled={i === 0} aria-label={`Move ${o.label} left`}>
                        ◀
                      </button>
                      <button type="button" className={styles.moveBtn} onClick={() => move(id, l.id)}>
                        To {other.label.split(' ')[0]?.toLowerCase()}
                      </button>
                      <button type="button" onClick={() => shift(l.id, i, 1)} disabled={i === ids.length - 1} aria-label={`Move ${o.label} right`}>
                        ▶
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
