package forge.fork.web.schema;

import java.util.List;

/**
 * The server-to-client envelope (wire format v2: docs/fork/architecture/spike-report.md "Wire format (v1)" plus
 * the v2 changes in docs/fork/architecture/web-ui.md "Bridge: per-viewer visibility (wire v2)").
 * {@code GameStream} builds these messages field by field; this is the one description the TypeScript
 * types are generated from. {@code WireEnvelopeContractTest} checks {@code hello} and {@code snapshot}
 * against what {@code GameStream} actually sends; {@code delta} needs a running game and is not checked.
 */
public final class WireEnvelope {

    /** {@code hello.v}. */
    public static final int VERSION = 2;

    public record Field(String name, String ts, boolean optional, String doc) { }

    public record Message(String t, String tsName, String doc, List<Field> fields) { }

    public static final List<Message> MESSAGES = List.of(
            new Message("hello", "HelloMessage", "Once per connection, first.", List.of(
                    field("t", "'hello'", null),
                    field("v", String.valueOf(VERSION), "Wire format version (WIRE_VERSION)."),
                    field("hidden", "HiddenPolicy", null),
                    field("schema", "Record<string, WireKind>", "Runtime kind of every property; compare with PROPERTY_KINDS."))),
            new Message("snapshot", "SnapshotMessage", "On connect and at each new game: replaces all state.", List.of(
                    field("t", "'snapshot'", null),
                    field("game", "number", "Game number in this server run."),
                    field("seq", "number", "The next delta has seq + 1."),
                    field("label", "string", null),
                    field("viewer", "{ seat: number; player: number; omniscient?: true } | { spectator: true; omniscient?: true }",
                            "Whose stream this is (Viewer.toJson); omniscient = debug FULL policy."),
                    field("objects", "WireObject[]", null),
                    field("log", "LogEntry[]", "Tail of the game log, oldest first."))),
            new Message("delta", "DeltaMessage",
                    "Apply `new` (replaces the whole object), then `changed` (merge; null = back to default), then `removed`.",
                    List.of(
                            field("t", "'delta'", null),
                            field("game", "number", null),
                            field("seq", "number", "Previous seq + 1."),
                            field("ts", "number", "Server time, epoch ms."),
                            field("new", "WireObject[]", null),
                            field("changed", "WireObjectPatch[]", null),
                            field("removed", "string[]", "Object keys: `type:id`, or `cardState:id:State`."),
                            field("log", "LogEntry[]", "Log entries since the previous message."),
                            field("events", "string[]", "Engine event class names without the `GameEvent` prefix."),
                            new Field("final", "true", true, "Last delta of the game."))));

    /** A TypeScript declaration the seat messages use. */
    public record Decl(String doc, String ts) { }

    /** Types shared by the human-seat messages ({@code forge.fork.web.seat.WireArgs}, {@code forge.fork.web.seat.Prompt}). */
    public static final List<Decl> SEAT_TYPES = List.of(
            new Decl("A reference in a call or a prompt, in this seat's id space.",
                    "export interface SeatRef {\n  type: 'card' | 'player' | 'stackItem';\n  id: number;\n}"),
            new Decl("A spell ability in a call or a prompt: its host card and its text, rendered on the server.",
                    "export interface SpellAbilityRef {\n  type: 'spellAbility';\n  id: number;\n  card: SeatRef | null;\n  text: string;\n}"),
            new Decl("One choice of a prompt; which flags appear depends on the shape.",
                    "export interface PromptChoice {\n  i: number;\n  label: string;\n  ref?: SeatRef | SpellAbilityRef;\n"
                    + "  /** choose (getAbilityToPlay): the ability cannot be played now. */\n  disabled?: boolean;\n"
                    + "  /** A copy the engine reveals while the card stays hidden: only the label names it. */\n  revealedCopy?: boolean;\n"
                    + "  /** order, sideboard: the choice starts in the destination list. */\n  inDest?: boolean;\n"
                    + "  /** manipulateCardList: the card may move. */\n  movable?: boolean;\n"
                    + "  /** distribute (generic): most this choice may get. */\n  max?: number;\n"
                    + "  /** distribute (combat): the defending player or planeswalker (trample). */\n  defender?: boolean;\n"
                    + "  /** distribute (combat): damage that is lethal to this choice. */\n  lethal?: number;\n}"));

    /** Server to a human seat, on the seat's stream after hello and snapshot ({@code forge.fork.web.seat.SeatSession}). */
    public static final List<Message> SEAT_MESSAGES = List.of(
            new Message("call", "CallMessage", "A no-reply IGuiGame method: args positional, refs as SeatRef or SpellAbilityRef, enums by name.", List.of(
                    field("t", "'call'", null),
                    field("method", "ServerMethod", null),
                    field("args", "unknown[]", null))),
            new Message("prompt", "PromptChoose", "Choose between min and max choices; reply their indices (max 0: a reveal, reply []).", List.of(
                    field("t", "'prompt'", null),
                    field("id", "number", null),
                    field("method", "ServerMethod", null),
                    field("shape", "'choose'", null),
                    new Field("message", "string | null", true, null),
                    new Field("title", "string", true, "showOptionDialog."),
                    field("min", "number", null),
                    field("max", "number", null),
                    new Field("card", "SeatRef", true, "getAbilityToPlay: the card whose abilities these are."),
                    field("choices", "PromptChoice[]", null),
                    new Field("selected", "number[]", true, "getChoices: indices chosen beforehand."),
                    new Field("default", "number", true, "showOptionDialog: the default index."),
                    new Field("reveal", "{ message: string; cards: PromptChoice[] }", true, "DelayedReveal: cards shown with the choice."))),
            new Message("prompt", "PromptConfirm", "Yes or no; reply a boolean.", List.of(
                    field("t", "'prompt'", null),
                    field("id", "number", null),
                    field("method", "ServerMethod", null),
                    field("shape", "'confirm'", null),
                    new Field("message", "string | null", true, null),
                    new Field("title", "string", true, null),
                    new Field("card", "SeatRef", true, null),
                    field("yes", "string", null),
                    field("no", "string", null),
                    field("default", "boolean", "The engine's default answer."))),
            new Message("prompt", "PromptOrder",
                    "order: reply {order: indices of the new dest list, remember}; manipulateCardList (permutation): the full permutation; "
                            + "sideboard: indices of the new main deck.",
                    List.of(
                            field("t", "'prompt'", null),
                            field("id", "number", null),
                            field("method", "ServerMethod", null),
                            field("shape", "'order'", null),
                            new Field("message", "string | null", true, null),
                            new Field("destLabel", "string | null", true, null),
                            new Field("card", "SeatRef", true, null),
                            field("choices", "PromptChoice[]", null),
                            new Field("remainingMin", "number", true, "order: fewest choices that may stay out of the dest list."),
                            new Field("remainingMax", "number", true, "order: most choices that may stay out of the dest list."),
                            new Field("rememberOption", "boolean", true, null),
                            new Field("permutation", "true", true, null),
                            new Field("toTop", "boolean", true, null),
                            new Field("toBottom", "boolean", true, null),
                            new Field("toAnywhere", "boolean", true, null))),
            new Message("prompt", "PromptDistribute", "Reply one amount per choice, summing to amount (null skips when maySkip).", List.of(
                    field("t", "'prompt'", null),
                    field("id", "number", null),
                    field("method", "ServerMethod", null),
                    field("shape", "'distribute'", null),
                    new Field("card", "SeatRef", true, null),
                    field("amount", "number", null),
                    field("amountLabel", "string | null", null),
                    field("atLeastOne", "boolean", null),
                    field("maySkip", "boolean", null),
                    field("choices", "PromptChoice[]", null),
                    new Field("lethalOrder", "'inOrder' | 'blockersFirst' | 'free'", true, "assignCombatDamage only."))),
            new Message("prompt", "PromptText", "Reply a string (one of options when given; digits when numeric), or null to cancel.", List.of(
                    field("t", "'prompt'", null),
                    field("id", "number", null),
                    field("method", "ServerMethod", null),
                    field("shape", "'text'", null),
                    new Field("message", "string | null", true, null),
                    new Field("title", "string", true, null),
                    new Field("initial", "string | null", true, null),
                    new Field("options", "string[]", true, null),
                    field("numeric", "boolean", null))),
            new Message("promptClosed", "PromptClosedMessage", "The prompt is over on every client of the seat.", List.of(
                    field("t", "'promptClosed'", null),
                    field("id", "number", null),
                    field("reason", "'answered' | 'timeout' | 'disconnected' | 'cancelled'", null))),
            new Message("replyRejected", "ReplyRejectedMessage", "The reply did not fit; the prompt stays open.", List.of(
                    field("t", "'replyRejected'", null),
                    new Field("id", "number", true, null),
                    field("reason", "string", null))),
            new Message("actionRejected", "ActionRejectedMessage", "The action was not run.", List.of(
                    field("t", "'actionRejected'", null),
                    new Field("method", "string", true, null),
                    field("reason", "string", null))),
            new Message("rejected", "RejectedMessage", "Unknown message type.", List.of(
                    field("t", "'rejected'", null),
                    field("reason", "string", null))),
            new Message("blockOptions", "BlockOptionsMessage",
                    "While the seat declares blockers, after each change: the blocks the engine allows now (cleared by clearWeaklySelectable).",
                    List.of(
                            field("t", "'blockOptions'", null),
                            field("attackers", "{ card: number; blockers: number[]; ifFreed: number[]; min?: number }[]",
                                    "Attackers whose blocks the seat declares: creatures that may block each now (or already do), "
                                            + "creatures that could once taken off the attacker they block, fewest blockers when more than 1 (menace)."))),
            new Message("activateDescription", "ActivateDescriptionMessage", "Answers the getActivateDescription action.", List.of(
                    field("t", "'activateDescription'", null),
                    field("card", "number", null),
                    field("text", "string | null", null))));

    /** A human seat to the server (dropped from a spectator token). */
    public static final List<Message> CLIENT_MESSAGES = List.of(
            new Message("reply", "ReplyMessage", "Answers an open prompt; the value's form depends on its shape.", List.of(
                    field("t", "'reply'", null),
                    field("id", "number", null),
                    field("value", "unknown", null))),
            new Message("action", "ActionMessage", "A player action (IGameController); ids are this seat's wire ids.", List.of(
                    field("t", "'action'", null),
                    field("method", "ClientMethod", null),
                    new Field("card", "number", true, "selectCard, selectAbility, reorderHand, getActivateDescription."),
                    new Field("others", "number[]", true, "selectCard."),
                    new Field("player", "number", true, "selectPlayer."),
                    new Field("ability", "number", true, "selectAbility: the spell ability id."),
                    new Field("stackItem", "number", true, "selectStackItem."),
                    new Field("color", "number", true, "useMana: colour mask (MagicColor)."),
                    new Field("index", "number", true, "reorderHand."),
                    new Field("decision", "NextGameDecision", true, null),
                    new Field("action", "DrawOfferMessageAction", true, null),
                    new Field("update", "{ kind: string; [field: string]: unknown }", true, "sendYieldUpdate."))),
            new Message("requestResync", "RequestResyncMessage", "Asks for a fresh snapshot, then the seat's greeting.", List.of(
                    field("t", "'requestResync'", null))));

    private WireEnvelope() { }

    private static Field field(String name, String ts, String doc) {
        return new Field(name, ts, false, doc);
    }
}
