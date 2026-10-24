import type { GameView, StackItem } from '../model/types';

/** "Always yield to this" is offered on abilities and triggers, never on a spell: the engine does not auto-yield spells. */
export function offersAlwaysYield(item: Pick<StackItem, 'kind'>): boolean {
  return item.kind !== 'spell';
}

/** What the item is auto-yielded by: the engine's key of the ability; the source card's name (mock), else the item's text. */
export function yieldKeyOf(game: GameView, item: StackItem): string {
  return item.yieldKey ?? game.cards[item.sourceCardId]?.name ?? item.text;
}

/** The item's ability is in the seat's "Always yield to this" list. */
export function isAlwaysYielded(game: GameView, item: StackItem): boolean {
  return game.autoYieldTo.includes(yieldKeyOf(game, item));
}
