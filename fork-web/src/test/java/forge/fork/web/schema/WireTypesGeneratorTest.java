package forge.fork.web.schema;

import static org.testng.Assert.assertEquals;
import static org.testng.Assert.assertFalse;
import static org.testng.Assert.assertNotEquals;
import static org.testng.Assert.assertThrows;
import static org.testng.Assert.assertTrue;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.stream.Stream;

import org.testng.annotations.Test;

import forge.game.zone.ZoneType;
import forge.gamemodes.net.ProtocolMethod;
import forge.trackable.TrackableProperty;
import forge.fork.web.bridge.WireSchema;

public class WireTypesGeneratorTest {

    private static final String TS = WireTypesGenerator.render(WireModel.fromEngine());

    @Test
    public void everyPropertyIsTypedWithItsWireKind() {
        String all = block(TS, "export interface WireProps {");
        String kinds = block(TS, "export const PROPERTY_KINDS = {");
        for (TrackableProperty p : TrackableProperty.values()) {
            assertTrue(all.contains("\n  " + p.name() + "?: "), p.name());
            assertTrue(kinds.contains("\n  " + p.name() + ": '" + WireSchema.kindOf(p).name().toLowerCase(Locale.ROOT) + "',"), p.name());
        }
    }

    @Test
    public void translationPropertiesAreInTheHelloSchemaAndTheGeneratedTypes() {
        com.google.gson.JsonObject schema = WireSchema.schemaJson();
        String kinds = block(TS, "export const PROPERTY_KINDS = {");
        String card = block(TS, "export interface CardProps {");
        String state = block(TS, "export interface CardStateProps {");
        for (String n : List.of("LocalName", "LocalType", "LocalOracleText")) {
            assertEquals(schema.get(n).getAsString(), "string", n);
            assertTrue(kinds.contains("\n  " + n + ": 'string',"), n);
            assertTrue(state.contains("\n  " + n + "?: string"), n);
        }
        assertTrue(card.contains("\n  LocalName?: string"));
        assertFalse(card.contains("LocalType"));
    }

    @Test
    public void outputDoesNotDependOnTheDefaultLocale() {
        Locale saved = Locale.getDefault();
        try {
            Locale.setDefault(Locale.forLanguageTag("tr-TR"));
            assertEquals(WireTypesGenerator.render(WireModel.fromEngine()), TS);
        } finally {
            Locale.setDefault(saved);
        }
    }

    @Test
    public void enumsAreReadOnlyAndNotSharedWithDerivedModels() {
        WireModel m = WireModel.fromEngine();
        WireModel derived = m.withProperty(new WireModel.Property("FooBar", WireSchema.Kind.INT, null, List.of("card")));
        assertThrows(UnsupportedOperationException.class, () -> m.enums().clear());
        assertThrows(UnsupportedOperationException.class, () -> derived.enums().remove("ZoneType"));
        assertEquals(List.copyOf(derived.enums().keySet()), List.copyOf(m.enums().keySet()));
    }

    @Test
    public void objectTypesCarryTheirOwnProperties() {
        String player = block(TS, "export interface PlayerProps {");
        assertTrue(player.contains("\n  Life?: number;"));
        assertTrue(player.contains("\n  Hand?: CardId[];"));
        // zones reached only through ZoneType.getTrackableProperty()
        assertTrue(player.contains("\n  Junkyard?: CardId[];"));
        // GameEntityView (shared by cards and players)
        assertTrue(player.contains("\n  Counters?: Record<string, number>;"));
        assertFalse(player.contains("\n  Power?:"));

        String card = block(TS, "export interface CardProps {");
        assertTrue(card.contains("\n  Zone?: ZoneType;"));
        assertTrue(card.contains("\n  Owner?: PlayerId;"));
        assertTrue(card.contains("\n  CurrentState?: CardStateName;"));
        assertTrue(card.contains("\n  EntityAttachedTo?: EntityRef;"));
        assertTrue(card.contains("\n  Counters?: Record<string, number>;"));
        assertFalse(card.contains("\n  Life?:"));

        String state = block(TS, "export interface CardStateProps {");
        assertTrue(state.contains("\n  Power?: number;"));
        assertTrue(state.contains("\n  ManaCost?: string;"));
        assertTrue(state.contains("\n  Keywords?: string[];"));
        assertTrue(state.contains("\n  Rarity?: CardRarity;"));

        String game = block(TS, "export interface GameProps {");
        assertTrue(game.contains("\n  Phase?: PhaseType;"));
        assertTrue(game.contains("\n  CombatView?: CombatBand[];"));
        assertTrue(game.contains("\n  Stack?: StackItemId[];"));

        String stack = block(TS, "export interface StackItemProps {");
        assertTrue(stack.contains("\n  TargetCards?: CardId[];"));
        assertTrue(stack.contains("\n  SourceCard?: CardId;"));
    }

    @Test
    public void enumPropertiesBecomeUnionsOfTheJavaConstants() {
        String zones = block(TS, "export type ZoneType =");
        for (ZoneType z : ZoneType.values()) {
            assertTrue(zones.contains("\n  | '" + z.name() + "'"), z.name());
        }
    }

    @Test
    public void protocolMethodsAreSplitByDirectionWithTypedArguments() {
        String server = block(TS, "export interface ServerProtocolArgs {");
        String client = block(TS, "export interface ClientProtocolArgs {");
        String returns = block(TS, "export interface ProtocolReturns {");
        String directions = block(TS, "export const PROTOCOL_METHODS = {");
        for (ProtocolMethod m : ProtocolMethod.values()) {
            boolean inServer = server.contains("\n  " + m.name() + ": [");
            boolean inClient = client.contains("\n  " + m.name() + ": [");
            assertTrue(inServer ^ inClient, m.name());
            assertTrue(directions.contains("\n  " + m.name() + ": '" + (inServer ? "server" : "client") + "',"), m.name());
            assertTrue(returns.contains("\n  " + m.name() + ": "), m.name());
        }
        assertTrue(server.contains("\n  updateButtons: [PlayerId, string, string, boolean, boolean, boolean];"));
        assertTrue(server.contains("\n  updateDrawOffer: [unknown /* DrawOfferMessage.Status */];"));
        assertTrue(client.contains("\n  selectCard: [CardId, unknown[], unknown /* ITriggerEvent */];"));
        assertTrue(client.contains("\n  drawOfferAction: [DrawOfferMessageAction];"));
        assertTrue(client.contains("\n  concede: [];"));
        assertTrue(returns.contains("\n  confirm: boolean;"));
        assertTrue(returns.contains("\n  getChoices: unknown[];"));
        assertTrue(returns.contains("\n  setGameView: undefined;"));
        assertTrue(block(TS, "export type DrawOfferMessageAction =").contains("\n  | 'ACCEPT'"));
    }

    @Test
    public void envelopeIsRendered() {
        String hello = block(TS, "export interface HelloMessage {");
        assertTrue(hello.contains("\n  t: 'hello';"));
        assertTrue(hello.contains("\n  v: 2;"));
        assertTrue(block(TS, "export interface SnapshotMessage {").contains("\n  viewer: { seat: number; player: number;"));
        String delta = block(TS, "export interface DeltaMessage {");
        assertTrue(delta.contains("\n  changed: WireObjectPatch[];"));
        assertTrue(delta.contains("\n  final?: true;"));
        assertTrue(TS.contains("export type ServerMessage = HelloMessage | SnapshotMessage | DeltaMessage;"));
        assertTrue(TS.contains("  | { type: 'cardState'; id: CardId; state: CardStateName; props: CardStateProps }"));
    }

    @Test
    public void addingAPropertyChangesTheOutput() {
        WireModel m = WireModel.fromEngine().withProperty(
                new WireModel.Property("FooBar", WireSchema.Kind.INT, null, List.of("card")));
        String ts = WireTypesGenerator.render(m);
        assertNotEquals(ts, TS);
        assertTrue(block(ts, "export interface CardProps {").contains("\n  FooBar?: number;"));
        assertTrue(block(ts, "export const PROPERTY_KINDS = {").contains("\n  FooBar: 'int',"));
        assertFalse(block(ts, "export interface PlayerProps {").contains("FooBar"));
    }

    @Test
    public void aPropertyNoViewReferencesFailsGeneration() {
        Map<String, Set<String>> refs = Map.of("card", Set.of("Zone"), "player", Set.of("Life"));
        Map<String, List<String>> placed = WireModel.placeProperties(List.of("Zone", "Life", "Description"), refs, Set.of("Description"));
        assertEquals(placed.get("Zone"), List.of("card"));
        assertEquals(placed.get("Description"), List.of());
        IllegalStateException e = expectThrows(() -> WireModel.placeProperties(List.of("Zone", "Orphan"), refs, Set.of()));
        assertTrue(e.getMessage().contains("Orphan"), e.getMessage());
    }

    @Test
    public void checkModeFailsOnAStaleFileAndWriteModeFixesIt() throws Exception {
        Path dir = Files.createTempDirectory("wire-types");
        try {
            staleCheckThenWrite(dir);
        } finally {
            deleteTree(dir);
        }
        assertFalse(Files.exists(dir));
    }

    private static void staleCheckThenWrite(Path dir) throws Exception {
        Path committed = dir.resolve("wire.ts");
        Path fresh = dir.resolve("fresh/wire.ts");
        Files.writeString(committed, "// stale\n");
        IllegalStateException e = expectThrows(() -> WireTypesGenerator.run("check", committed, fresh));
        assertTrue(e.getMessage().contains("-Dwire.types=write"), e.getMessage());
        assertEquals(Files.readString(fresh, StandardCharsets.UTF_8), TS);

        WireTypesGenerator.run("write", committed, fresh);
        assertEquals(Files.readString(committed, StandardCharsets.UTF_8), TS);
        WireTypesGenerator.run("check", committed, fresh);

        // a CRLF checkout is not stale
        Files.writeString(committed, TS.replace("\n", "\r\n"));
        WireTypesGenerator.run("check", committed, fresh);
        assertThrows(IllegalArgumentException.class, () -> WireTypesGenerator.run("bogus", committed, fresh));
    }

    private static void deleteTree(Path dir) throws IOException {
        try (Stream<Path> paths = Files.walk(dir)) {
            for (Path p : paths.sorted(Comparator.reverseOrder()).toList()) {
                Files.delete(p);
            }
        }
    }

    private static IllegalStateException expectThrows(org.testng.Assert.ThrowingRunnable r) {
        return org.testng.Assert.expectThrows(IllegalStateException.class, r);
    }

    /** The declaration starting at {@code head}, up to its closing line. */
    private static String block(String ts, String head) {
        int start = ts.indexOf(head);
        assertTrue(start >= 0, "missing: " + head);
        int end = ts.indexOf("\n}", start);
        int endUnion = ts.indexOf(";\n", start);
        if (head.startsWith("export type ") && endUnion >= 0) {
            end = endUnion;
        }
        return ts.substring(start, end + 1);
    }
}
