package forge.fork.web.seat;

import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.function.Consumer;

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

    @Override
    public void receive(int seat, JsonObject msg, ClientSink from) {
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
