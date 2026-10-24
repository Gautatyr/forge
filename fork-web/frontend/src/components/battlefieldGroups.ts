import { groupKey, isCreature, isLand, typeLine } from '../model/selectors';
import type { CardView, GameView, PlayerView } from '../model/types';
import type { Prefs } from '../state/prefs';
import type { UiState } from '../state/ui';
import { cardStatusWithChoice } from './tray/inPlace';

export interface Entry {
  card: CardView;
  ids: string[];
  /** First entry of a new group inside a row: gets a wider gap. */
  separator?: boolean;
}

/** Creature row (pass-3 spec, section 4): creatures, planeswalkers and battles. */
export function inCreatureRow(c: CardView): boolean {
  return isCreature(c) || /\b(Planeswalker|Battle)\b/.test(typeLine(c));
}

/**
 * What a compact seat (Focus layout, creature row only) does not draw: permanents
 * outside the creature row, except attachments drawn on a creature-row host.
 */
export function hiddenInCompact(cards: CardView[], all: Record<string, CardView | undefined>) {
  const hidden = cards.filter((c) => {
    if (inCreatureRow(c)) return false;
    const host = c.attachedTo ? all[c.attachedTo] : undefined;
    return !(host && inCreatureRow(host));
  });
  const lands = hidden.filter(isLand);
  return { others: hidden.length - lands.length, lands: lands.length, untappedLands: lands.filter((c) => !c.tapped).length };
}

/**
 * A seat's two rows: creatures, then the support row (other permanents, then lands). Only the
 * battlefield: a commander in the command zone is never drawn on a board (playtest 1). Yours
 * shows beside the hand, an opponent's as a chip in their header (`commandZoneChips`).
 */
export function battlefieldRows(player: PlayerView, game: GameView, ui: UiState, prefs: Prefs): { creatures: Entry[]; support: Entry[] } {
  const cards = player.battlefield.map((id) => game.cards[id]!).filter((c) => !c.attachedTo);
  const creatures = groupPermanents(cards.filter(inCreatureRow), game, ui, prefs);
  const others = groupPermanents(cards.filter((c) => !inCreatureRow(c) && !isLand(c)), game, ui, prefs);
  const lands = groupPermanents(cards.filter((c) => isLand(c) && !inCreatureRow(c)), game, ui, prefs);
  if (others.length && lands.length) lands[0] = { ...lands[0]!, separator: true };
  return { creatures, support: [...others, ...lands] };
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
    const s = cardStatusWithChoice(game, ui, c.id);
    const key = groupKey(c, JSON.stringify([s.attacking, s.blocking, s.selected, s.actionKind, s.dimmed, s.inert]));
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
