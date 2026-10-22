package forge.fork.web.bridge.visibility;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.function.IntUnaryOperator;

import com.google.gson.JsonElement;
import com.google.gson.JsonNull;
import com.google.gson.JsonObject;

import forge.game.card.CardView;
import forge.game.zone.ZoneType;
import forge.trackable.TrackableProperty;
import forge.fork.web.bridge.StateMirror;
import forge.fork.web.bridge.WireEncoder.ObjRef;

/**
 * One viewer's filtered copy of the game: what this viewer may know, as JSON, plus the
 * bookkeeping that keeps hidden cards anonymous.
 *
 * <p>A card this viewer may see in full travels under its engine id. Any other card travels under
 * an alias (from {@link #ALIAS_BASE} up, never reused) as a placeholder or a face-down card. The
 * alias is replaced by a fresh one whenever the card stops being fully visible, and whenever its
 * zone is shuffled or reordered.
 *
 * <p>References. Zone lists name each card by its id or alias, so counts and positions hold. Any
 * other reference names a face-down card by its alias (attachments, combat, targets) and a hidden
 * card by its <em>unseen id</em>: an id from the alias range that names no object, the same in
 * every reference until the card is visible in full again, then replaced by the engine id. The
 * reveal history ({@code RevealedCardsCollection}) never names an alias: a face-down card is its
 * unseen id there. When a card's id changes, zone lists follow it; other references follow only a
 * public link (alias to engine id; a face-down card that stays on the battlefield). Otherwise a
 * reference that held the engine id gets the unseen id, and one that held an alias gets {@code -1}.
 * So a client cannot follow a once-seen card into a hidden zone or through a shuffle; only its slot
 * in a zone list it stays in (a re-hidden hand card) still places it.
 *
 * <p>Not thread-safe: the owning stream serialises access.
 */
public final class ViewerStream {

    /** First alias id; engine card ids stay far below. */
    public static final int ALIAS_BASE = 1 << 30;

    /** Player properties that list a zone's cards. */
    private static final Set<String> ZONE_LISTS = zoneLists();
    /** References that record which card was seen: never an alias. */
    private static final Set<String> IDENTITY_REFS = Set.of(TrackableProperty.RevealedCardsCollection.name());

    private static Set<String> zoneLists() {
        Set<String> s = new HashSet<>();
        for (ZoneType z : ZoneType.values()) {
            if (z.getTrackableProperty() != null) {
                s.add(z.getTrackableProperty().name());
            }
        }
        return s;
    }

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
    /** Unseen id of each card this viewer may not see in full, once a reference outside zone lists named it. */
    private final Map<Integer, Integer> unseenOf = new HashMap<>();
    private final Function<String, IntUnaryOperator> refs = this::refsFor;
    private int nextAlias = ALIAS_BASE;
    private long seq;

    /** Source property -> the property carrying its translation, by object type. The source (English) stays as is: the client's logic keys on it. */
    private static final Map<String, Map<String, String>> LOCAL_PROPS = Map.of(
            "card", Map.of(TrackableProperty.Name.name(), "LocalName"),
            "cardState", Map.of(TrackableProperty.Name.name(), "LocalName",
                    TrackableProperty.Type.name(), "LocalType",
                    TrackableProperty.OracleText.name(), "LocalOracleText"));

    /** The viewer's language, {@code en} or {@code fr}; fully visible cards carry {@code Local*} translations in it. */
    private String lang = "en";
    /** Keys of the card and card-state objects in the mirror that were sent in full (the only ones ever translated). */
    private final Set<String> full = new HashSet<>();

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

    /**
     * How this viewer names a card outside zone lists, as of the last flush: engine id if visible in
     * full, alias if face down, else its unseen id; -1 if this viewer was never told of the card.
     * For references in prompts and calls sent to a seat.
     */
    public int refOf(int realId) {
        return tableRef(realId);
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

        Map<Integer, Integer> zoneRenames = new HashMap<>();
        Map<Integer, Integer> refRenames = new HashMap<>();
        Map<Integer, Integer> identityRenames = new HashMap<>();
        Set<Integer> whole = new LinkedHashSet<>();
        for (int id : order) {
            Visibility lvl = now.get(id);
            Visibility prev = levels.get(id);
            Integer oldWire = prev == null ? null : prev == Visibility.FULL ? Integer.valueOf(id) : aliasOf.get(id);
            boolean wasOnBattlefield = oldWire != null && onBattlefield(mirror.get("card:" + oldWire));
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
            if (oldWire != null) {
                if (oldWire != wire) {
                    zoneRenames.put(oldWire, wire);
                }
                CardView cv = f.live().get(id);
                boolean stayedOnBattlefield = wasOnBattlefield && cv != null && cv.getZone() == ZoneType.Battlefield;
                renameRefs(id, prev, lvl, oldWire, wire, stayedOnBattlefield, refRenames, identityRenames);
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
        unseenOf.keySet().retainAll(now.keySet());

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
            JsonObject projected = CardRefs.map(Projection.card(props, lvl), refs);
            localise("card:" + w, projected, lvl, true);
            putNew(news, new StateMirror.Obj("card", w, null, projected));
            JsonElement current = projected.get("CurrentState");
            for (Map.Entry<String, JsonObject> st : f.cardStates(id).entrySet()) {
                if (stateAllowed(lvl, st.getKey(), current)) {
                    JsonObject sp = CardRefs.map(st.getValue(), refs);
                    localise("cardState:" + w + ":" + st.getKey(), sp, lvl, true);
                    putNew(news, new StateMirror.Obj("cardState", w, st.getKey(), sp));
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
                    JsonObject sp = CardRefs.map(e.props(), refs);
                    localise("cardState:" + wire(ref.id()) + ":" + ref.state(), sp, lvl, true);
                    putNew(news, new StateMirror.Obj("cardState", wire(ref.id()), ref.state(), sp));
                }
                continue;
            }
            putNew(news, new StateMirror.Obj(ref.type(), ref.id(), ref.state(), CardRefs.map(e.props(), refs)));
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
                props = CardRefs.map(Projection.card(e.props(), now.get(ref.id())), refs);
                localise(key, props, now.get(ref.id()), false);
            } else if ("cardState".equals(ref.type())) {
                if (whole.contains(ref.id()) || !stateAllowed(now.get(ref.id()), ref.state(), currentState(ref.id()))) {
                    continue;
                }
                key = "cardState:" + wire(ref.id()) + ":" + ref.state();
                props = CardRefs.map(e.props(), refs);
                localise(key, props, now.get(ref.id()), false);
            } else {
                key = ref.key();
                props = CardRefs.map(e.props(), refs);
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
        if (!zoneRenames.isEmpty() || !refRenames.isEmpty() || !identityRenames.isEmpty()) {
            Function<String, IntUnaryOperator> renamer = prop -> {
                Map<Integer, Integer> m = ZONE_LISTS.contains(prop) ? zoneRenames
                        : IDENTITY_REFS.contains(prop) ? identityRenames : refRenames;
                return m.isEmpty() ? null : id -> m.getOrDefault(id, id);
            };
            for (Map.Entry<String, JsonObject> e : mirror.rewriteCardRefs(renamer).entrySet()) {
                if (!news.containsKey(e.getKey())) {
                    mergeInto(changes, e.getKey(), e.getValue());
                }
            }
        }
        List<String> removed = new ArrayList<>();
        full.removeIf(k -> mirror.get(k) == null);
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

    /**
     * How references other than zone lists follow a card whose state changed for this viewer
     * (see the class comment). Fills {@code refRenames} (attachments, targets...) and
     * {@code identityRenames} (reveal history) with {@code old id -> new id}.
     */
    private void renameRefs(int id, Visibility prev, Visibility lvl, int oldWire, int wire, boolean stayedOnBattlefield,
            Map<Integer, Integer> refRenames, Map<Integer, Integer> identityRenames) {
        if (lvl == Visibility.FULL) {
            if (prev != Visibility.FULL) {
                refRenames.put(oldWire, id); // a face-down card turned face up or revealed
            }
            Integer unseen = unseenOf.remove(id);
            if (unseen != null) {
                refRenames.put(unseen, id);
                identityRenames.put(unseen, id);
            }
            return;
        }
        boolean publicLink = lvl == Visibility.FACE_DOWN && prev != Visibility.HIDDEN && stayedOnBattlefield;
        if (prev == Visibility.FULL) {
            int unseen = unseen(id);
            identityRenames.put(id, unseen);
            refRenames.put(id, publicLink ? wire : unseen);
        } else if (oldWire != wire) {
            refRenames.put(oldWire, publicLink ? wire : -1);
        } else if (prev == Visibility.FACE_DOWN && lvl == Visibility.HIDDEN) {
            refRenames.put(oldWire, -1);
        }
    }

    private static boolean onBattlefield(StateMirror.Obj card) {
        JsonElement z = card == null ? null : card.props().get(TrackableProperty.Zone.name());
        return z != null && z.isJsonPrimitive() && ZoneType.Battlefield.name().equals(z.getAsString());
    }

    public String language() {
        return lang;
    }

    /**
     * Switches the language of the card text. Returns what changed in the mirror, for the client to
     * merge; reads only the mirror, never the live game.
     */
    public Delta setLanguage(String newLang) {
        String l = CardText.locale(newLang) == null ? "en" : newLang;
        Map<String, JsonObject> changes = new LinkedHashMap<>();
        if (!l.equals(lang)) {
            lang = l;
            for (String key : full) {
                StateMirror.Obj o = mirror.get(key);
                if (o == null) {
                    continue;
                }
                JsonObject ch = new JsonObject();
                addLocal(key, o.props(), o.props(), ch);
                if (!ch.isEmpty()) {
                    changes.put(key, ch);
                    mirror.merge(key, ch);
                }
            }
        }
        return new Delta(List.of(), changes, List.of());
    }

    /**
     * Adds the {@code Local*} translations of a fully visible card object to its outgoing {@code props}
     * (the whole object, or the changed properties of one the mirror holds); English objects get none.
     */
    private void localise(String key, JsonObject props, Visibility lvl, boolean whole) {
        if (whole) {
            full.remove(key);
        }
        if (lvl != Visibility.FULL) {
            return;
        }
        full.add(key);
        JsonObject held = whole ? null : mirror.get(key) == null ? null : mirror.get(key).props();
        JsonObject context = new JsonObject();
        if (held != null) {
            held.entrySet().forEach(e -> context.add(e.getKey(), e.getValue()));
        }
        props.entrySet().forEach(e -> context.add(e.getKey(), e.getValue()));
        addLocal(key, context, held, props);
    }

    /** Puts into {@code out} each translation that differs from {@code held} (null when the object is new). */
    private void addLocal(String key, JsonObject context, JsonObject held, JsonObject out) {
        String type = key.startsWith("cardState:") ? "cardState" : "card";
        for (Map.Entry<String, String> f : LOCAL_PROPS.get(type).entrySet()) {
            JsonElement en = context.get(f.getKey());
            String local = en != null && en.isJsonPrimitive() ? translate(f.getKey(), en.getAsString(), context) : null;
            JsonElement cur = held == null ? null : held.get(f.getValue());
            if (local != null) {
                if (cur == null || !cur.isJsonPrimitive() || !local.equals(cur.getAsString())) {
                    out.addProperty(f.getValue(), local);
                }
            } else if (cur != null) {
                out.add(f.getValue(), JsonNull.INSTANCE);
            }
        }
    }

    /** The viewer's translation of one text property, or null (English language, no translation, or a changed text). */
    private String translate(String prop, String en, JsonObject context) {
        String locale = CardText.locale(lang);
        JsonElement on = context.get(TrackableProperty.OracleName.name());
        if (locale == null || on == null || !on.isJsonPrimitive()) {
            return null;
        }
        String oracleName = on.getAsString();
        JsonElement fv = context.get(TrackableProperty.FunctionalVariant.name());
        String variant = fv != null && fv.isJsonPrimitive() ? fv.getAsString() : null;
        String out = null;
        if (TrackableProperty.Name.name().equals(prop)) {
            out = en.equals(oracleName) ? CardText.name(locale, oracleName, variant) : null; // a flavour name stays
        } else if (TrackableProperty.Type.name().equals(prop)) {
            out = CardText.type(locale, oracleName, variant, en);
        } else if (TrackableProperty.OracleText.name().equals(prop)) {
            out = CardText.oracle(locale, oracleName, variant, en);
        }
        return out == null || out.isEmpty() || out.equals(en) ? null : out;
    }

    /** How a property names cards for this viewer. */
    private IntUnaryOperator refsFor(String prop) {
        if (ZONE_LISTS.contains(prop)) {
            return this::wire;
        }
        return IDENTITY_REFS.contains(prop) ? this::identityRef : this::tableRef;
    }

    /** The id this viewer knows a card by in a zone list: its engine id if fully visible, else its alias; -1 if unknown. */
    private int wire(int realId) {
        Visibility lvl = levels.get(realId);
        if (lvl == null) {
            return -1; // never fail open
        }
        if (lvl == Visibility.FULL) {
            return realId;
        }
        Integer a = aliasOf.get(realId);
        return a == null ? -1 : a;
    }

    /** A reference outside zone lists: engine id, face-down alias, else the card's unseen id; -1 if unknown. */
    private int tableRef(int realId) {
        Visibility lvl = levels.get(realId);
        if (lvl == Visibility.FULL || lvl == Visibility.FACE_DOWN) {
            return wire(realId);
        }
        return lvl == null ? -1 : unseen(realId);
    }

    /** A reveal-history entry: engine id, else the card's unseen id, never an alias; -1 if unknown. */
    private int identityRef(int realId) {
        Visibility lvl = levels.get(realId);
        if (lvl == Visibility.FULL) {
            return realId;
        }
        return lvl == null ? -1 : unseen(realId);
    }

    private int unseen(int realId) {
        return unseenOf.computeIfAbsent(realId, k -> nextAlias++);
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
