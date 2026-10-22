import { useEffect, useRef, type CSSProperties, type KeyboardEvent } from 'react';
import { isCreature, player } from '../../model/selectors';
import type { DistributePrompt, DistributeRecipient } from '../../model/types';
import { useMatch } from '../../state/MatchContext';
import { Card } from '../Card';
import { SeatGlyph } from '../Icon';
import { canStep, distributeConfirm, everyBlockerLethal, leftToAssign, rowNote, rowTabTarget, startAmounts, stepAmount } from './numberLogic';
import type { BodyProps } from './TrayBody';
import styles from './NumberShapes.module.css';
import { t } from '../../i18n';

/**
 * Distribute an amount, and combat damage assignment (same shape): one row per
 * recipient with a stepper. Tab moves between rows, ↑/↓ change by 1, Shift+↑/↓ by 5.
 */
export function Distribute({ prompt, draft, setDraft }: BodyProps<DistributePrompt>) {
  const { game } = useMatch();
  const amounts = draft.amounts ?? startAmounts(prompt);
  const left = leftToAssign(prompt, amounts);
  const lethal = everyBlockerLethal(prompt, amounts);
  const step = (id: string, by: number) => setDraft({ ...draft, amounts: stepAmount(prompt, amounts, id, by) });
  const list = useRef<HTMLUListElement>(null);

  const fields = () => [...(list.current?.querySelectorAll<HTMLElement>('[role="spinbutton"][tabindex="0"]') ?? [])];
  // Open with the first row focused, so the keys work at once (Space still confirms).
  useEffect(() => {
    fields()[0]?.focus({ preventScroll: true });
  }, []);
  // Tab goes from row to row, skipping the thumbnails. After the last row it moves on to
  // the confirm when enabled, else wraps to the first row so focus stays in the tray.
  const canLeave = distributeConfirm(prompt, amounts).enabled;
  const onTab = (e: KeyboardEvent) => {
    const all = fields();
    const to = rowTabTarget(all.indexOf(e.currentTarget as HTMLElement), all.length, e.shiftKey, canLeave);
    if (to === undefined) return;
    e.preventDefault();
    all[to]?.focus();
  };

  return (
    <div className={styles.distribute}>
      <p className={styles.left} aria-live="polite">
        {t('tray.leftToAssign')} <strong>{left}</strong>
        <span className={styles.keys}>
          <kbd>{t('key.tab')}</kbd> {t('tray.keysRow')} <kbd>↑</kbd> / <kbd>↓</kbd> ±1 · <kbd>{t('key.shift')}</kbd> + <kbd>↑</kbd> / <kbd>↓</kbd> ±5
        </span>
      </p>
      <ul ref={list} className={styles.rows}>
        {prompt.recipients.map((r) => {
          const trample = r.id === prompt.combat?.trampleId;
          const gated = trample && !lethal;
          return (
            <Row
              key={r.id}
              r={r}
              amount={amounts[r.id] ?? 0}
              note={rowNote(prompt, r, gated, !!r.cardId && !!game.cards[r.cardId] && isCreature(game.cards[r.cardId]!))}
              trample={trample}
              disabled={gated}
              canDown={canStep(prompt, amounts, r.id, -1)}
              canUp={canStep(prompt, amounts, r.id, 1)}
              step={(by) => step(r.id, by)}
              onTab={onTab}
            />
          );
        })}
      </ul>
    </div>
  );
}

interface RowProps {
  r: DistributeRecipient;
  amount: number;
  note: string;
  trample: boolean;
  disabled: boolean;
  canDown: boolean;
  canUp: boolean;
  step: (by: number) => void;
  onTab: (e: KeyboardEvent) => void;
}

function Row({ r, amount, note, trample, disabled, canDown, canUp, step, onTab }: RowProps) {
  const { game } = useMatch();
  const card = r.cardId ? game.cards[r.cardId] : undefined;
  const who = r.playerId ? player(game, r.playerId) : undefined;
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Tab') return onTab(e);
    if (e.altKey || e.ctrlKey || e.metaKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
    e.preventDefault();
    step((e.key === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 5 : 1));
  };
  return (
    <li className={`${styles.row} ${disabled ? styles.rowDisabled : ''}`}>
      <span className={styles.who}>
        {card ? (
          <Card card={card} context="thumb" style={{ '--cw': '1.75rem' } as CSSProperties} onActivate={() => undefined} />
        ) : who ? (
          <span className={styles.glyph}>
            <SeatGlyph seat={who.seat} size="1.25rem" />
          </span>
        ) : null}
        <span className={styles.name}>
          {r.label}
          {who && trample ? <span className={styles.kind}> {t('tray.player')}</span> : null}
        </span>
      </span>
      <span className={styles.note}>{note}</span>
      <span className={styles.stepper}>
        <button type="button" tabIndex={-1} disabled={disabled || !canDown} onClick={() => step(-1)} aria-label={t('tray.less', { label: r.label })}>
          −
        </button>
        <span
          role="spinbutton"
          tabIndex={disabled ? -1 : 0}
          aria-label={t('tray.amount', { label: r.label })}
          aria-valuenow={amount}
          aria-valuemin={r.min ?? 0}
          aria-disabled={disabled || undefined}
          className={styles.value}
          onKeyDown={disabled ? undefined : onKey}
        >
          {amount}
        </span>
        <button type="button" tabIndex={-1} disabled={disabled || !canUp} onClick={() => step(1)} aria-label={t('tray.more', { label: r.label })}>
          +
        </button>
      </span>
    </li>
  );
}
