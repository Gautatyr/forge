import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CounterPills, counterLift, counterParts } from './CounterPills';

const pills = (counters: { kind: string; count: number }[]) => renderToStaticMarkup(<CounterPills counters={counters} />);

describe('counters on a battlefield permanent (issue #173)', () => {
  it('draws one pill per kind, whatever the kind and the permanent', () => {
    const html = pills([
      { kind: 'Suspect', count: 2 },
      { kind: 'Charge', count: 3 },
      { kind: 'Experience', count: 1 },
      { kind: '-1/-1', count: 4 },
    ]);
    for (const kind of ['Suspect', 'Charge', 'Experience', '-1/-1']) expect(html).toContain(`>${kind}</span>`);
    expect(html.match(/title="/g)).toHaveLength(4);
    expect(html).toContain('title="2 Suspect counter(s)"');
  });

  it('writes +1/+1 counters as +N and every other kind as its name and count', () => {
    expect(counterParts({ kind: '+1/+1', count: 3 })).toEqual({ count: '+3' });
    expect(counterParts({ kind: 'Suspect', count: 2 })).toEqual({ kind: 'Suspect', count: '2' });
  });

  it('keeps the count apart from the kind, so a narrow card can cut the name and keep the number', () => {
    const html = pills([{ kind: 'Experience', count: 12 }]);
    expect(html).toMatch(/<span[^>]*>Experience<\/span><span[^>]*>12<\/span>/);
  });

  it('lifts the pills above the P/T box and the damage chip, which would otherwise cover the count', () => {
    expect(counterLift({ damage: 0 })).toBe(0);
    expect(counterLift({ power: 2, damage: 0 })).toBe(1);
    expect(counterLift({ power: 2, damage: 3 })).toBe(2);
    expect(renderToStaticMarkup(<CounterPills counters={[{ kind: 'Deathtouch', count: 1 }]} lift={1} />)).toContain('data-lift="1"');
    expect(pills([{ kind: 'Charge', count: 1 }])).toContain('data-lift="0"');
  });
});
