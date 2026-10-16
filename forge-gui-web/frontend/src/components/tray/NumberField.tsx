import { useEffect, useRef, type KeyboardEvent } from 'react';
import type { InputPrompt } from '../../model/types';
import { useMatch } from '../../state/MatchContext';
import { inputConfirm, inputStart, rangeText, stepNumber } from './numberLogic';
import type { BodyProps } from './TrayBody';
import styles from './NumberShapes.module.css';

/** Focus the field when the prompt opens, its text selected so typing replaces it. */
export function useOpenFocus<T extends HTMLInputElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
    ref.current?.select();
  }, []);
  return ref;
}

/** The answer for the field's text, sent when the confirm would be enabled. */
export function useSubmit({ prompt, send }: Pick<BodyProps<InputPrompt>, 'prompt' | 'send'>, text: string) {
  const c = inputConfirm(prompt, text);
  return () => {
    if (c.enabled && c.answer) send({ type: 'answer', promptId: prompt.id, answer: c.answer });
  };
}

const plain = (e: KeyboardEvent) => !e.altKey && !e.ctrlKey && !e.metaKey;

/**
 * Number (X): a stepper and a typed field with the range shown; opens on the
 * engine's default. ↑/↓ ±1, Shift+↑/↓ ±5, Enter or Space confirms, V peeks.
 */
export function NumberField(props: BodyProps<InputPrompt>) {
  const { prompt, draft, setDraft } = props;
  const { setUi } = useMatch();
  const text = draft.selected[0] ?? inputStart(prompt);
  const set = (t: string) => setDraft({ ...draft, selected: [t] });
  const submit = useSubmit(props, text);
  const field = useOpenFocus();
  const negative = (prompt.min ?? 0) < 0;

  const onKey = (e: KeyboardEvent) => {
    if (!plain(e)) return;
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      set(stepNumber(prompt, text, (e.key === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 5 : 1)));
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      submit();
    } else if (e.key.toLowerCase() === 'v') {
      e.preventDefault();
      setUi({ trayPeek: true });
    }
  };
  const down = stepNumber(prompt, text, -1);
  const up = stepNumber(prompt, text, 1);

  return (
    <div className={styles.number}>
      <span className={styles.stepper}>
        <button type="button" tabIndex={-1} disabled={down === text} onClick={() => set(down)} aria-label="One less">
          −
        </button>
        <input
          ref={field}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          className={styles.numberInput}
          value={text}
          onChange={(e) => set(e.target.value.replace(negative ? /[^\d-]/g : /\D/g, ''))}
          onKeyDown={onKey}
          aria-label={`${prompt.title}, ${rangeText(prompt)}`}
        />
        <button type="button" tabIndex={-1} disabled={up === text} onClick={() => set(up)} aria-label="One more">
          +
        </button>
      </span>
      <span className={styles.range}>{rangeText(prompt)}</span>
      <span className={styles.keys}>
        <kbd>↑</kbd> / <kbd>↓</kbd> ±1 · <kbd>Shift</kbd> + <kbd>↑</kbd> / <kbd>↓</kbd> ±5 · <kbd>Enter</kbd> confirms
      </span>
    </div>
  );
}

/** Free text (the engine's text input): Enter confirms. */
export function TextField(props: BodyProps<InputPrompt>) {
  const { prompt, draft, setDraft } = props;
  const text = draft.selected[0] ?? inputStart(prompt);
  const submit = useSubmit(props, text);
  const field = useOpenFocus();
  return (
    <div className={styles.nameMain}>
      <input
        ref={field}
        type="text"
        autoComplete="off"
        className={styles.textInput}
        value={text}
        onChange={(e) => setDraft({ ...draft, selected: [e.target.value] })}
        onKeyDown={(e) => {
          if (plain(e) && e.key === 'Enter') {
            e.preventDefault();
            submit();
          }
        }}
        aria-label={prompt.title}
      />
      {prompt.constraint ? <p className={styles.constraint}>{prompt.constraint}</p> : null}
    </div>
  );
}
