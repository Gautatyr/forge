import { groupKey, isLand } from '../model/selectors';
import type { CardView, GameView } from '../model/types';
import { cardStatus } from '../state/cardStatus';
import type { Prefs } from '../state/prefs';
import type { UiState } from '../state/ui';

export interface Entry {
  card: CardView;
  ids: string[];
  /** First entry of the support group in a one-row layout: gets a wider gap. */
  separator?: boolean;
}

/** Collapse identical tokens and lands into one entry with a count. */
export function groupPermanents(cards: CardView[], game: GameView, ui: UiState, prefs: Prefs): Entry[] {
  const out: Entry[] = [];
  const byKey = new Map<string, Entry>();
  for (const c of cards) {
    const groupable = (c.isToken && prefs.groupTokens) || (isLand(c) && !c.isToken && prefs.groupLands);
    // A card a stack item targets stays on its own: its ring and the line's
    // [data-card-id] endpoint must be its own, whichever item is in the spotlight.
    const targeted = game.stack.some((it) => it.targets.some((t) => t.kind === 'card' && t.id === c.id));
    if (!groupable || targeted || c.attachments.length > 0) {
      out.push({ card: c, ids: [c.id] });
      continue;
    }
    const s = cardStatus(game, ui, c.id);
    const key = groupKey(c, JSON.stringify([s.attacking, s.blocking, s.selected, s.actionKind, s.dimmed]));
    const e = byKey.get(key);
    if (e) e.ids.push(c.id);
    else {
      const n = { card: c, ids: [c.id] };
      byKey.set(key, n);
      out.push(n);
    }
  }
  return out;
}
