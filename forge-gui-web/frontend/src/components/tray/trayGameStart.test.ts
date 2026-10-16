import { describe, expect, it } from 'vitest';
import { bottomPrompt, mulliganPrompt } from '../../state/gameStart';
import { counterText, initialDraft, keyAction, toggleOption, trayConfirm } from './trayLogic';

const key = (k: string) => ({ key: k, alt: false, inInput: false });

describe('tray shapes reused by the game start (design pass 4 §2.4)', () => {
  it('mulligan: Space keeps, M mulligans, Y and N do nothing', () => {
    const p = mulliganPrompt({ handSize: 7, toBottom: 0, freeNext: true });
    const d = initialDraft(p);
    expect(keyAction(p, d, [], key(' '))).toEqual({ kind: 'answer', answer: { shape: 'yesNo', yes: true } });
    expect(keyAction(p, d, [], key('m'))).toEqual({ kind: 'answer', answer: { shape: 'yesNo', yes: false } });
    expect(keyAction(p, d, [], key('M'))).toEqual({ kind: 'answer', answer: { shape: 'yesNo', yes: false } });
    expect(keyAction(p, d, [], key('y'))).toBeUndefined();
    expect(keyAction(p, d, [], key('n'))).toBeUndefined();
  });

  it('bottoming: "0 of 1 chosen", confirm "Put on bottom" without a count', () => {
    const p = bottomPrompt(['a', 'b', 'c'], 1);
    let d = initialDraft(p);
    expect(counterText(p, 0)).toBe('0 of 1 chosen');
    expect(trayConfirm(p, d)).toMatchObject({ enabled: false, label: 'Choose 1 more' });
    d = toggleOption(p, d, p.options[1]!.id);
    expect(counterText(p, 1)).toBe('1 of 1 chosen');
    expect(trayConfirm(p, d)).toMatchObject({ enabled: true, label: 'Put on bottom' });
  });
});
