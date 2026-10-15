package forge.web.bridge.visibility;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Collections;
import java.util.ConcurrentModificationException;
import java.util.Deque;
import java.util.HashMap;
import java.util.IdentityHashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

import forge.game.GameEntityView;
import forge.game.GameView;
import forge.game.card.CardView;
import forge.game.player.PlayerView;
import forge.game.zone.ZoneType;
import forge.trackable.TrackableCollection;
import forge.trackable.TrackableObject;
import forge.trackable.TrackableProperty;

/**
 * The live {@link CardView} behind each card id, found the way {@code DeltaSyncManager} walks the
 * view graph: zone instances are authoritative (a zone change makes a new view with the same id),
 * then everything reachable from the game, skipping card-to-card and player-to-card scalar
 * cross-references, which can be stale. Game thread only.
 */
public final class LiveCards {

    private static final int ATTEMPTS = 3;

    private final Map<Integer, CardView> byId;
    /** Card ids of each zone in order: {@code playerId:Zone -> ids}. */
    private final Map<String, List<Integer>> zones;

    private LiveCards(Map<Integer, CardView> byId, Map<String, List<Integer>> zones) {
        this.byId = byId;
        this.zones = zones;
    }

    public CardView get(int id) {
        return byId.get(id);
    }

    public Map<Integer, CardView> all() {
        return Collections.unmodifiableMap(byId);
    }

    public Map<String, List<Integer>> zones() {
        return Collections.unmodifiableMap(zones);
    }

    public static String zoneKey(int playerId, ZoneType zone) {
        return playerId + ":" + zone.name();
    }

    /**
     * Walks the graph. Another thread can mutate it meanwhile (the reason {@code DeltaSyncManager}
     * retries too); after the last failed attempt the partial result is returned, and cards it
     * misses are treated as hidden by the caller.
     */
    public static LiveCards of(GameView gv) {
        Map<Integer, CardView> byId = new HashMap<>();
        Map<String, List<Integer>> zones = new LinkedHashMap<>();
        for (int attempt = 1; attempt <= ATTEMPTS; attempt++) {
            byId = new HashMap<>();
            zones = new LinkedHashMap<>();
            try {
                walk(gv, byId, zones);
                break;
            } catch (ConcurrentModificationException e) {
                // retry
            }
        }
        return new LiveCards(byId, zones);
    }

    private static void walk(GameView gv, Map<Integer, CardView> byId, Map<String, List<Integer>> zones) {
        if (gv == null) {
            return;
        }
        if (gv.getPlayers() != null) {
            for (PlayerView p : gv.getPlayers()) {
                for (ZoneType z : ZoneType.values()) {
                    if (z.getTrackableProperty() == null) {
                        continue;
                    }
                    List<Integer> ids = new ArrayList<>();
                    for (CardView c : p.getCards(z)) {
                        if (c == null) {
                            continue;
                        }
                        ids.add(c.getId());
                        byId.putIfAbsent(c.getId(), c);
                    }
                    if (!ids.isEmpty()) {
                        zones.put(zoneKey(p.getId(), z), ids);
                    }
                }
            }
        }
        Set<TrackableObject> visited = Collections.newSetFromMap(new IdentityHashMap<>());
        Deque<TrackableObject> todo = new ArrayDeque<>();
        todo.push(gv);
        while (!todo.isEmpty()) {
            TrackableObject o = todo.pop();
            if (!visited.add(o)) {
                continue;
            }
            if (o instanceof CardView cv) {
                CardView known = byId.putIfAbsent(cv.getId(), cv);
                if (known != null && known != cv) {
                    continue; // stale instance: do not walk it
                }
            }
            boolean entity = o instanceof GameEntityView;
            Map<TrackableProperty, Object> props = o.getProps();
            for (Object v : props.values()) {
                if (v instanceof TrackableObject t) {
                    if (!(entity && t instanceof GameEntityView)) {
                        todo.push(t);
                    }
                } else if (v instanceof TrackableCollection<?> tc) {
                    for (Object item : tc) {
                        if (item instanceof TrackableObject t) {
                            todo.push(t);
                        }
                    }
                }
            }
        }
    }
}
