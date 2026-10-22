package forge.fork.web.seat;

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
import forge.fork.web.bridge.SeatRefs;
import forge.fork.web.bridge.visibility.Visibility;

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

    /**
     * An argument of a call (no answer): as {@link #encode}, but a list, also one in a record (a {@code Selection}'s
     * cards and chosen), leaves out the cards the seat has no id for (-1: never told of it, e.g. a Treasure sacrificed
     * since {@code InputPayMana} computed its auto-pay plan, which it recomputes only after a mana ability with a mana
     * cost). Such an entry names nothing the seat can show or click.
     */
    static JsonElement encodeCallArg(Object o, SeatRefs refs) {
        return withoutUnknownCards(encode(o, refs));
    }

    private static JsonElement withoutUnknownCards(JsonElement e) {
        if (e instanceof JsonObject r && r.has("kind")) {
            for (Map.Entry<String, JsonElement> f : r.entrySet()) {
                f.setValue(withoutUnknownCards(f.getValue()));
            }
            return r;
        }
        if (!(e instanceof JsonArray a)) {
            return e;
        }
        JsonArray kept = new JsonArray();
        for (JsonElement x : a) {
            if (!(x instanceof JsonObject r && r.has("type") && "card".equals(r.get("type").getAsString())
                    && r.get("id").getAsInt() < 0)) {
                kept.add(x);
            }
        }
        return kept;
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
        // a card, or an ability or stack item of a card, the seat may not see in full: one rule for all three
        CardView card = o instanceof CardView cv ? cv
                : o instanceof SpellAbilityView sa ? sa.getHostCard()
                : o instanceof StackItemView si ? si.getSourceCard() : null;
        if (card != null) {
            Visibility v = refs.visibility(card);
            if (v == Visibility.HIDDEN) {
                return HIDDEN_CARD;
            }
            if (v == Visibility.FACE_DOWN) {
                return FACE_DOWN_CARD;
            }
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

    /**
     * A choice entry: index, label, and the engine object's reference when it has one. A card the seat
     * sees in full while the card it copies stays hidden (an LKI copy the engine reveals, e.g.
     * {@code Player.revealFaceDownCards}) keeps the hidden card's unseen id or alias, is labelled with
     * its name, and is flagged {@code revealedCopy}: the seat has no state for it beyond the label.
     */
    @SuppressWarnings("rawtypes")
    static JsonObject choice(int i, Object o, FSerializableFunction display, SeatRefs refs) {
        JsonObject j = new JsonObject();
        j.addProperty("i", i);
        j.addProperty("label", label(o, display, refs));
        if (o instanceof CardView || o instanceof PlayerView || o instanceof StackItemView || o instanceof SpellAbilityView) {
            j.add("ref", encode(o, refs));
        }
        if (o instanceof CardView cv && refs.visibility(cv) == Visibility.FULL) {
            int ref = refs.card(cv.getId());
            if (ref >= 0 && ref != cv.getId()) {
                j.addProperty("revealedCopy", true);
            }
        }
        return j;
    }
}
