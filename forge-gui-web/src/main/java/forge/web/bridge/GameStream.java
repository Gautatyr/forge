package forge.web.bridge;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.CopyOnWriteArraySet;
import java.util.concurrent.CountDownLatch;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;

import forge.game.GameLog;
import forge.game.GameLogEntry;
import forge.game.GameView;
import forge.game.card.CardView;
import forge.game.card.CardView.CardStateView;
import forge.game.event.GameEvent;
import forge.game.player.PlayerView;
import forge.game.spellability.StackItemView;
import forge.game.zone.ZoneType;
import forge.gamemodes.net.DeltaPacket;
import forge.gamemodes.net.server.DeltaSyncManager;
import forge.trackable.TrackableProperty;
import forge.web.bridge.WireEncoder.ObjRef;

/**
 * Turns one game's view graph into a JSON stream: a snapshot for each connecting client, then
 * deltas. Delta collection reuses network play's {@link DeltaSyncManager} unchanged; this class
 * only encodes its packets, applies the viewer's visibility policy and keeps a {@link StateMirror}
 * of what clients hold.
 *
 * <p>Threads: {@link #publish} runs on the game thread (the trackable graph is single-mutator);
 * {@link #addClient} runs on a transport thread and reads only the mirror. Both hold {@link #lock},
 * so a client's snapshot is always followed by exactly the deltas after it.
 */
public final class GameStream {

    /** What a viewer may see of hidden zones. */
    public enum HiddenPolicy {
        /** Cards in Library and Hand are sent as {Zone, Owner, Controller} only: a public spectator. */
        REDACT,
        /** Everything the engine tracks, as network play sends it today. */
        FULL
    }

    private static final Set<String> HIDDEN_CARD_WHITELIST = Set.of(
            TrackableProperty.Zone.name(), TrackableProperty.Owner.name(), TrackableProperty.Controller.name());
    private static final int LOG_TAIL = 400;

    private final Object lock = new Object();
    private final Set<ClientSink> clients = new CopyOnWriteArraySet<>();
    private final StateMirror mirror = new StateMirror();
    private final Deque<JsonObject> logTail = new ArrayDeque<>();
    private final HiddenPolicy policy;
    private final Path metricsDir;
    private final JsonObject hello;

    private String label = "game";
    private GameView gameView;
    private DeltaSyncManager dsm;
    private StreamMetrics metrics;
    private int gameNumber;
    private long seq;
    private int logIndex;
    private int lastSampledTurn = -1;
    private volatile CountDownLatch gameOver = new CountDownLatch(1);

    public GameStream(HiddenPolicy policy, Path metricsDir) {
        this.policy = policy;
        this.metricsDir = metricsDir;
        hello = new JsonObject();
        hello.addProperty("t", "hello");
        hello.addProperty("v", 1);
        hello.addProperty("hidden", policy.name());
        hello.add("schema", WireSchema.schemaJson());
    }

    public void setLabel(String label) {
        this.label = label;
    }

    /** Binds a new game. Called from the spectator GUI's openView, before the game thread starts. */
    public void startGame(GameView gv) {
        synchronized (lock) {
            gameView = gv;
            dsm = new DeltaSyncManager();
            mirror.clear();
            logTail.clear();
            seq = 0;
            logIndex = 0;
            lastSampledTurn = -1;
            gameNumber++;
            metrics = new StreamMetrics(label + "-game" + gameNumber);
            gameOver = new CountDownLatch(1);
            String snap = snapshotJson();
            for (ClientSink c : clients) {
                c.send(snap);
            }
        }
    }

    public CountDownLatch gameOverLatch() {
        return gameOver;
    }

    public void addClient(ClientSink c) {
        synchronized (lock) {
            c.send(hello.toString());
            String snap = snapshotJson();
            c.send(snap);
            if (metrics != null) {
                metrics.recordClientSnapshot(StreamMetrics.utf8(snap).length);
            }
            clients.add(c);
        }
    }

    public void removeClient(ClientSink c) {
        clients.remove(c);
    }

    public int clientCount() {
        return clients.size();
    }

    /** Current snapshot as served to a new client. Thread-safe. */
    public String snapshot() {
        synchronized (lock) {
            return snapshotJson();
        }
    }

    public String metricsJson() {
        synchronized (lock) {
            return metrics == null ? "{}" : metrics.toJson().toString();
        }
    }

    private String snapshotJson() {
        long t0 = System.nanoTime();
        JsonObject o = new JsonObject();
        o.addProperty("t", "snapshot");
        o.addProperty("game", gameNumber);
        o.addProperty("seq", seq);
        o.addProperty("label", label);
        o.add("objects", mirror.toJsonObjects());
        JsonArray log = new JsonArray();
        logTail.forEach(log::add);
        o.add("log", log);
        String s = o.toString();
        if (metrics != null) {
            metrics.recordSnapshotSerialize(System.nanoTime() - t0);
        }
        return s;
    }

    /** Game thread. Collects what changed since the last call and sends it as one delta. */
    public void publish(List<GameEvent> events, boolean final0) {
        synchronized (lock) {
            if (gameView == null || dsm == null) {
                return;
            }
            long t0 = System.nanoTime();
            DeltaPacket packet = dsm.collectDeltas(gameView);

            Map<String, StateMirror.Obj> news = new LinkedHashMap<>();
            Map<String, JsonObject> changes = new LinkedHashMap<>();
            for (Map.Entry<Integer, Map<TrackableProperty, Object>> e : packet.getNewObjects().entrySet()) {
                ObjRef ref = WireEncoder.decodeKey(e.getKey());
                acceptNew(ref, WireEncoder.encodeProps(e.getValue()), news);
            }
            for (Map.Entry<Integer, Map<TrackableProperty, Object>> e : packet.getObjectDeltas().entrySet()) {
                ObjRef ref = WireEncoder.decodeKey(e.getKey());
                acceptChange(ref, WireEncoder.encodeProps(e.getValue()), news, changes);
            }

            // apply to the mirror first: removals are computed against the post-delta state
            for (StateMirror.Obj o : news.values()) {
                mirror.putNew(o);
                if ("game".equals(o.type())) {
                    mirror.setRoot(o.key());
                }
            }
            for (Map.Entry<String, JsonObject> e : changes.entrySet()) {
                mirror.merge(e.getKey(), e.getValue());
            }
            List<String> removed = mirror.prune();
            JsonArray newLog = drainLog();

            if (news.isEmpty() && changes.isEmpty() && removed.isEmpty() && newLog.isEmpty() && !final0) {
                return;
            }
            seq++;
            JsonObject msg = new JsonObject();
            msg.addProperty("t", "delta");
            msg.addProperty("game", gameNumber);
            msg.addProperty("seq", seq);
            msg.addProperty("ts", System.currentTimeMillis());
            JsonArray n = new JsonArray();
            news.values().forEach(o -> n.add(o.toJson()));
            msg.add("new", n);
            JsonArray c = new JsonArray();
            for (Map.Entry<String, JsonObject> e : changes.entrySet()) {
                StateMirror.Obj o = mirror.get(e.getKey());
                if (o == null) {
                    continue;
                }
                JsonObject co = new JsonObject();
                co.addProperty("type", o.type());
                co.addProperty("id", o.id());
                if (o.state() != null) {
                    co.addProperty("state", o.state());
                }
                co.add("props", e.getValue());
                c.add(co);
            }
            msg.add("changed", c);
            JsonArray r = new JsonArray();
            removed.forEach(r::add);
            msg.add("removed", r);
            msg.add("log", newLog);
            msg.add("events", eventNames(events));
            if (final0) {
                msg.addProperty("final", true);
            }
            String text = msg.toString();
            long encodeNanos = System.nanoTime() - t0;
            for (ClientSink client : clients) {
                client.send(text);
            }

            byte[] bytes = StreamMetrics.utf8(text);
            String full = snapshotJson();
            metrics.recordDelta(bytes.length, StreamMetrics.deflatedSize(bytes), encodeNanos, StreamMetrics.utf8(full).length);
            int turn = gameView.getTurn();
            if (turn != lastSampledTurn || final0) {
                lastSampledTurn = turn;
                byte[] fb = StreamMetrics.utf8(full);
                int objectsOnly = StreamMetrics.utf8(mirror.toJsonObjects().toString()).length;
                metrics.recordSnapshotSample(turn, String.valueOf(gameView.getPhase()), mirror.size(), fb.length, StreamMetrics.deflatedSize(fb), objectsOnly);
            }
            if (final0) {
                writeMetrics();
                gameOver.countDown();
            }
        }
    }

    private void acceptNew(ObjRef ref, JsonObject props, Map<String, StateMirror.Obj> news) {
        if (policy == HiddenPolicy.REDACT) {
            if ("card".equals(ref.type()) && isHiddenZone(props.get(TrackableProperty.Zone.name()))) {
                news.put(ref.key(), new StateMirror.Obj(ref.type(), ref.id(), null, whitelist(props), true));
                return;
            }
            if ("cardState".equals(ref.type()) && parentHidden(ref.id(), news)) {
                return;
            }
        }
        news.put(ref.key(), new StateMirror.Obj(ref.type(), ref.id(), ref.state(), props, false));
    }

    private void acceptChange(ObjRef ref, JsonObject props, Map<String, StateMirror.Obj> news, Map<String, JsonObject> changes) {
        if (news.containsKey(ref.key())) {
            return; // already sent whole in this delta
        }
        if (policy == HiddenPolicy.REDACT) {
            if ("cardState".equals(ref.type())) {
                if (parentHidden(ref.id(), news) || news.containsKey("card:" + ref.id())) {
                    return; // hidden, or the parent was just re-sent whole with its states
                }
            } else if ("card".equals(ref.type())) {
                StateMirror.Obj known = mirror.get(ref.key());
                JsonElement zone = props.has(TrackableProperty.Zone.name()) ? props.get(TrackableProperty.Zone.name())
                        : known == null ? null : known.props().get(TrackableProperty.Zone.name());
                boolean hidden = isHiddenZone(zone);
                if (hidden && known != null && !known.redacted()) {
                    // public -> hidden on the same instance: replace with the redacted form
                    JsonObject redacted = whitelist(known.props());
                    for (Map.Entry<String, JsonElement> e : whitelist(props).entrySet()) {
                        redacted.add(e.getKey(), e.getValue());
                    }
                    news.put(ref.key(), new StateMirror.Obj("card", ref.id(), null, redacted, true));
                    return;
                }
                if (hidden) {
                    JsonObject w = whitelist(props);
                    if (!w.isEmpty()) {
                        changes.put(ref.key(), w);
                    }
                    return;
                }
                if (known == null || known.redacted()) {
                    // hidden -> public on the same instance: the client has nothing, send it whole
                    CardView live = findLiveCard(ref.id());
                    if (live != null) {
                        resendWhole(live, news);
                        return;
                    }
                }
            }
        }
        changes.put(ref.key(), props);
    }

    private void resendWhole(CardView live, Map<String, StateMirror.Obj> news) {
        Map<TrackableProperty, Object> props = live.getProps();
        news.put("card:" + live.getId(), new StateMirror.Obj("card", live.getId(), null, WireEncoder.encodeProps(props), false));
        for (CardStateView csv : new CardStateView[] {live.getCurrentState(), live.getAlternateState(),
                live.getLeftSplitState(), live.getRightSplitState()}) {
            if (csv != null) {
                Map<TrackableProperty, Object> sp = csv.getProps();
                StateMirror.Obj o = new StateMirror.Obj("cardState", live.getId(), csv.getState().name(), WireEncoder.encodeProps(sp), false);
                news.put(o.key(), o);
            }
        }
    }

    private CardView findLiveCard(int id) {
        for (PlayerView p : gameView.getPlayers()) {
            for (ZoneType z : ZoneType.values()) {
                if (z.getTrackableProperty() == null) {
                    continue;
                }
                for (CardView c : p.getCards(z)) {
                    if (c.getId() == id) {
                        return c;
                    }
                }
            }
        }
        for (StackItemView si : gameView.getStack()) {
            if (si.getSourceCard() != null && si.getSourceCard().getId() == id) {
                return si.getSourceCard();
            }
        }
        return null;
    }

    private boolean parentHidden(int cardId, Map<String, StateMirror.Obj> news) {
        StateMirror.Obj parent = news.get("card:" + cardId);
        if (parent == null) {
            parent = mirror.get("card:" + cardId);
        }
        return parent != null && parent.redacted();
    }

    private static boolean isHiddenZone(JsonElement zone) {
        if (zone == null || zone.isJsonNull()) {
            return false;
        }
        String z = zone.getAsString();
        return ZoneType.Library.name().equals(z) || ZoneType.Hand.name().equals(z);
    }

    private static JsonObject whitelist(JsonObject props) {
        JsonObject w = new JsonObject();
        for (Map.Entry<String, JsonElement> e : props.entrySet()) {
            if (HIDDEN_CARD_WHITELIST.contains(e.getKey())) {
                w.add(e.getKey(), e.getValue());
            }
        }
        return w;
    }

    private JsonArray drainLog() {
        JsonArray out = new JsonArray();
        GameLog log = gameView.getGameLog();
        if (log == null) {
            return out;
        }
        List<GameLogEntry> all = log.getAllEntries();
        if (all.size() < logIndex) {
            logIndex = 0; // undo truncated the log; resend from the start
        }
        for (GameLogEntry e : all.subList(logIndex, all.size())) {
            JsonObject o = new JsonObject();
            o.addProperty("type", e.type().name());
            o.addProperty("msg", e.message());
            out.add(o);
            logTail.addLast(o);
            if (logTail.size() > LOG_TAIL) {
                logTail.removeFirst();
            }
        }
        logIndex = all.size();
        return out;
    }

    private static JsonArray eventNames(List<GameEvent> events) {
        JsonArray a = new JsonArray();
        String prev = null;
        for (GameEvent ev : events) {
            String n = ev.getClass().getSimpleName().replaceFirst("^GameEvent", "");
            if (!n.equals(prev)) {
                a.add(n);
            }
            prev = n;
        }
        return a;
    }

    private void writeMetrics() {
        if (metricsDir == null || metrics == null) {
            return;
        }
        try {
            Files.createDirectories(metricsDir);
            Path f = metricsDir.resolve(metrics.toJson().get("label").getAsString() + ".json");
            Files.write(f, metrics.toJson().toString().getBytes(StandardCharsets.UTF_8));
            System.out.println("[web] metrics written to " + f.toAbsolutePath());
        } catch (IOException e) {
            System.err.println("[web] could not write metrics: " + e);
        }
    }

    /** Copy of the per-game metrics; for logging. */
    public List<String> describe() {
        List<String> l = new ArrayList<>();
        synchronized (lock) {
            if (metrics != null) {
                l.add(metrics.toJson().toString());
            }
        }
        return l;
    }
}
