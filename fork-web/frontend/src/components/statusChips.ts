import type { CardId, GameView, PlayerView } from '../model/types';
import { t } from '../i18n';

export interface StatusChip {
  /** Stable key: kind and card name. */
  key: string;
  kind: 'effect' | 'attached';
  /** The card the hover preview and the inspector show (the first of a group of identical names). */
  cardId: CardId;
  name: string;
  /** Identical ones grouped (two copies of the same emblem). */
  count: number;
  /** Tooltip and accessible name. */
  title: string;
}

function group(game: GameView, ids: CardId[] | undefined, kind: StatusChip['kind'], title: (name: string, n: number) => string): StatusChip[] {
  const out: StatusChip[] = [];
  for (const id of ids ?? []) {
    const c = game.cards[id];
    if (!c) continue;
    const key = `${kind}:${c.name}`;
    const known = out.find((x) => x.key === key);
    if (known) {
      known.count += 1;
      known.title = title(c.name, known.count);
    } else out.push({ key, kind, cardId: id, name: c.name, count: 1, title: title(c.name, 1) });
  }
  return out;
}

/**
 * A player's status, as chips on their plate: the engine objects in their command zone that are state, not cards to
 * cast (the Monarch, emblems, engine effect cards, dungeons), and cards attached to them (a Curse), which stay on
 * their controller's battlefield too.
 */
export function statusChips(p: PlayerView, game: GameView): StatusChip[] {
  const owner = p.isYou ? t('top.you') : p.name;
  return [
    ...group(game, p.effects, 'effect', (name, n) => t('chip.effect', { name: `${name}${n > 1 ? ` ×${n}` : ''}`, owner })),
    ...group(game, p.attachments, 'attached', (name, n) => t('chip.attached', { name: `${name}${n > 1 ? ` ×${n}` : ''}`, owner })),
  ];
}
