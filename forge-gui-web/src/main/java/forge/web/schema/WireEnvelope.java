package forge.web.schema;

import java.util.List;

/**
 * The server-to-client envelope (wire format v1, see docs/fork/architecture/spike-report.md "Wire format (v1)").
 * {@code GameStream} builds these messages field by field; this is the one description the TypeScript
 * types are generated from. {@code WireEnvelopeContractTest} checks {@code hello} and {@code snapshot}
 * against what {@code GameStream} actually sends; {@code delta} needs a running game and is not checked.
 */
public final class WireEnvelope {

    /** {@code hello.v}. */
    public static final int VERSION = 1;

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

    private WireEnvelope() { }

    private static Field field(String name, String ts, String doc) {
        return new Field(name, ts, false, doc);
    }
}
