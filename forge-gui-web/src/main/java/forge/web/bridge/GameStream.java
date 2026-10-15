package forge.web.bridge;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CountDownLatch;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;

import forge.game.GameLog;
import forge.game.GameLogEntry;
import forge.game.GameView;
import forge.game.event.GameEvent;
import forge.game.event.GameEventShuffle;
import forge.game.player.PlayerView;
import forge.game.zone.ZoneType;
import forge.gamemodes.net.DeltaPacket;
import forge.gamemodes.net.server.DeltaSyncManager;
import forge.trackable.TrackableProperty;
import forge.web.bridge.visibility.Flush;
import forge.web.bridge.visibility.LiveCards;
import forge.web.bridge.visibility.Viewer;
import forge.web.bridge.visibility.ViewerStream;
import forge.web.bridge.visibility.ZoneOrder;
import forge.web.schema.WireEnvelope;

/**
 * Turns one game's view graph into one JSON stream per viewer: each seat (player) and the
 * spectator get a snapshot when they connect, then deltas, holding only what that viewer may know
 * (see {@link Viewer} and {@link ViewerStream}). Delta collection reuses network play's
 * {@link DeltaSyncManager} unchanged, once per flush for all viewers; the packet is encoded once,
 * then filtered per viewer.
 *
 * <p>Threads: {@link #publish} runs on the game thread (the trackable graph is single-mutator);
 * {@link #addClient} runs on a transport thread and reads only the viewer's mirror. Both hold
 * {@link #lock}, so a client's snapshot is always followed by exactly the deltas after it.
 */
public final class GameStream {

    /** What viewers may see. */
    public enum HiddenPolicy {
        /** Per viewer, by the engine's view rules (default). */
        REDACT,
        /** Debug only: every viewer sees everything, as network play sends it. Never for a real match. */
        FULL
    }

    /** Seat index of a spectator. */
    public static final int SPECTATOR = -1;
    private static final int LOG_TAIL = 400;

    private final Object lock = new Object();
    /** Connected clients and the seat each asked for ({@link #SPECTATOR} for none). */
    private final Map<ClientSink, Integer> clients = new ConcurrentHashMap<>();
    private final Deque<JsonObject> logTail = new ArrayDeque<>();
    private final HiddenPolicy policy;
    private final Path metricsDir;
    private final JsonObject hello;

    private String label = "game";
    private GameView gameView;
    private DeltaSyncManager dsm;
    private StreamMetrics metrics;
    private int gameNumber;
    private int logIndex;
    private int lastSampledTurn = -1;
    private ViewerStream spectator;
    private List<ViewerStream> seats = List.of();
    /** Last known card order of every zone, {@code playerId:Zone -> ids}, to detect shuffles. */
    private Map<String, List<Integer>> zoneOrders = new HashMap<>();
    private volatile CountDownLatch gameOver = new CountDownLatch(1);

    public GameStream(HiddenPolicy policy, Path metricsDir) {
        this.policy = policy;
        this.metricsDir = metricsDir;
        this.spectator = new ViewerStream(viewer(SPECTATOR, List.of()));
        hello = new JsonObject();
        hello.addProperty("t", "hello");
        hello.addProperty("v", WireEnvelope.VERSION);
        hello.addProperty("hidden", policy.name());
        hello.add("schema", WireSchema.schemaJson());
    }

    public void setLabel(String label) {
        this.label = label;
    }

    private Viewer viewer(int seat, List<PlayerView> players) {
        if (policy == HiddenPolicy.FULL) {
            return Viewer.omniscient(seat, players);
        }
        return seat == SPECTATOR ? Viewer.spectator(players) : Viewer.seat(seat, players);
    }

    /** Binds a new game. Called from the spectator GUI's openView, before the game thread starts. */
    public void startGame(GameView gv) {
        synchronized (lock) {
            gameView = gv;
            dsm = new DeltaSyncManager();
            List<PlayerView> players = gv.getPlayers() == null ? List.of() : new ArrayList<>(gv.getPlayers());
            spectator = new ViewerStream(viewer(SPECTATOR, players));
            List<ViewerStream> s = new ArrayList<>();
            for (int i = 0; i < players.size(); i++) {
                s.add(new ViewerStream(viewer(i, players)));
            }
            seats = s;
            zoneOrders = new HashMap<>();
            logTail.clear();
            logIndex = 0;
            lastSampledTurn = -1;
            gameNumber++;
            metrics = new StreamMetrics(label + "-game" + gameNumber);
            gameOver = new CountDownLatch(1);
            for (Map.Entry<ClientSink, Integer> c : clients.entrySet()) {
                c.getKey().send(snapshotJson(streamFor(c.getValue())));
            }
        }
    }

    public CountDownLatch gameOverLatch() {
        return gameOver;
    }

    /** A spectator client: sees no hidden information. */
    public void addClient(ClientSink c) {
        addClient(c, SPECTATOR);
    }

    /**
     * A client for one seat (index in the game's player list, {@link #SPECTATOR} for none). A seat
     * the current game does not have gets the spectator stream; the seat is re-bound at each game.
     */
    public void addClient(ClientSink c, int seat) {
        synchronized (lock) {
            c.send(hello.toString());
            String snap = snapshotJson(streamFor(seat));
            c.send(snap);
            if (metrics != null) {
                metrics.recordClientSnapshot(StreamMetrics.utf8(snap).length);
            }
            clients.put(c, seat);
        }
    }

    public void removeClient(ClientSink c) {
        clients.remove(c);
    }

    public int clientCount() {
        return clients.size();
    }

    /** The spectator's current snapshot. Thread-safe. */
    public String snapshot() {
        return snapshot(SPECTATOR);
    }

    /** One seat's current snapshot, as served to a new client of that seat. Thread-safe. */
    public String snapshot(int seat) {
        synchronized (lock) {
            return snapshotJson(streamFor(seat));
        }
    }

    /**
     * The engine card id behind an id a seat was sent (aliases included), or -1 if that seat holds
     * no card under that id. For resolving client commands.
     */
    public int realCardId(int seat, int wireId) {
        synchronized (lock) {
            if (seat < 0 || seat >= seats.size()) {
                return -1;
            }
            return seats.get(seat).realCardId(wireId);
        }
    }

    public String metricsJson() {
        synchronized (lock) {
            return metrics == null ? "{}" : metrics.toJson().toString();
        }
    }

    private ViewerStream streamFor(int seat) {
        return seat >= 0 && seat < seats.size() ? seats.get(seat) : spectator;
    }

    private String snapshotJson(ViewerStream vs) {
        long t0 = System.nanoTime();
        JsonObject o = new JsonObject();
        o.addProperty("t", "snapshot");
        o.addProperty("game", gameNumber);
        o.addProperty("seq", vs.seq());
        o.addProperty("label", label);
        o.add("viewer", vs.viewer().toJson());
        o.add("objects", vs.mirror().toJsonObjects());
        JsonArray log = new JsonArray();
        logTail.forEach(log::add);
        o.add("log", log);
        String s = o.toString();
        if (metrics != null) {
            metrics.recordSnapshotSerialize(System.nanoTime() - t0);
        }
        return s;
    }

    /** Game thread. Collects what changed since the last call and sends each viewer its share as one delta. */
    public void publish(List<GameEvent> events, boolean final0) {
        synchronized (lock) {
            if (gameView == null || dsm == null) {
                return;
            }
            long t0 = System.nanoTime();
            DeltaPacket packet = dsm.collectDeltas(gameView);
            List<Flush.Entry> news = new ArrayList<>();
            for (Map.Entry<Integer, Map<TrackableProperty, Object>> e : packet.getNewObjects().entrySet()) {
                news.add(new Flush.Entry(WireEncoder.decodeKey(e.getKey()), WireEncoder.encodeProps(e.getValue())));
            }
            List<Flush.Entry> changes = new ArrayList<>();
            for (Map.Entry<Integer, Map<TrackableProperty, Object>> e : packet.getObjectDeltas().entrySet()) {
                changes.add(new Flush.Entry(WireEncoder.decodeKey(e.getKey()), WireEncoder.encodeProps(e.getValue())));
            }
            LiveCards live = LiveCards.of(gameView);
            Flush flush = new Flush(live, news, changes, reorderedCards(live, events));
            JsonArray newLog = drainLog();
            JsonArray eventNames = eventNames(events);

            List<ViewerStream> all = new ArrayList<>(seats.size() + 1);
            all.add(spectator);
            all.addAll(seats);
            long seatBytes = 0;
            for (ViewerStream vs : all) {
                ViewerStream.Delta d = vs.apply(flush);
                if (d.isEmpty() && newLog.isEmpty() && !final0) {
                    continue;
                }
                String text = deltaJson(vs, d, newLog, eventNames, final0);
                for (Map.Entry<ClientSink, Integer> c : clients.entrySet()) {
                    if (streamFor(c.getValue()) == vs) {
                        c.getKey().send(text);
                    }
                }
                byte[] bytes = StreamMetrics.utf8(text);
                if (vs == spectator) {
                    metrics.recordDelta(bytes.length, StreamMetrics.deflatedSize(bytes));
                } else {
                    seatBytes += bytes.length;
                }
            }
            metrics.recordFlush(System.nanoTime() - t0, seatBytes);

            int turn = gameView.getTurn();
            if (turn != lastSampledTurn || final0) {
                // once per turn, not per flush: the snapshot is serialised for the measurement only
                lastSampledTurn = turn;
                byte[] fb = StreamMetrics.utf8(snapshotJson(spectator));
                int objectsOnly = StreamMetrics.utf8(spectator.mirror().toJsonObjects().toString()).length;
                metrics.recordSnapshotSample(turn, String.valueOf(gameView.getPhase()), spectator.mirror().size(),
                        fb.length, StreamMetrics.deflatedSize(fb), objectsOnly);
            }
            if (final0) {
                writeMetrics();
                gameOver.countDown();
            }
        }
    }

    private String deltaJson(ViewerStream vs, ViewerStream.Delta d, JsonArray newLog, JsonArray eventNames, boolean final0) {
        JsonObject msg = new JsonObject();
        msg.addProperty("t", "delta");
        msg.addProperty("game", gameNumber);
        msg.addProperty("seq", vs.nextSeq());
        msg.addProperty("ts", System.currentTimeMillis());
        JsonArray n = new JsonArray();
        d.news().forEach(o -> n.add(o.toJson()));
        msg.add("new", n);
        JsonArray c = new JsonArray();
        for (Map.Entry<String, JsonObject> e : d.changes().entrySet()) {
            StateMirror.Obj o = vs.mirror().get(e.getKey());
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
        d.removed().forEach(r::add);
        msg.add("removed", r);
        msg.add("log", newLog);
        msg.add("events", eventNames);
        if (final0) {
            msg.addProperty("final", true);
        }
        return msg.toString();
    }

    /** Cards in zones shuffled (event) or reordered (relative order of the cards that stayed) since the last flush. */
    private Set<Integer> reorderedCards(LiveCards live, List<GameEvent> events) {
        Set<Integer> out = new HashSet<>();
        Map<String, List<Integer>> current = live.zones();
        for (Map.Entry<String, List<Integer>> e : current.entrySet()) {
            List<Integer> before = zoneOrders.get(e.getKey());
            if (before != null && ZoneOrder.reordered(before, e.getValue())) {
                out.addAll(e.getValue());
            }
        }
        for (GameEvent ev : events) {
            if (ev instanceof GameEventShuffle s && s.player() != null) {
                List<Integer> lib = current.get(LiveCards.zoneKey(s.player().getId(), ZoneType.Library));
                if (lib != null) {
                    out.addAll(lib);
                }
            }
        }
        zoneOrders = new HashMap<>(current);
        return out;
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
