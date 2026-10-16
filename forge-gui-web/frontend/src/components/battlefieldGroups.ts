import { commanderTax, groupKey, isCreature, isLand, typeLine } from '../model/selectors';
import type { CardView, GameView, PlayerView } from '../model/types';
import type { Prefs } from '../state/prefs';
import type { UiState } from '../state/ui';
import { cardStatusWithChoice } from './tray/inPlace';

export interface Entry {
  card: CardView;
  ids: string[];
  /** First entry of a new group inside a row: gets a wider gap. */
  separator?: boolean;
  /** Two-line caption over the card's foot (the commander in the command zone); `detail` may be empty. */
  caption?: { label: string; detail: string };
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
 * An opponent's command zone, drawn at the end of their support row. Yours is
 * empty: your commander shows only in the group beside the hand, where you cast
 * it from (design pass 4, P3).
 */
export function commandEntries(player: PlayerView, game: GameView): Entry[] {
  if (player.isYou) return [];
  return player.command.flatMap((id) => {
    const c = game.cards[id];
    if (!c) return [];
    const tax = commanderTax(player, id);
    return [{ card: c, ids: [id], caption: { label: 'Command zone', detail: tax > 0 ? `tax +${tax}` : '' } }];
  });
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
