package forge.web.bridge;

import java.util.List;
import java.util.Map;

import com.google.common.collect.Multiset;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonNull;
import com.google.gson.JsonObject;
import com.google.gson.JsonPrimitive;

import forge.card.CardStateName;
import forge.game.GameEntityView;
import forge.game.GameView;
import forge.game.card.CardView;
import forge.game.card.CardView.CardStateView;
import forge.game.player.PlayerView;
import forge.game.spellability.StackItemView;
import forge.gamemodes.net.DeltaPacket;
import forge.gamemodes.net.DeltaPacket.CombatData;
import forge.item.IPaperCard;
import forge.trackable.TrackableObject;
import forge.trackable.TrackableProperty;

/**
 * Encodes trackable property values to JSON. Accepts both the network form produced by
 * {@code DeltaSyncManager} (references already replaced by ids) and live values read straight
 * from a {@link TrackableObject} (references still objects), so the same code serves deltas and
 * full re-sends of a single object.
 */
public final class WireEncoder {

    private static final CardStateName[] STATES = CardStateName.values();

    private WireEncoder() { }

    /** Typed object reference: {@code key} is the mirror key, e.g. {@code card:42} or {@code cardState:42:Original}. */
    public record ObjRef(String type, int id, String state) {
        public String key() {
            return state == null ? type + ":" + id : type + ":" + id + ":" + state;
        }
    }

    public static ObjRef decodeKey(int deltaKey) {
        int type = DeltaPacket.getTypeFromDeltaKey(deltaKey);
        int id = DeltaPacket.getIdFromDeltaKey(deltaKey);
        switch (type) {
            case DeltaPacket.TYPE_CARD_VIEW: return new ObjRef("card", id, null);
            case DeltaPacket.TYPE_PLAYER_VIEW: return new ObjRef("player", id, null);
            case DeltaPacket.TYPE_STACK_ITEM_VIEW: return new ObjRef("stackItem", id, null);
            case DeltaPacket.TYPE_GAME_VIEW: return new ObjRef("game", id, null);
            case DeltaPacket.TYPE_CSV: return new ObjRef("cardState", Math.floorDiv(id, 16), STATES[Math.floorMod(id, 16)].name());
            default: return new ObjRef("unknown", id, null);
        }
    }

    public static ObjRef refOf(TrackableObject o) {
        if (o instanceof CardStateView csv) { return new ObjRef("cardState", csv.getId(), csv.getState().name()); }
        if (o instanceof CardView) { return new ObjRef("card", o.getId(), null); }
        if (o instanceof PlayerView) { return new ObjRef("player", o.getId(), null); }
        if (o instanceof StackItemView) { return new ObjRef("stackItem", o.getId(), null); }
        if (o instanceof GameView) { return new ObjRef("game", o.getId(), null); }
        return new ObjRef(o.getClass().getSimpleName(), o.getId(), null);
    }

    /** Encodes a property map; a null value (property reset to default) stays as JSON null. */
    public static JsonObject encodeProps(Map<TrackableProperty, Object> props) {
        JsonObject o = new JsonObject();
        for (Map.Entry<TrackableProperty, Object> e : props.entrySet()) {
            o.add(e.getKey().name(), encodeValue(e.getKey(), e.getValue()));
        }
        return o;
    }

    public static JsonElement encodeValue(TrackableProperty prop, Object v) {
        if (v == null) {
            return JsonNull.INSTANCE;
        }
        switch (WireSchema.kindOf(prop)) {
            case CARD:
            case PLAYER:
            case STACK_ITEM:
                return idOf(v);
            case CARDS:
            case PLAYERS:
            case STACK_ITEMS: {
                JsonArray a = new JsonArray();
                for (Object item : (Iterable<?>) v) {
                    a.add(item == null ? new JsonPrimitive(-1) : idOf(item));
                }
                return a;
            }
            case ENTITY:
                return entityRef(v);
            case CARD_STATE:
                if (v instanceof Integer ord) { return new JsonPrimitive(STATES[ord].name()); }
                if (v instanceof CardStateView csv) { return new JsonPrimitive(csv.getState().name()); }
                return generic(v);
            case COMBAT:
                return v instanceof CombatData cd ? combat(cd) : new JsonPrimitive(v.toString());
            case PAPER_CARD:
                if (v instanceof IPaperCard pc) {
                    JsonObject o = new JsonObject();
                    o.addProperty("name", pc.getName());
                    o.addProperty("set", pc.getEdition());
                    o.addProperty("cn", pc.getCollectorNumber());
                    return o;
                }
                return generic(v);
            case MANA_COST:
            case COLORS:
            case CARD_TYPE:
                return new JsonPrimitive(v.toString());
            default:
                return generic(v);
        }
    }

    private static JsonElement idOf(Object v) {
        if (v instanceof TrackableObject t) { return new JsonPrimitive(t.getId()); }
        if (v instanceof Number n) { return new JsonPrimitive(n.intValue()); }
        return new JsonPrimitive(v.toString());
    }

    private static JsonObject entityRef(Object v) {
        JsonObject o = new JsonObject();
        if (v instanceof int[] a) {
            o.addProperty("type", a[0] == 0 ? "card" : "player");
            o.addProperty("id", a[1]);
        } else if (v instanceof GameEntityView e) {
            o.addProperty("type", e instanceof CardView ? "card" : "player");
            o.addProperty("id", e.getId());
        }
        return o;
    }

    private static JsonArray combat(CombatData cd) {
        JsonArray bands = new JsonArray();
        for (int i = 0; i < cd.bandAttackerIds.size(); i++) {
            JsonObject b = new JsonObject();
            b.add("attackers", ints(cd.bandAttackerIds.get(i)));
            int[] def = cd.bandDefenderRefs.get(i);
            b.add("defender", entityRef(def));
            b.add("blockers", ints(cd.bandBlockerIds.get(i)));
            b.add("plannedBlockers", ints(cd.bandPlannedBlockerIds.get(i)));
            bands.add(b);
        }
        return bands;
    }

    private static JsonArray ints(List<Integer> ids) {
        JsonArray a = new JsonArray();
        if (ids != null) {
            for (Integer id : ids) { a.add(id); }
        }
        return a;
    }

    /** Structural fallback for scalar, collection and map values; unknown objects become their toString(). */
    static JsonElement generic(Object v) {
        if (v == null) { return JsonNull.INSTANCE; }
        if (v instanceof Boolean b) { return new JsonPrimitive(b); }
        if (v instanceof Number n) { return new JsonPrimitive(n); }
        if (v instanceof String s) { return new JsonPrimitive(s); }
        if (v instanceof Character c) { return new JsonPrimitive(c); }
        if (v instanceof Enum<?> e) { return new JsonPrimitive(e.name()); }
        if (v instanceof TrackableObject t) {
            ObjRef r = refOf(t);
            JsonObject o = new JsonObject();
            o.addProperty("type", r.type());
            o.addProperty("id", r.id());
            return o;
        }
        if (v instanceof int[] a) {
            JsonArray arr = new JsonArray();
            for (int i : a) { arr.add(i); }
            return arr;
        }
        if (v instanceof Multiset<?> ms) {
            JsonObject o = new JsonObject();
            for (Multiset.Entry<?> e : ms.entrySet()) {
                o.addProperty(String.valueOf(e.getElement()), e.getCount());
            }
            return o;
        }
        if (v instanceof Map<?, ?> m) {
            JsonObject o = new JsonObject();
            for (Map.Entry<?, ?> e : m.entrySet()) {
                Object k = e.getKey();
                String key = k instanceof TrackableObject t ? refOf(t).key() : String.valueOf(k);
                o.add(key, generic(e.getValue()));
            }
            return o;
        }
        if (v instanceof Iterable<?> it) {
            JsonArray arr = new JsonArray();
            for (Object item : it) { arr.add(generic(item)); }
            return arr;
        }
        return new JsonPrimitive(v.toString());
    }
}
