import { describe, expect, it } from 'vitest';
import { nameLabel } from './selectors';

describe('nameLabel', () => {
  it('marks your own name, unless the engine already calls the seat "You" (pass 1 #9)', () => {
    expect(nameLabel({ name: 'Hugo', isYou: true })).toBe('Hugo (you)');
    expect(nameLabel({ name: 'You', isYou: true })).toBe('You');
    expect(nameLabel({ name: 'AI 1', isYou: false })).toBe('AI 1');
  });
});
