package forge.web.bridge;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.IntUnaryOperator;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;

import forge.web.bridge.visibility.CardRefs;

/**
 * Server-side copy of exactly what one viewer's clients have been sent, as JSON. A connecting client gets
 * {@link #toJsonObjects()} as its snapshot, so the snapshot never walks the live (game-thread-owned)
 * view graph. Not thread-safe: the owner serialises access.
 */
public final class StateMirror {

    public record Obj(String type, int id, String state, JsonObject props) {
        public String key() {
            return state == null ? type + ":" + id : type + ":" + id + ":" + state;
        }

        public JsonObject toJson() {
            JsonObject o = new JsonObject();
            o.addProperty("type", type);
            o.addProperty("id", id);
            if (state != null) {
                o.addProperty("state", state);
            }
            o.add("props", props);
            return o;
        }
    }

    private final Map<String, Obj> objects = new LinkedHashMap<>();
    private String rootKey;

    public void clear() {
        objects.clear();
        rootKey = null;
    }

    public void setRoot(String key) {
        rootKey = key;
    }

    public Obj get(String key) {
        return objects.get(key);
    }

    public int size() {
        return objects.size();
    }

    /** Adds or replaces a whole object (new object, or a replacement instance after a zone change). */
    public void putNew(Obj o) {
        objects.put(o.key(), o);
    }

    public void remove(String key) {
        objects.remove(key);
    }

    /** Merges changed properties; JSON null removes the property (client falls back to the default). */
    public void merge(String key, JsonObject changed) {
        Obj o = objects.get(key);
        if (o == null) {
            return;
        }
        for (Map.Entry<String, JsonElement> e : changed.entrySet()) {
            if (e.getValue().isJsonNull()) {
                o.props().remove(e.getKey());
            } else {
                o.props().add(e.getKey(), e.getValue());
            }
        }
    }

    /**
     * Rewrites card references {@code old id -> new id} in every object and returns, per object key,
     * the properties that changed (their new values), for the client to merge.
     */
    public Map<String, JsonObject> rewriteCardRefs(Map<Integer, Integer> renames) {
        Map<String, JsonObject> changed = new LinkedHashMap<>();
        if (renames.isEmpty()) {
            return changed;
        }
        IntUnaryOperator f = id -> renames.getOrDefault(id, id);
        for (Obj o : objects.values()) {
            JsonObject delta = null;
            for (Map.Entry<String, JsonElement> e : o.props().entrySet()) {
                JsonElement mapped = CardRefs.map(e.getKey(), e.getValue(), f);
                if (mapped != e.getValue()) {
                    if (delta == null) {
                        delta = new JsonObject();
                    }
                    delta.add(e.getKey(), mapped);
                }
            }
            if (delta != null) {
                for (Map.Entry<String, JsonElement> e : delta.entrySet()) {
                    o.props().add(e.getKey(), e.getValue());
                }
                changed.put(o.key(), delta);
            }
        }
        return changed;
    }

    /**
     * Drops every object no longer reachable from the root through reference properties and
     * returns their keys in mirror order. Clients apply the same removals.
     */
    public List<String> prune() {
        if (rootKey == null || !objects.containsKey(rootKey)) {
            return List.of();
        }
        Set<String> reachable = new HashSet<>();
        Deque<String> todo = new ArrayDeque<>();
        todo.add(rootKey);
        while (!todo.isEmpty()) {
            String key = todo.poll();
            Obj o = objects.get(key);
            if (o == null || !reachable.add(key)) {
                continue;
            }
            for (Map.Entry<String, JsonElement> e : o.props().entrySet()) {
                collectRefs(o, e.getKey(), e.getValue(), todo);
            }
        }
        List<String> removed = new ArrayList<>();
        for (String key : objects.keySet()) {
            if (!reachable.contains(key)) {
                removed.add(key);
            }
        }
        for (String key : removed) {
            objects.remove(key);
        }
        return removed;
    }

    private static void collectRefs(Obj owner, String propName, JsonElement v, Deque<String> todo) {
        if (v == null || v.isJsonNull()) {
            return;
        }
        WireSchema.Kind kind = WireSchema.refKindOf(propName);
        if (kind == null) {
            return;
        }
        switch (kind) {
            case CARD: todo.add("card:" + v.getAsInt()); break;
            case PLAYER: todo.add("player:" + v.getAsInt()); break;
            case STACK_ITEM: todo.add("stackItem:" + v.getAsInt()); break;
            case CARDS: addAll("card:", v.getAsJsonArray(), todo); break;
            case PLAYERS: addAll("player:", v.getAsJsonArray(), todo); break;
            case STACK_ITEMS: addAll("stackItem:", v.getAsJsonArray(), todo); break;
            case ENTITY: {
                JsonObject r = v.getAsJsonObject();
                if (r.has("type")) {
                    todo.add(r.get("type").getAsString() + ":" + r.get("id").getAsInt());
                }
                break;
            }
            case CARD_STATE:
                if ("card".equals(owner.type())) {
                    todo.add("cardState:" + owner.id() + ":" + v.getAsString());
                }
                break;
            case COMBAT:
                if (v.isJsonArray()) {
                    for (JsonElement band : v.getAsJsonArray()) {
                        JsonObject b = band.getAsJsonObject();
                        addAll("card:", b.getAsJsonArray("attackers"), todo);
                        addAll("card:", b.getAsJsonArray("blockers"), todo);
                        JsonObject d = b.getAsJsonObject("defender");
                        todo.add(d.get("type").getAsString() + ":" + d.get("id").getAsInt());
                    }
                }
                break;
            default:
                break;
        }
    }

    private static void addAll(String prefix, JsonArray ids, Deque<String> todo) {
        if (ids == null) {
            return;
        }
        for (JsonElement id : ids) {
            todo.add(prefix + id.getAsInt());
        }
    }

    public JsonArray toJsonObjects() {
        JsonArray a = new JsonArray();
        for (Obj o : objects.values()) {
            a.add(o.toJson());
        }
        return a;
    }
}
