package forge.fork.web.bridge;

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
import java.util.function.Function;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;

import forge.game.GameLog;
import forge.game.GameLogEntry;
import forge.game.GameView;
import forge.game.card.CardView;
import forge.game.event.GameEvent;
import forge.game.event.GameEventShuffle;
import forge.game.event.GameEventSnapshotRestored;
import forge.game.event.GameEventTurnBegan;
import forge.game.player.PlayerView;
import forge.game.zone.ZoneType;
import forge.gamemodes.net.DeltaPacket;
import forge.gamemodes.net.server.DeltaSyncManager;
import forge.trackable.TrackableProperty;
import forge.fork.web.bridge.visibility.Flush;
import forge.fork.web.bridge.visibility.LiveCards;
import forge.fork.web.bridge.visibility.Viewer;
import forge.fork.web.bridge.visibility.ViewerStream;
import forge.fork.web.bridge.visibility.Visibility;
import forge.fork.web.bridge.visibility.ZoneOrder;
import forge.fork.web.schema.WireEnvelope;

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

    /**
     * What a human seat adds to its clients' stream (forge.fork.web.seat). Called under the stream's lock:
     * implementations must not block nor take a lock held while calling this stream.
     */
    public interface SeatHooks {
        /** Messages a new client of the seat gets right after its snapshot (open prompts, current input). */
        List<String> greeting(int seat);

        /** A reply or action from a client of the seat (transport thread). */
        void receive(int seat, JsonObject msg, ClientSink from);

        /** The seat's connected-client count changed. */
        void clientsChanged(int seat, int clients);
    }
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
    /** The round beside the turn number (top bar); fed by the published turn events. */
    private final RoundCounter rounds = new RoundCounter();
    private ViewerStream spectator;
    private List<ViewerStream> seats = List.of();
    /** Each seat's card-text language ({@code en} unless set), kept across games. */
    private final Map<Integer, String> seatLanguage = new HashMap<>();
    /** Last known card order of every zone, {@code playerId:Zone -> ids}, to detect shuffles. */
    private Map<String, List<Integer>> zoneOrders = new HashMap<>();
    private volatile CountDownLatch gameOver = new CountDownLatch(1);
    private volatile SeatHooks seatHooks;

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

    public void setSeatHooks(SeatHooks hooks) {
        this.seatHooks = hooks;
    }

    private Viewer viewer(int seat, List<PlayerView> players) {
        if (policy == HiddenPolicy.FULL) {
            return Viewer.omniscient(seat, players);
        }
        return seat == SPECTATOR ? Viewer.spectator(players) : Viewer.seat(seat, players);
    }

    /** Binds a new game. Called from the spectator GUI's openView, before the game thread starts. */
    public void startGame(GameView gv) {
        forge.fork.web.bridge.visibility.CardText.warm(); // off the event loop, outside the lock
        synchronized (lock) {
            gameView = gv;
            dsm = new DeltaSyncManager();
            List<PlayerView> players = gv.getPlayers() == null ? List.of() : new ArrayList<>(gv.getPlayers());
            spectator = new ViewerStream(viewer(SPECTATOR, players));
            List<ViewerStream> s = new ArrayList<>();
            for (int i = 0; i < players.size(); i++) {
                ViewerStream vs = new ViewerStream(viewer(i, players));
                vs.setLanguage(seatLanguage.getOrDefault(i, "en"));
                s.add(vs);
            }
            seats = s;
            zoneOrders = new HashMap<>();
            logTail.clear();
            logIndex = 0;
            lastSampledTurn = -1;
            rounds.reset();
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

    /** The game view bound by the last {@link #startGame}, or null. */
    public GameView gameView() {
        synchronized (lock) {
            return gameView;
        }
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
            SeatHooks hooks = seatHooks;
            boolean seated = seat >= 0 && seat < seats.size();
            if (hooks != null && seated) {
                for (String m : hooks.greeting(seat)) {
                    c.send(m);
                }
            }
            clients.put(c, seat);
            if (hooks != null && seated) {
                hooks.clientsChanged(seat, seatClientCount(seat));
            }
        }
    }

    /** Under {@link #lock}, as {@link #addClient}: a seat's hooks hear its client counts in order. */
    public void removeClient(ClientSink c) {
        synchronized (lock) {
            Integer seat = clients.remove(c);
            SeatHooks hooks = seatHooks;
            if (seat != null && seat >= 0 && hooks != null) {
                hooks.clientsChanged(seat, seatClientCount(seat));
            }
        }
    }

    public int clientCount() {
        return clients.size();
    }

    /** Connected clients of one seat. */
    public int seatClientCount(int seat) {
        int n = 0;
        for (int s : clients.values()) {
            if (s == seat) {
                n++;
            }
        }
        return n;
    }

    /**
     * Sets the language of the card names, type lines and oracle text one seat is sent ({@code fr}; anything
     * else is English), and re-sends the seat's clients what they hold in the new language. Spectators are
     * always English. Thread-safe; reads only the seat's copy, never the live game.
     */
    public void setSeatLanguage(int seat, String lang) {
        if (seat < 0) {
            return;
        }
        synchronized (lock) {
            String l = "fr".equals(lang) ? "fr" : "en";
            seatLanguage.put(seat, l);
            if (seat >= seats.size()) {
                return;
            }
            ViewerStream vs = seats.get(seat);
            ViewerStream.Delta d = vs.setLanguage(l);
            if (d.isEmpty()) {
                return;
            }
            String text = deltaJson(vs, d, new JsonArray(), new JsonArray(), null, false);
            for (Map.Entry<ClientSink, Integer> c : clients.entrySet()) {
                if (c.getValue() == seat) {
                    c.getKey().send(text);
                }
            }
        }
    }

    /** A message from a seat's client; see {@link SeatHooks#receive}. */
    public void clientMessage(int seat, JsonObject msg, ClientSink from) {
        SeatHooks hooks = seatHooks;
        if (hooks != null && seat >= 0) {
            hooks.receive(seat, msg, from);
        }
    }

    /**
     * Builds a message for one seat with that seat's card ids and sends it to the seat's clients, in
     * order with its deltas (one lock, one queue per client). Returns the text sent, or null when the
     * current game has no such seat (the message is dropped).
     */
    public String sendToSeat(int seat, Function<SeatRefs, JsonObject> build) {
        return sendToSeat(seat, build, null);
    }

    /**
     * As {@link #sendToSeat(int, Function)}; {@code sent} receives the text under the lock, so a client
     * added concurrently either got the message or finds it in the seat's greeting.
     */
    public String sendToSeat(int seat, Function<SeatRefs, JsonObject> build, java.util.function.Consumer<String> sent) {
        synchronized (lock) {
            if (seat < 0 || seat >= seats.size()) {
                return null;
            }
            ViewerStream vs = seats.get(seat);
            SeatRefs refs = new SeatRefs() {
                @Override
                public int card(int realId) {
                    return vs.refOf(realId);
                }

                @Override
                public Visibility visibility(CardView card) {
                    return vs.viewer().of(card);
                }
            };
            String text = build.apply(refs).toString();
            if (sent != null) {
                sent.accept(text);
            }
            for (Map.Entry<ClientSink, Integer> c : clients.entrySet()) {
                if (c.getValue() == seat) {
                    c.getKey().send(text);
                }
            }
            return text;
        }
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
        if (rounds.round() > 0) {
            o.addProperty("round", rounds.round());
        }
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
            if (restored(events)) {
                // Undo rewrites the game's fields in place (GameMemento), the views' properties, dirty bits and
                // consumer registrations included: a delta collection sees nothing changed, and an object registered
                // after the restored checkpoint would stay silent for good. Upstream's ProtocolGuiGame resends its
                // full state for the same reason. Re-register everything: every object goes out whole and replaces
                // the viewers' copy (ViewerStream), and what is no longer reachable is pruned.
                dsm.reset();
            }
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
            int roundBefore = rounds.round();
            for (GameEvent ev : events) {
                if (ev instanceof GameEventTurnBegan tb) {
                    rounds.turnBegan(tb.turnOwner().getId(), inGamePlayerIds());
                }
            }
            Integer round = rounds.round() != roundBefore ? rounds.round() : null;

            List<ViewerStream> all = new ArrayList<>(seats.size() + 1);
            all.add(spectator);
            all.addAll(seats);
            long seatBytes = 0;
            for (ViewerStream vs : all) {
                ViewerStream.Delta d = vs.apply(flush);
                if (d.isEmpty() && newLog.isEmpty() && round == null && !final0) {
                    continue;
                }
                String text = deltaJson(vs, d, newLog, eventNames, round, final0);
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

    /** The players still in the game, in turn order (the view's list holds every player of the game). */
    private List<Integer> inGamePlayerIds() {
        List<Integer> ids = new ArrayList<>();
        if (gameView.getPlayers() != null) {
            for (PlayerView p : gameView.getPlayers()) {
                if (!p.getHasLost()) {
                    ids.add(p.getId());
                }
            }
        }
        return ids;
    }

    /** {@code round}: the new round when this flush changed it, else null (absent). */
    private String deltaJson(ViewerStream vs, ViewerStream.Delta d, JsonArray newLog, JsonArray eventNames, Integer round, boolean final0) {
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
        if (round != null) {
            msg.addProperty("round", round);
        }
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

    /** The batch holds the end of an undo or a snapshot restore. */
    private static boolean restored(List<GameEvent> events) {
        for (GameEvent ev : events) {
            if (ev instanceof GameEventSnapshotRestored r && !r.start()) {
                return true;
            }
        }
        return false;
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
