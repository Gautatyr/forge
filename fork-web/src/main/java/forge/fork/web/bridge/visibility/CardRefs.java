package forge.fork.web.bridge.visibility;

import java.util.Map;
import java.util.function.Function;
import java.util.function.IntUnaryOperator;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonPrimitive;

import forge.fork.web.bridge.WireSchema;

/**
 * Rewrites card references in encoded property values: {@code card} and {@code cards} ids,
 * {@code entity} refs of type card, and the attackers/blockers/defender of {@code combat} bands.
 * Values are never mutated in place: a changed value is a new element, an unchanged one is
 * returned as is.
 */
public final class CardRefs {

    private CardRefs() { }

    /** A copy of {@code props} with the card references of each property mapped through {@code mapperFor} of its name. */
    public static JsonObject map(JsonObject props, Function<String, IntUnaryOperator> mapperFor) {
        JsonObject out = new JsonObject();
        for (Map.Entry<String, JsonElement> e : props.entrySet()) {
            String k = e.getKey();
            out.add(k, WireSchema.refKindOf(k) == null ? e.getValue() : map(k, e.getValue(), mapperFor.apply(k)));
        }
        return out;
    }

    /** The value with card references mapped, or the same instance if none changed. */
    public static JsonElement map(String propName, JsonElement v, IntUnaryOperator f) {
        if (v == null || v.isJsonNull()) {
            return v;
        }
        WireSchema.Kind kind = WireSchema.refKindOf(propName);
        if (kind == null) {
            return v;
        }
        switch (kind) {
            case CARD:
                return id(v, f);
            case CARDS:
                return ids(v, f);
            case ENTITY:
                return entity(v, f);
            case COMBAT:
                return combat(v, f);
            default:
                return v;
        }
    }

    private static JsonElement id(JsonElement v, IntUnaryOperator f) {
        if (!v.isJsonPrimitive() || !v.getAsJsonPrimitive().isNumber()) {
            return v;
        }
        int id = v.getAsInt();
        int mapped = id == -1 ? id : f.applyAsInt(id);
        return mapped == id ? v : new JsonPrimitive(mapped);
    }

    private static JsonElement ids(JsonElement v, IntUnaryOperator f) {
        if (!v.isJsonArray()) {
            return v;
        }
        JsonArray in = v.getAsJsonArray();
        JsonArray out = null;
        for (int i = 0; i < in.size(); i++) {
            JsonElement mapped = id(in.get(i), f);
            if (out == null && mapped != in.get(i)) {
                out = new JsonArray(in.size());
                for (int j = 0; j < i; j++) {
                    out.add(in.get(j));
                }
            }
            if (out != null) {
                out.add(mapped);
            }
        }
        return out == null ? v : out;
    }

    private static JsonElement entity(JsonElement v, IntUnaryOperator f) {
        if (!v.isJsonObject()) {
            return v;
        }
        JsonObject o = v.getAsJsonObject();
        if (!o.has("type") || !"card".equals(o.get("type").getAsString()) || !o.has("id")) {
            return v;
        }
        JsonElement id = id(o.get("id"), f);
        if (id == o.get("id")) {
            return v;
        }
        JsonObject out = new JsonObject();
        out.addProperty("type", "card");
        out.add("id", id);
        return out;
    }

    private static JsonElement combat(JsonElement v, IntUnaryOperator f) {
        if (!v.isJsonArray()) {
            return v;
        }
        JsonArray in = v.getAsJsonArray();
        JsonArray out = new JsonArray(in.size());
        boolean changed = false;
        for (JsonElement band : in) {
            if (!band.isJsonObject()) {
                out.add(band);
                continue;
            }
            JsonObject b = band.getAsJsonObject();
            JsonObject nb = new JsonObject();
            for (Map.Entry<String, JsonElement> e : b.entrySet()) {
                JsonElement mapped = "defender".equals(e.getKey()) ? entity(e.getValue(), f) : ids(e.getValue(), f);
                changed |= mapped != e.getValue();
                nb.add(e.getKey(), mapped);
            }
            out.add(nb);
        }
        return changed ? out : v;
    }
}
