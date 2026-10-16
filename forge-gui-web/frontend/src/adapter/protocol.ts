/**
 * Messages on the live WebSocket. The state stream (hello / snapshot / delta) and the human-seat
 * protocol (call, prompt, promptClosed, rejections; reply, action, requestResync) are generated
 * from the bridge (`forge.web.schema.WireEnvelope`); this file only names the unions the adapter
 * uses. Protocol: docs/fork/architecture/web-ui.md, "Bridge: human seat".
 */
import type {
  ActionMessage,
  ClientMessage,
  PromptChoice,
  PromptMessage,
  SeatMessage,
  SeatRef,
  ServerMessage,
} from '../wire/generated/wire';

export type { ActionMessage, ClientMessage, PromptChoice, PromptMessage, SeatRef };

export type ServerFrame = ServerMessage | SeatMessage;
export type ClientFrame = ClientMessage;

/** `{type, id}` reference (card, player, stack item), as calls and prompts carry them. */
export function asRef(v: unknown): SeatRef | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const o = v as { type?: unknown; id?: unknown };
  if ((o.type === 'card' || o.type === 'player' || o.type === 'stackItem') && typeof o.id === 'number') {
    return { type: o.type, id: o.id };
  }
  return undefined;
}

/** Colour masks of `useMana` (forge.card.MagicColor). */
export const COLOUR_MASK = { W: 1, U: 2, B: 4, R: 8, G: 16, C: 0 } as const;
