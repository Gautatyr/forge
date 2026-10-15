import { useId, useRef, useState, type KeyboardEvent } from 'react';
import type { CardNameOption, InputPrompt } from '../../model/types';
import { ManaCost } from '../ManaCost';
import { useOpenFocus, useSubmit } from './NumberField';
import { exactName, inputStart, suggestNames } from './numberLogic';
import type { BodyProps } from './TrayBody';
import styles from './NumberShapes.module.css';

/**
 * Name a card: a field with up to 8 suggestions (cost and type line). The
 * highlighted suggestion shows its preview; ↑/↓ move, Enter picks, Enter on an
 * exact name confirms. The engine's constraint sits under the field.
 */
export function NameCard(props: BodyProps<InputPrompt>) {
  const { prompt, draft, setDraft } = props;
  const names = prompt.cardNames ?? [];
  const text = draft.selected[0] ?? inputStart(prompt);
  const [hi, setHi] = useState(0);
  const [open, setOpen] = useState(true);
  const list = open ? suggestNames(names, text) : [];
  const at = Math.min(hi, list.length - 1);
  const exact = exactName(names, text);
  const shown = list[at] ?? exact;
  const submit = useSubmit(props, text);
  const field = useOpenFocus();
  const listId = useId();
  const listRef = useRef<HTMLUListElement>(null);

  const type = (t: string) => {
    setDraft({ ...draft, selected: [t] });
    setHi(0);
    setOpen(true);
  };
  const pick = (n: CardNameOption) => {
    setDraft({ ...draft, selected: [n.name] });
    setOpen(false);
    field.current?.focus();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && list.length) {
      e.preventDefault();
      const next = (at + (e.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length;
      setHi(next);
      // Keep it in view when the tray body scrolls (small screens).
      listRef.current?.children[next]?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const h = list[at];
      if (h && h.name !== text) pick(h);
      else submit();
    } else if (e.key === 'Escape' && list.length) {
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
    }
  };

  return (
    <div className={styles.nameCard}>
      <div className={styles.nameMain}>
        <input
          ref={field}
          type="text"
          role="combobox"
          autoComplete="off"
          spellCheck={false}
          className={styles.textInput}
          value={text}
          placeholder="Type a card name"
          onChange={(e) => type(e.target.value)}
          onKeyDown={onKey}
          aria-label={prompt.title}
          aria-autocomplete="list"
          aria-expanded={list.length > 0}
          aria-controls={listId}
          aria-activedescendant={list.length ? `${listId}-${at}` : undefined}
        />
        {prompt.constraint ? <p className={styles.constraint}>{prompt.constraint}</p> : null}
        {list.length ? (
          <ul ref={listRef} id={listId} role="listbox" className={styles.suggestions} aria-label="Card names">
            {list.map((n, i) => (
              <li
                key={n.name}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === at}
                className={`${styles.suggestion} ${i === at ? styles.highlighted : ''}`}
                onMouseEnter={() => setHi(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(n)}
              >
                <span className={styles.suggestionName}>{n.name}</span>
                <ManaCost cost={n.manaCost} />
                <span className={styles.suggestionType}>{n.typeLine}</span>
              </li>
            ))}
          </ul>
        ) : text.trim() && !exact ? (
          <p className={styles.constraint}>No card name matches.</p>
        ) : null}
      </div>
      <div className={styles.preview}>
        {shown?.image ? <img src={shown.image.normal} alt={shown.name} className={styles.previewImg} /> : null}
      </div>
    </div>
  );
}
