package forge.fork.web.bridge;

import java.util.EnumMap;
import java.util.EnumSet;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

import com.google.gson.JsonObject;

import forge.trackable.TrackableProperty;
import forge.trackable.TrackableTypes;
import forge.trackable.TrackableTypes.TrackableType;

/**
 * Wire kind of every {@link TrackableProperty}, derived from its {@link TrackableType}.
 * Generic on purpose: an upstream property added to the enum gets a kind with no change here.
 * Sent to clients in the {@code hello} message so they can resolve references.
 */
public final class WireSchema {

    public enum Kind {
        CARD, CARDS, PLAYER, PLAYERS, STACK_ITEM, STACK_ITEMS, ENTITY, CARD_STATE, COMBAT,
        BOOL, INT, FLOAT, STRING, ENUM, MANA_COST, COLORS, CARD_TYPE, COUNTERS, KEYWORDS, PAPER_CARD,
        STRING_LIST, STRING_SET, STRING_MAP, INT_SET, INT_MAP, MANA_MAP, GENERIC_MAP, OBJECT
    }

    private static final Map<TrackableProperty, Kind> KINDS = new EnumMap<>(TrackableProperty.class);
    /** Property name -> kind, for the reference kinds only (hot path: mirror pruning and id rewriting). */
    private static final Map<String, Kind> REF_KINDS = new HashMap<>();
    private static final Set<Kind> REFS = EnumSet.of(Kind.CARD, Kind.CARDS, Kind.PLAYER, Kind.PLAYERS,
            Kind.STACK_ITEM, Kind.STACK_ITEMS, Kind.ENTITY, Kind.CARD_STATE, Kind.COMBAT);
    static {
        for (TrackableProperty p : TrackableProperty.values()) {
            Kind k = compute(p.getType());
            KINDS.put(p, k);
            if (REFS.contains(k)) {
                REF_KINDS.put(p.name(), k);
            }
        }
    }

    /**
     * Properties the bridge adds beside the engine's (all strings): name -> the wire object types carrying it.
     * The viewer's-language translation of the English field it shadows; the English field stays.
     * Part of the wire contract: in {@link #schemaJson()} and in the generated TypeScript types.
     */
    public static final Map<String, List<String>> FORK_PROPERTIES = forkProperties();

    private static Map<String, List<String>> forkProperties() {
        Map<String, List<String>> m = new LinkedHashMap<>();
        m.put("LocalName", List.of("card", "cardState"));
        m.put("LocalType", List.of("cardState"));
        m.put("LocalOracleText", List.of("cardState"));
        for (String n : m.keySet()) {
            for (TrackableProperty p : TrackableProperty.values()) {
                if (p.name().equals(n)) {
                    throw new IllegalStateException("fork property " + n + " now exists upstream as a TrackableProperty");
                }
            }
        }
        return m;
    }

    private WireSchema() { }

    public static Kind kindOf(TrackableProperty p) {
        return KINDS.get(p);
    }

    /** The kind of a property given by name if it holds references (ids), else null. */
    public static Kind refKindOf(String propName) {
        return REF_KINDS.get(propName);
    }

    private static Kind compute(TrackableType<?> t) {
        if (t == TrackableTypes.CardViewType) { return Kind.CARD; }
        if (t == TrackableTypes.CardViewCollectionType) { return Kind.CARDS; }
        if (t == TrackableTypes.PlayerViewType) { return Kind.PLAYER; }
        if (t == TrackableTypes.PlayerViewCollectionType) { return Kind.PLAYERS; }
        if (t == TrackableTypes.StackItemViewType) { return Kind.STACK_ITEM; }
        if (t == TrackableTypes.StackItemViewListType) { return Kind.STACK_ITEMS; }
        if (t == TrackableTypes.GameEntityViewType) { return Kind.ENTITY; }
        if (t == TrackableTypes.CardStateViewType) { return Kind.CARD_STATE; }
        if (t == TrackableTypes.CombatViewType) { return Kind.COMBAT; }
        if (t == TrackableTypes.BooleanType) { return Kind.BOOL; }
        if (t == TrackableTypes.IntegerType) { return Kind.INT; }
        if (t == TrackableTypes.FloatType) { return Kind.FLOAT; }
        if (t == TrackableTypes.StringType) { return Kind.STRING; }
        if (t == TrackableTypes.ManaCostType) { return Kind.MANA_COST; }
        if (t == TrackableTypes.ColorSetType) { return Kind.COLORS; }
        if (t == TrackableTypes.CardTypeViewType) { return Kind.CARD_TYPE; }
        if (t == TrackableTypes.CounterMapType) { return Kind.COUNTERS; }
        if (t == TrackableTypes.KeywordCollectionViewType) { return Kind.KEYWORDS; }
        if (t == TrackableTypes.IPaperCardType) { return Kind.PAPER_CARD; }
        if (t == TrackableTypes.StringListType) { return Kind.STRING_LIST; }
        if (t == TrackableTypes.StringSetType) { return Kind.STRING_SET; }
        if (t == TrackableTypes.StringMapType) { return Kind.STRING_MAP; }
        if (t == TrackableTypes.IntegerSetType) { return Kind.INT_SET; }
        if (t == TrackableTypes.IntegerMapType) { return Kind.INT_MAP; }
        if (t == TrackableTypes.ManaMapType) { return Kind.MANA_MAP; }
        if (t == TrackableTypes.GenericMapType) { return Kind.GENERIC_MAP; }
        if (t == TrackableTypes.ObjectType) { return Kind.OBJECT; }
        // TrackableTypes.EnumType(...) instances are created on demand and never exposed as constants
        return Kind.ENUM;
    }

    /** {propertyName: kind}, lower-case kind names. */
    public static JsonObject schemaJson() {
        JsonObject o = new JsonObject();
        for (Map.Entry<TrackableProperty, Kind> e : KINDS.entrySet()) {
            o.addProperty(e.getKey().name(), e.getValue().name().toLowerCase());
        }
        for (String n : FORK_PROPERTIES.keySet()) {
            o.addProperty(n, Kind.STRING.name().toLowerCase());
        }
        return o;
    }
}
