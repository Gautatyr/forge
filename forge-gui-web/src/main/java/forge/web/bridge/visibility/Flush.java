package forge.web.bridge.visibility;

import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

import com.google.gson.JsonObject;

import forge.game.card.CardView;
import forge.game.card.CardView.CardStateView;
import forge.web.bridge.WireEncoder;
import forge.web.bridge.WireEncoder.ObjRef;

/**
 * One flush, shared by every viewer: the delta engine's packet encoded once (real ids), the live
 * cards, and the cards whose zone was shuffled or reordered. Live encodings are computed on
 * demand and cached, so a card re-sent to several viewers is encoded once. Game thread only.
 */
public final class Flush {

    /** One packet entry: a whole new object or the changed properties of a known one. */
    public record Entry(ObjRef ref, JsonObject props) { }

    private final LiveCards live;
    private final List<Entry> news;
    private final List<Entry> changes;
    private final Set<Integer> reordered;
    private final Map<Integer, JsonObject> packetCards = new HashMap<>();
    private final Map<Integer, Map<String, JsonObject>> packetStates = new HashMap<>();
    private final Set<Integer> packetCardIds = new HashSet<>();
    private final Map<Integer, JsonObject> liveCardCache = new HashMap<>();
    private final Map<Integer, Map<String, JsonObject>> liveStateCache = new HashMap<>();

    public Flush(LiveCards live, List<Entry> news, List<Entry> changes, Set<Integer> reordered) {
        this.live = live;
        this.news = news;
        this.changes = changes;
        this.reordered = reordered;
        for (Entry e : news) {
            if ("card".equals(e.ref().type())) {
                packetCards.put(e.ref().id(), e.props());
                packetCardIds.add(e.ref().id());
            } else if ("cardState".equals(e.ref().type())) {
                packetStates.computeIfAbsent(e.ref().id(), k -> new LinkedHashMap<>()).put(e.ref().state(), e.props());
                packetCardIds.add(e.ref().id());
            }
        }
        for (Entry e : changes) {
            if ("card".equals(e.ref().type()) || "cardState".equals(e.ref().type())) {
                packetCardIds.add(e.ref().id());
            }
        }
    }

    public LiveCards live() {
        return live;
    }

    public List<Entry> news() {
        return news;
    }

    public List<Entry> changes() {
        return changes;
    }

    public boolean reordered(int cardId) {
        return reordered.contains(cardId);
    }

    /** Card ids the packet mentions (cards and card states). */
    public Set<Integer> packetCardIds() {
        return packetCardIds;
    }

    public boolean isNewInPacket(int cardId) {
        return packetCards.containsKey(cardId);
    }

    /** All properties of a card: the packet's if it sent the card whole, else the live view's; null if unknown. */
    public JsonObject cardProps(int id) {
        JsonObject p = packetCards.get(id);
        if (p != null) {
            return p;
        }
        CardView cv = live.get(id);
        if (cv == null) {
            return null;
        }
        return liveCardCache.computeIfAbsent(id, k -> WireEncoder.encodeProps(cv.getProps()));
    }

    /** {@code state name -> properties} of a card's states: live ones, overridden by the packet's whole ones. */
    public Map<String, JsonObject> cardStates(int id) {
        Map<String, JsonObject> out = new LinkedHashMap<>();
        CardView cv = live.get(id);
        if (cv != null) {
            out.putAll(liveStateCache.computeIfAbsent(id, k -> encodeStates(cv)));
        }
        Map<String, JsonObject> fromPacket = packetStates.get(id);
        if (fromPacket != null) {
            out.putAll(fromPacket);
        }
        return out;
    }

    private static Map<String, JsonObject> encodeStates(CardView cv) {
        Map<String, JsonObject> m = new LinkedHashMap<>();
        for (CardStateView csv : new CardStateView[] {cv.getCurrentState(), cv.getAlternateState(),
                cv.getLeftSplitState(), cv.getRightSplitState()}) {
            if (csv != null) {
                m.putIfAbsent(csv.getState().name(), WireEncoder.encodeProps(csv.getProps()));
            }
        }
        return m;
    }
}
