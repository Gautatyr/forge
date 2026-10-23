package forge.fork.web.seat;

import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.function.Consumer;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;

import forge.game.GameView;
import forge.game.event.GameEvent;
import forge.game.event.GameEventGameFinished;
import forge.fork.web.bridge.ClientSink;
import forge.fork.web.bridge.GameStream;

/**
 * The human seats of one server: binds each game to the {@link GameStream}, publishes state for the
 * seats (the first seat bound to a game publishes; others only flush before their prompts), and
 * routes each seat's client messages, greetings and connection changes to its {@link SeatSession}.
 */
public final class WebSeats implements GameStream.SeatHooks {

    /** Timeouts of one seat's prompts: answer time, and how long a prompt waits for a client to come back. */
    public record Timeouts(long promptMs, long disconnectGraceMs) {
        public static final Timeouts DEFAULT = new Timeouts(15 * 60_000L, 60_000L);
    }

    private final GameStream stream;
    private final Timeouts timeouts;
    private final Map<Integer, SeatSession> sessions = new ConcurrentHashMap<>();
    private final ScheduledExecutorService timer = Executors.newSingleThreadScheduledExecutor(r -> {
        Thread t = new Thread(r, "web-seat-timer");
        t.setDaemon(true);
        return t;
    });
    private volatile SeatSession publisher;
    /** Seats with "Pass priority after casting" on (U1b; off by default). Kept across the seat's games. */
    private final Set<Integer> passAfterCast = ConcurrentHashMap.newKeySet();
    /** Seats with "Auto-pass when I can't act" on (APINA) and with "Auto-yield" on (issue #125; off by default, D4). Kept across the seat's games. */
    private final Set<Integer> autoPass = ConcurrentHashMap.newKeySet();
    private final Set<Integer> autoYield = ConcurrentHashMap.newKeySet();
    /** Hears the game's events (the launcher plays Forge's sounds from them); none by default. */
    private volatile Consumer<List<GameEvent>> eventSink;

    public WebSeats(GameStream stream, Timeouts timeouts) {
        this.stream = stream;
        this.timeouts = timeouts;
        stream.setSeatHooks(this);
    }

    /**
     * Receives every batch of game events of the publishing seat, after it is published: on the game
     * thread, or on the EDT while the game thread waits for a seat's input ({@code InputPump}). Once per
     * game, however many human seats. A sink that throws is logged and ignored.
     */
    public void setEventSink(Consumer<List<GameEvent>> sink) {
        eventSink = sink;
    }

    /** The GUI for the human player at {@code seat} (index in the game's player list). */
    public WebGuiGame newSeat(int seat) {
        SeatSession s = new SeatSession(seat, this);
        SeatSession previous = sessions.put(seat, s);
        if (previous != null) {
            previous.close(); // the seat's previous game (--games N), or a match still running (launcher)
        }
        return new WebGuiGame(s);
    }

    GameStream stream() {
        return stream;
    }

    Timeouts timeouts() {
        return timeouts;
    }

    ScheduledExecutorService timer() {
        return timer;
    }

    /** From a seat's openView, before the game thread starts: the first seat to see a new game binds it. */
    synchronized void bindGame(SeatSession s, GameView gv) {
        if (stream.gameView() != gv) {
            stream.startGame(gv);
            publisher = s;
        }
    }

    /** A batch of game events reached seat {@code s}'s GUI (game thread, or a thread the game thread waits for). */
    void publish(SeatSession s, List<GameEvent> events) {
        if (s != publisher) {
            return;
        }
        boolean finished = events.stream().anyMatch(e -> e instanceof GameEventGameFinished);
        stream.publish(events, finished);
        Consumer<List<GameEvent>> sink = eventSink;
        if (sink != null && !events.isEmpty()) {
            try {
                sink.accept(events);
            } catch (RuntimeException e) {
                System.err.println("[web] game event sink failed: " + e);
            }
        }
    }

    /** Sends what changed since the last flush, to every viewer. Call only while the game thread is not mutating. */
    void flush() {
        stream.publish(List.of(), false);
    }

    @Override
    public List<String> greeting(int seat) {
        SeatSession s = sessions.get(seat);
        return s == null ? List.of() : s.greeting();
    }

    /** Any thread: the seat's "Pass priority after casting" setting. */
    boolean passAfterCast(int seat) {
        return passAfterCast.contains(seat);
    }

    /** Any thread: the seat's "Auto-pass when I can't act" setting. */
    boolean autoPass(int seat) {
        return autoPass.contains(seat);
    }

    /** Any thread: the seat's "Auto-yield" setting (honour the per-ability auto-yields it set). */
    boolean autoYield(int seat) {
        return autoYield.contains(seat);
    }

    private static void set(Set<Integer> seats, int seat, JsonObject msg) {
        JsonElement on = msg.get("on");
        if (on != null && on.isJsonPrimitive() && on.getAsJsonPrimitive().isBoolean() && on.getAsBoolean()) {
            seats.add(seat);
        } else {
            seats.remove(seat);
        }
    }

    @Override
    public void receive(int seat, JsonObject msg, ClientSink from) {
        String type = msg.has("t") && msg.get("t").isJsonPrimitive() ? msg.get("t").getAsString() : "";
        if ("setPassAfterCast".equals(type)) {
            set(passAfterCast, seat, msg);
            return;
        }
        if ("setAutoPass".equals(type) || "setAutoYield".equals(type)) {
            set("setAutoPass".equals(type) ? autoPass : autoYield, seat, msg);
            SeatSession s = sessions.get(seat);
            if (s != null) {
                s.yieldSettingsChanged();
            }
            return;
        }
        SeatSession s = sessions.get(seat);
        if (s == null) {
            from.send(SeatSession.rejected("rejected", msg, "seat " + seat + " is not a human seat"));
            return;
        }
        s.receive(msg, from);
    }

    @Override
    public void clientsChanged(int seat, int clients) {
        SeatSession s = sessions.get(seat);
        if (s != null) {
            s.clientsChanged(clients);
        }
    }
}
