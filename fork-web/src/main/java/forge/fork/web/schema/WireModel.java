package forge.fork.web.schema;

import java.lang.reflect.Field;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import forge.card.CardStateName;
import forge.game.GameEntityView;
import forge.game.GameLogEntryType;
import forge.game.GameView;
import forge.game.card.CardView;
import forge.game.card.CardView.CardStateView;
import forge.game.combat.CombatView;
import forge.game.player.PlayerView;
import forge.game.spellability.SpellAbilityView;
import forge.game.spellability.StackItemView;
import forge.game.zone.ZoneType;
import forge.gamemodes.net.ProtocolMethod;
import forge.trackable.TrackableObject;
import forge.trackable.TrackableProperty;
import forge.trackable.TrackableTypes;
import forge.trackable.TrackableTypes.TrackableType;
import forge.fork.web.bridge.GameStream;
import forge.fork.web.bridge.WireSchema;
import forge.fork.web.bridge.WireSchema.Kind;

/**
 * What the TypeScript wire types are generated from, read from the engine by reflection:
 * {@link TrackableProperty} (kinds via {@link WireSchema}), the view classes that use each property,
 * {@link ProtocolMethod}, and the Java enums they reference.
 */
public final class WireModel {

    /** One {@link TrackableProperty}. {@code enumType} is the TS name of its enum (kind ENUM only). */
    public record Property(String name, Kind kind, String enumType, List<String> objectTypes) { }

    /** One wire object type ({@code "type"} field of a wire object) and the view class it encodes. */
    public record ObjectType(String name, Class<? extends TrackableObject> view, String idType, String propsType) { }

    /** One {@link ProtocolMethod}: argument and return TS types. */
    public record Method(String name, boolean server, List<String> args, String returns) { }

    /** A Java enum emitted as a union of its constant names. */
    public record EnumType(String tsName, String javaName, List<String> constants) { }

    /** Object types as {@code WireEncoder.refOf} names them. */
    public static final List<ObjectType> OBJECT_TYPES = List.of(
            new ObjectType("game", GameView.class, "GameId", "GameProps"),
            new ObjectType("player", PlayerView.class, "PlayerId", "PlayerProps"),
            new ObjectType("card", CardView.class, "CardId", "CardProps"),
            new ObjectType("cardState", CardStateView.class, "CardId", "CardStateProps"),
            new ObjectType("stackItem", StackItemView.class, "StackItemId", "StackItemProps"));

    /**
     * Views whose properties never travel as wire objects: {@code CombatView} is inlined into the game's
     * {@code CombatView} property, {@code SpellAbilityView} is not walked by {@code DeltaSyncManager}.
     */
    static final List<Class<? extends TrackableObject>> OFF_WIRE_VIEWS = List.of(CombatView.class, SpellAbilityView.class);

    private final List<Property> properties;
    private final Map<String, EnumType> enums;
    private final List<Method> methods;

    private WireModel(List<Property> properties, Map<String, EnumType> enums, List<Method> methods) {
        this.properties = List.copyOf(properties);
        this.enums = Collections.unmodifiableMap(new LinkedHashMap<>(enums));
        this.methods = List.copyOf(methods);
    }

    public List<Property> properties() {
        return properties;
    }

    /** Emitted enums by TS name, in first-use order. */
    public Map<String, EnumType> enums() {
        return enums;
    }

    public List<Method> methods() {
        return methods;
    }

    /** A copy with one more property, as if it had been added to the enum. */
    public WireModel withProperty(Property p) {
        List<Property> ps = new ArrayList<>(properties);
        ps.add(p);
        return new WireModel(ps, enums, methods);
    }

    public static WireModel fromEngine() {
        Map<String, EnumType> enums = new LinkedHashMap<>();
        Map<Class<?>, String> enumNames = new LinkedHashMap<>();
        register(CardStateName.class, enums, enumNames);

        List<String> names = new ArrayList<>();
        for (TrackableProperty p : TrackableProperty.values()) {
            names.add(p.name());
        }
        Map<String, Set<String>> refs = new LinkedHashMap<>();
        for (ObjectType o : OBJECT_TYPES) {
            refs.put(o.name(), viewRefs(o.view()));
        }
        // PlayerView reads its zones through ZoneType.getTrackableProperty(), not by constant
        for (ZoneType z : ZoneType.values()) {
            if (z.getTrackableProperty() != null) {
                refs.get("player").add(z.getTrackableProperty().name());
            }
        }
        Set<String> offWire = new LinkedHashSet<>();
        for (Class<? extends TrackableObject> v : OFF_WIRE_VIEWS) {
            offWire.addAll(viewRefs(v));
        }
        Map<String, List<String>> placed = placeProperties(names, refs, offWire);

        Map<TrackableType<?>, Class<?>> enumOfType = enumTypesByTrackableType();
        List<Property> properties = new ArrayList<>();
        for (TrackableProperty p : TrackableProperty.values()) {
            Kind kind = WireSchema.kindOf(p);
            String enumTs = null;
            if (kind == Kind.ENUM) {
                Class<?> e = enumOfType.get(p.getType());
                if (e == null) {
                    throw new IllegalStateException("TrackableProperty." + p.name()
                            + " has a TrackableType that WireSchema does not know and that is not an EnumType: add it to WireSchema.Kind");
                }
                enumTs = register(e, enums, enumNames);
            }
            properties.add(new Property(p.name(), kind, enumTs, placed.get(p.name())));
        }

        List<Method> methods = new ArrayList<>();
        for (ProtocolMethod m : ProtocolMethod.values()) {
            List<String> args = new ArrayList<>();
            for (Class<?> a : m.getArgTypes()) {
                args.add(protocolType(a, enums, enumNames));
            }
            String ret = protocolType(m.getReturnType(), enums, enumNames);
            methods.add(new Method(m.name(), isServer(m), args, ret));
        }

        register(GameStream.HiddenPolicy.class, "HiddenPolicy", enums, enumNames);
        register(GameLogEntryType.class, enums, enumNames);
        return new WireModel(properties, enums, methods);
    }

    /**
     * Assigns each property to the object types whose view classes reference it. A property no wire view
     * references must be referenced by an off-wire view, else generation fails: a new upstream property
     * has to be placed by hand here rather than silently dropped.
     */
    static Map<String, List<String>> placeProperties(List<String> names, Map<String, Set<String>> refsByObjectType, Set<String> offWire) {
        Map<String, List<String>> out = new LinkedHashMap<>();
        List<String> orphans = new ArrayList<>();
        for (String name : names) {
            List<String> types = new ArrayList<>();
            for (ObjectType o : OBJECT_TYPES) {
                Set<String> refs = refsByObjectType.get(o.name());
                if (refs != null && refs.contains(name)) {
                    types.add(o.name());
                }
            }
            if (types.isEmpty() && !offWire.contains(name)) {
                orphans.add(name);
            }
            out.put(name, List.copyOf(types));
        }
        if (!orphans.isEmpty()) {
            throw new IllegalStateException("TrackableProperty " + orphans
                    + " is referenced by no view class; place it in forge.fork.web.schema.WireModel.fromEngine");
        }
        return out;
    }

    /** Enum constant names in declaration order, without initialising the enum class. */
    public static List<String> enumConstants(Class<?> e) {
        List<String> out = new ArrayList<>();
        for (Field f : e.getDeclaredFields()) {
            if (f.isEnumConstant()) {
                out.add(f.getName());
            }
        }
        return out;
    }

    /** TrackableProperty constants referenced by a view class and its superclasses below TrackableObject. */
    private static Set<String> viewRefs(Class<?> view) {
        Set<String> constants = new LinkedHashSet<>(enumConstants(TrackableProperty.class));
        Set<String> out = new LinkedHashSet<>();
        for (Class<?> c = view; c != null && c != TrackableObject.class && c != Object.class; c = c.getSuperclass()) {
            for (String ref : ConstantPoolScanner.fieldRefs(c, TrackableProperty.class)) {
                if (constants.contains(ref)) {
                    out.add(ref);
                }
            }
        }
        return out;
    }

    private static boolean isServer(ProtocolMethod m) {
        try {
            Field f = ProtocolMethod.class.getDeclaredField("mode");
            f.setAccessible(true);
            String mode = ((Enum<?>) f.get(m)).name();
            switch (mode) {
                case "SERVER": return true;
                case "CLIENT": return false;
                default: throw new IllegalStateException("unknown ProtocolMethod mode " + mode);
            }
        } catch (ReflectiveOperationException e) {
            throw new IllegalStateException("ProtocolMethod.mode not readable; update forge.fork.web.schema.WireModel", e);
        }
    }

    /** TrackableTypes.EnumType(...) instances are cached by enum class in a private map; invert it. */
    private static Map<TrackableType<?>, Class<?>> enumTypesByTrackableType() {
        try {
            Field f = TrackableTypes.class.getDeclaredField("enumTypes");
            f.setAccessible(true);
            Map<?, ?> byClass = (Map<?, ?>) f.get(null);
            Map<TrackableType<?>, Class<?>> out = new LinkedHashMap<>();
            for (Map.Entry<?, ?> e : byClass.entrySet()) {
                out.put((TrackableType<?>) e.getValue(), (Class<?>) e.getKey());
            }
            return out;
        } catch (ReflectiveOperationException e) {
            throw new IllegalStateException("TrackableTypes.enumTypes not readable; update forge.fork.web.schema.WireModel", e);
        }
    }

    /**
     * TS type of a protocol argument or return value, following the encoding planned in the spike report
     * ("How the 13 prompts would be bridged"): references become ids, collections arrays, enums names.
     * Types with no wire form yet are {@code unknown}, tagged with the Java type.
     */
    private static String protocolType(Class<?> c, Map<String, EnumType> enums, Map<Class<?>, String> enumNames) {
        if (c == void.class || c == Void.class) {
            return "undefined";
        }
        if (c == boolean.class || c == Boolean.class) {
            return "boolean";
        }
        if (c == char.class || c == Character.class || c == String.class) {
            return "string";
        }
        if (c.isPrimitive() || Number.class.isAssignableFrom(c)) {
            return "number";
        }
        if (c == CardView.class) {
            return "CardId";
        }
        if (c == PlayerView.class) {
            return "PlayerId";
        }
        if (c == StackItemView.class) {
            return "StackItemId";
        }
        if (c == GameEntityView.class) {
            return "EntityRef";
        }
        if (c.isEnum()) {
            return register(c, enums, enumNames);
        }
        if (c.isArray() || Iterable.class.isAssignableFrom(c)) {
            return "unknown[]";
        }
        if (Map.class.isAssignableFrom(c)) {
            return "Record<string, unknown>";
        }
        return "unknown /* " + javaName(c) + " */";
    }

    private static String register(Class<?> e, Map<String, EnumType> enums, Map<Class<?>, String> enumNames) {
        return register(e, javaName(e).replace(".", ""), enums, enumNames);
    }

    private static String register(Class<?> e, String tsName, Map<String, EnumType> enums, Map<Class<?>, String> enumNames) {
        String known = enumNames.get(e);
        if (known != null) {
            return known;
        }
        EnumType clash = enums.get(tsName);
        if (clash != null) {
            throw new IllegalStateException("enums " + clash.javaName() + " and " + e.getName() + " both map to TS type " + tsName);
        }
        enums.put(tsName, new EnumType(tsName, e.getName(), enumConstants(e)));
        enumNames.put(e, tsName);
        return tsName;
    }

    /** Simple name with enclosing classes: {@code DrawOfferMessage.Status}. */
    private static String javaName(Class<?> c) {
        String n = c.getName();
        return n.substring(n.lastIndexOf('.') + 1).replace('$', '.');
    }
}
