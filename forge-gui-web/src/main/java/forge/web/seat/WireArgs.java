package forge.web.seat;

import java.lang.reflect.RecordComponent;
import java.util.Map;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonNull;
import com.google.gson.JsonObject;
import com.google.gson.JsonPrimitive;

import forge.game.card.CardView;
import forge.game.player.PlayerView;
import forge.game.spellability.SpellAbilityView;
import forge.game.spellability.StackItemView;
import forge.item.PaperCard;
import forge.trackable.TrackableObject;
import forge.util.FSerializableFunction;
import forge.web.bridge.SeatRefs;
import forge.web.bridge.visibility.Visibility;

/**
 * Encodes call and prompt arguments for one seat. Engine objects become references in the seat's
 * id space ({@code {"type":"card","id":N}}); a card the seat may not see is named by its unseen id
 * or alias and labelled without its name. Other trackables (game, combat) travel in the state
 * stream and encode as null. Records encode their components; anything else its {@code toString}.
 */
final class WireArgs {

    static final String HIDDEN_CARD = "Hidden card";
    static final String FACE_DOWN_CARD = "Face-down card";

    private WireArgs() { }

    static JsonElement encode(Object o, SeatRefs refs) {
        if (o == null) {
            return JsonNull.INSTANCE;
        }
        if (o instanceof CardView cv) {
            return ref("card", refs.card(cv.getId()));
        }
        if (o instanceof PlayerView pv) {
            return ref("player", pv.getId());
        }
        if (o instanceof StackItemView si) {
            return ref("stackItem", si.getId());
        }
        if (o instanceof SpellAbilityView sa) {
            JsonObject j = ref("spellAbility", sa.getId());
            CardView host = sa.getHostCard();
            j.add("card", host == null ? JsonNull.INSTANCE : encode(host, refs));
            j.addProperty("text", label(sa, null, refs));
            return j;
        }
        if (o instanceof TrackableObject) {
            return JsonNull.INSTANCE;
        }
        if (o instanceof Boolean b) {
            return new JsonPrimitive(b);
        }
        if (o instanceof Number n) {
            return new JsonPrimitive(n);
        }
        if (o instanceof CharSequence || o instanceof Character) {
            return new JsonPrimitive(o.toString());
        }
        if (o instanceof Enum<?> e) {
            return new JsonPrimitive(e.name());
        }
        if (o instanceof Map<?, ?> m) {
            JsonArray a = new JsonArray();
            for (Map.Entry<?, ?> e : m.entrySet()) {
                JsonObject kv = new JsonObject();
                kv.add("key", encode(e.getKey(), refs));
                kv.add("value", encode(e.getValue(), refs));
                a.add(kv);
            }
            return a;
        }
        if (o instanceof Iterable<?> it) {
            JsonArray a = new JsonArray();
            for (Object x : it) {
                a.add(encode(x, refs));
            }
            return a;
        }
        if (o instanceof Object[] arr) {
            JsonArray a = new JsonArray();
            for (Object x : arr) {
                a.add(encode(x, refs));
            }
            return a;
        }
        if (o.getClass().isRecord()) {
            JsonObject j = new JsonObject();
            j.addProperty("kind", o.getClass().getSimpleName());
            for (RecordComponent rc : o.getClass().getRecordComponents()) {
                try {
                    rc.getAccessor().setAccessible(true);
                    j.add(rc.getName(), encode(rc.getAccessor().invoke(o), refs));
                } catch (ReflectiveOperationException | RuntimeException e) {
                    j.add(rc.getName(), JsonNull.INSTANCE);
                }
            }
            return j;
        }
        return new JsonPrimitive(String.valueOf(o));
    }

    static JsonObject ref(String type, int id) {
        JsonObject j = new JsonObject();
        j.addProperty("type", type);
        j.addProperty("id", id);
        return j;
    }

    /**
     * The text a seat sees for a choice. A card (or an ability of a card) the seat may not see in
     * full is never rendered: the display function is not even called for it.
     */
    @SuppressWarnings({"unchecked", "rawtypes"})
    static String label(Object o, FSerializableFunction display, SeatRefs refs) {
        if (o instanceof CardView cv) {
            Visibility v = refs.visibility(cv);
            if (v == Visibility.HIDDEN) {
                return HIDDEN_CARD;
            }
            if (v == Visibility.FACE_DOWN) {
                return FACE_DOWN_CARD;
            }
        }
        if (o instanceof SpellAbilityView sa && sa.getHostCard() != null && refs.visibility(sa.getHostCard()) != Visibility.FULL) {
            return HIDDEN_CARD;
        }
        if (o instanceof StackItemView si && si.getSourceCard() != null && refs.visibility(si.getSourceCard()) == Visibility.HIDDEN) {
            return HIDDEN_CARD;
        }
        try {
            if (display != null) {
                return String.valueOf(display.apply(o));
            }
        } catch (RuntimeException e) {
            // fall back to toString
        }
        if (o instanceof PaperCard pc) {
            return pc.getName() + " (" + pc.getEdition() + ")";
        }
        return String.valueOf(o);
    }

    /** A choice entry: index, label, and the engine object's reference when it has one. */
    @SuppressWarnings("rawtypes")
    static JsonObject choice(int i, Object o, FSerializableFunction display, SeatRefs refs) {
        JsonObject j = new JsonObject();
        j.addProperty("i", i);
        j.addProperty("label", label(o, display, refs));
        if (o instanceof CardView || o instanceof PlayerView || o instanceof StackItemView || o instanceof SpellAbilityView) {
            j.add("ref", encode(o, refs));
        }
        return j;
    }
}
