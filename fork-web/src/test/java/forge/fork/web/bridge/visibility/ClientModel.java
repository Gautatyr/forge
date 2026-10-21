package forge.fork.web.bridge.visibility;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

import forge.fork.web.bridge.ClientSink;

/** A test client: records every frame and rebuilds its state from snapshot + deltas, like a browser would. */
final class ClientModel implements ClientSink {

    final List<String> frames = new ArrayList<>();
    final Map<String, JsonObject> objects = new LinkedHashMap<>();
    final List<String> errors = new ArrayList<>();
    JsonObject viewer;
    JsonObject lastDelta;
    long seq;

    @Override
    public void send(String json) {
        frames.add(json);
        JsonObject m = JsonParser.parseString(json).getAsJsonObject();
        String t = m.get("t").getAsString();
        if ("snapshot".equals(t)) {
            objects.clear();
            for (JsonElement o : m.getAsJsonArray("objects")) {
                objects.put(keyOf(o.getAsJsonObject()), o.getAsJsonObject().deepCopy());
            }
            viewer = m.getAsJsonObject("viewer");
            seq = m.get("seq").getAsLong();
        } else if ("delta".equals(t)) {
            lastDelta = m;
            long s = m.get("seq").getAsLong();
            if (s != seq + 1) {
                errors.add("seq gap " + seq + " -> " + s);
            }
            seq = s;
            for (JsonElement o : m.getAsJsonArray("new")) {
                objects.put(keyOf(o.getAsJsonObject()), o.getAsJsonObject().deepCopy());
            }
            for (JsonElement c : m.getAsJsonArray("changed")) {
                JsonObject co = c.getAsJsonObject();
                JsonObject o = objects.get(keyOf(co));
                if (o == null) {
                    errors.add("change for unknown " + keyOf(co));
                    continue;
                }
                for (Map.Entry<String, JsonElement> e : co.getAsJsonObject("props").entrySet()) {
                    if (e.getValue().isJsonNull()) {
                        o.getAsJsonObject("props").remove(e.getKey());
                    } else {
                        o.getAsJsonObject("props").add(e.getKey(), e.getValue().deepCopy());
                    }
                }
            }
            for (JsonElement r : m.getAsJsonArray("removed")) {
                if (objects.remove(r.getAsString()) == null) {
                    errors.add("removed unknown " + r.getAsString());
                }
            }
        }
    }

    static String keyOf(JsonObject o) {
        String k = o.get("type").getAsString() + ":" + o.get("id").getAsInt();
        return o.has("state") ? k + ":" + o.get("state").getAsString() : k;
    }

    int mark() {
        return frames.size();
    }

    String textSince(int mark) {
        return String.join("\n", frames.subList(mark, frames.size()));
    }

    String allText() {
        return textSince(0);
    }

    JsonObject props(String key) {
        JsonObject o = objects.get(key);
        return o == null ? null : o.getAsJsonObject("props");
    }

    List<Integer> zone(int playerId, String zone) {
        List<Integer> ids = new ArrayList<>();
        JsonObject p = props("player:" + playerId);
        if (p != null && p.has(zone)) {
            for (JsonElement e : p.getAsJsonArray(zone)) {
                ids.add(e.getAsInt());
            }
        }
        return ids;
    }

    /** Same objects and properties as the server's snapshot for this viewer. */
    String diffAgainst(String snapshotJson) {
        JsonArray server = JsonParser.parseString(snapshotJson).getAsJsonObject().getAsJsonArray("objects");
        Map<String, JsonObject> s = new LinkedHashMap<>();
        for (JsonElement o : server) {
            s.put(keyOf(o.getAsJsonObject()), o.getAsJsonObject());
        }
        if (!s.keySet().equals(objects.keySet())) {
            List<String> onlyServer = new ArrayList<>(s.keySet());
            onlyServer.removeAll(objects.keySet());
            List<String> onlyClient = new ArrayList<>(objects.keySet());
            onlyClient.removeAll(s.keySet());
            return "keys differ: server-only " + onlyServer + ", client-only " + onlyClient;
        }
        for (Map.Entry<String, JsonObject> e : s.entrySet()) {
            if (!e.getValue().getAsJsonObject("props").equals(objects.get(e.getKey()).getAsJsonObject("props"))) {
                return "props differ for " + e.getKey();
            }
        }
        return null;
    }
}
