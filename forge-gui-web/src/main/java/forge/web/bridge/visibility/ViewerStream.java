package forge.web.bridge.visibility;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;

import forge.game.card.CardView;
import forge.web.bridge.StateMirror;
import forge.web.bridge.WireEncoder.ObjRef;

/**
 * One viewer's filtered copy of the game: what this viewer may know, as JSON, plus the
 * bookkeeping that keeps hidden cards anonymous.
 *
 * <p>A card this viewer may see in full travels under its engine id. Any other card travels under
 * an alias (from {@link #ALIAS_BASE} up, never reused) as a placeholder or a face-down card. The
 * alias is replaced by a fresh one whenever the card stops being fully visible, and whenever its
 * zone is shuffled or reordered, so a client cannot follow a once-seen card into a hidden zone.
 * When a card's id changes for this viewer, every reference to it in the mirror is rewritten and
 * sent as a change.
 *
 * <p>Not thread-safe: the owning stream serialises access.
 */
public final class ViewerStream {

    /** First alias id; engine card ids stay far below. */
    public static final int ALIAS_BASE = 1 << 30;

    /** What one flush changes for this viewer. */
    public record Delta(List<StateMirror.Obj> news, Map<String, JsonObject> changes, List<String> removed) {
        public boolean isEmpty() {
            return news.isEmpty() && changes.isEmpty() && removed.isEmpty();
        }
    }

    private final Viewer viewer;
    private final StateMirror mirror = new StateMirror();
    /** Visibility of each card as last sent, by engine id. */
    private final Map<Integer, Visibility> levels = new HashMap<>();
    private final Map<Integer, Integer> aliasOf = new HashMap<>();
    private final Map<Integer, Integer> realOf = new HashMap<>();
    private int nextAlias = ALIAS_BASE;
    private long seq;

    public ViewerStream(Viewer viewer) {
        this.viewer = viewer;
    }

    public Viewer viewer() {
        return viewer;
    }

    public StateMirror mirror() {
        return mirror;
    }

    public long seq() {
        return seq;
    }

    public long nextSeq() {
        return ++seq;
    }

    /** The engine id behind a wire id this viewer was sent, or -1 if it holds no card under that id. */
    public int realCardId(int wireId) {
        Integer real = realOf.get(wireId);
        if (real != null) {
            return real;
        }
        return levels.get(wireId) == Visibility.FULL && mirror.get("card:" + wireId) != null ? wireId : -1;
    }

    /** Filters one flush for this viewer and applies it to the mirror. */
    public Delta apply(Flush f) {
        Map<Integer, Visibility> now = new HashMap<>();
        for (Map.Entry<Integer, CardView> e : f.live().all().entrySet()) {
            now.put(e.getKey(), viewer.of(e.getValue()));
        }
        for (Integer id : f.packetCardIds()) {
            now.putIfAbsent(id, Visibility.HIDDEN); // in the packet but not found live: never fail open
        }

        // Aliases are handed out in zone order, never in engine-id order: the id order of a shuffled
        // library would otherwise tell a client where a card it knows by engine id went.
        Set<Integer> order = new LinkedHashSet<>();
        for (List<Integer> zone : f.live().zones().values()) {
            order.addAll(zone);
        }
        order.addAll(now.keySet());

        Map<Integer, Integer> renames = new HashMap<>();
        Set<Integer> whole = new LinkedHashSet<>();
        for (int id : order) {
            Visibility lvl = now.get(id);
            Visibility prev = levels.get(id);
            Integer oldWire = prev == null ? null : prev == Visibility.FULL ? Integer.valueOf(id) : aliasOf.get(id);
            int wire;
            if (lvl == Visibility.FULL) {
                dropAlias(id);
                wire = id;
            } else if (prev == null || prev == Visibility.FULL || !aliasOf.containsKey(id) || f.reordered(id)) {
                wire = freshAlias(id);
            } else {
                wire = aliasOf.get(id);
            }
            if (prev == null || prev != lvl || oldWire == null || oldWire != wire || f.isNewInPacket(id)) {
                whole.add(id);
            }
            if (oldWire != null && oldWire != wire) {
                renames.put(oldWire, wire);
            }
        }
        levels.clear();
        levels.putAll(now);
        for (Iterator<Map.Entry<Integer, Integer>> it = aliasOf.entrySet().iterator(); it.hasNext();) {
            Map.Entry<Integer, Integer> e = it.next();
            if (!now.containsKey(e.getKey())) {
                realOf.remove(e.getValue());
                it.remove();
            }
        }

        Map<String, StateMirror.Obj> news = new LinkedHashMap<>();
        Map<String, JsonObject> changes = new LinkedHashMap<>();

        // cards sent whole: new, replaced, or changed visibility or id for this viewer
        for (int id : whole) {
            JsonObject props = f.cardProps(id);
            if (props == null) {
                continue;
            }
            Visibility lvl = now.get(id);
            int w = wire(id);
            JsonObject projected = CardRefs.map(Projection.card(props, lvl), this::wire);
            putNew(news, new StateMirror.Obj("card", w, null, projected));
            JsonElement current = projected.get("CurrentState");
            for (Map.Entry<String, JsonObject> st : f.cardStates(id).entrySet()) {
                if (stateAllowed(lvl, st.getKey(), current)) {
                    putNew(news, new StateMirror.Obj("cardState", w, st.getKey(), CardRefs.map(st.getValue(), this::wire)));
                }
            }
        }
        for (Flush.Entry e : f.news()) {
            ObjRef ref = e.ref();
            if ("card".equals(ref.type())) {
                continue; // in whole
            }
            if ("cardState".equals(ref.type())) {
                if (whole.contains(ref.id())) {
                    continue;
                }
                Visibility lvl = now.get(ref.id());
                JsonElement current = currentState(ref.id());
                if (stateAllowed(lvl, ref.state(), current)) {
                    putNew(news, new StateMirror.Obj("cardState", wire(ref.id()), ref.state(), CardRefs.map(e.props(), this::wire)));
                }
                continue;
            }
            putNew(news, new StateMirror.Obj(ref.type(), ref.id(), ref.state(), CardRefs.map(e.props(), this::wire)));
        }
        for (Flush.Entry e : f.changes()) {
            ObjRef ref = e.ref();
            String key;
            JsonObject props;
            if ("card".equals(ref.type())) {
                if (whole.contains(ref.id())) {
                    continue;
                }
                key = "card:" + wire(ref.id());
                props = CardRefs.map(Projection.card(e.props(), now.get(ref.id())), this::wire);
            } else if ("cardState".equals(ref.type())) {
                if (whole.contains(ref.id()) || !stateAllowed(now.get(ref.id()), ref.state(), currentState(ref.id()))) {
                    continue;
                }
                key = "cardState:" + wire(ref.id()) + ":" + ref.state();
                props = CardRefs.map(e.props(), this::wire);
            } else {
                key = ref.key();
                props = CardRefs.map(e.props(), this::wire);
            }
            if (news.containsKey(key) || props.isEmpty()) {
                continue;
            }
            mergeInto(changes, key, props);
        }

        // apply: whole objects, then changes to objects the client holds, then rewrite renamed ids
        Set<String> heldBefore = new HashSet<>();
        for (StateMirror.Obj o : news.values()) {
            if (mirror.get(o.key()) != null) {
                heldBefore.add(o.key());
            }
            mirror.putNew(o);
            if ("game".equals(o.type())) {
                mirror.setRoot(o.key());
            }
        }
        changes.keySet().removeIf(k -> mirror.get(k) == null);
        for (Map.Entry<String, JsonObject> e : changes.entrySet()) {
            mirror.merge(e.getKey(), e.getValue());
        }
        if (!renames.isEmpty()) {
            for (Map.Entry<String, JsonObject> e : mirror.rewriteCardRefs(renames).entrySet()) {
                if (!news.containsKey(e.getKey())) {
                    mergeInto(changes, e.getKey(), e.getValue());
                }
            }
        }
        List<String> removed = new ArrayList<>();
        for (String k : mirror.prune()) {
            changes.remove(k);
            if (news.remove(k) == null || heldBefore.contains(k)) {
                removed.add(k);
            }
        }
        return new Delta(new ArrayList<>(news.values()), changes, removed);
    }

    private JsonElement currentState(int cardId) {
        StateMirror.Obj o = mirror.get("card:" + wire(cardId));
        return o == null ? null : o.props().get("CurrentState");
    }

    private static boolean stateAllowed(Visibility lvl, String state, JsonElement current) {
        if (lvl == null || !Projection.stateAllowed(lvl, state)) {
            return false;
        }
        return lvl == Visibility.FULL || (current != null && current.isJsonPrimitive() && state.equals(current.getAsString()));
    }

    private static void putNew(Map<String, StateMirror.Obj> news, StateMirror.Obj o) {
        news.put(o.key(), o);
    }

    private static void mergeInto(Map<String, JsonObject> changes, String key, JsonObject props) {
        JsonObject existing = changes.get(key);
        if (existing == null) {
            changes.put(key, props);
            return;
        }
        for (Map.Entry<String, JsonElement> e : props.entrySet()) {
            existing.add(e.getKey(), e.getValue());
        }
    }

    /** The id this viewer knows a card by: its engine id if fully visible, else its alias. */
    private int wire(int realId) {
        Visibility lvl = levels.get(realId);
        if (lvl == null || lvl == Visibility.FULL) {
            return realId;
        }
        Integer a = aliasOf.get(realId);
        return a == null ? realId : a;
    }

    private int freshAlias(int realId) {
        dropAlias(realId);
        int a = nextAlias++;
        aliasOf.put(realId, a);
        realOf.put(a, realId);
        return a;
    }

    private void dropAlias(int realId) {
        Integer old = aliasOf.remove(realId);
        if (old != null) {
            realOf.remove(old);
        }
    }
}
