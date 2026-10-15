package forge.web.seat;

import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;

import com.google.gson.JsonObject;

import forge.game.GameView;
import forge.game.event.GameEvent;
import forge.game.event.GameEventGameFinished;
import forge.web.bridge.ClientSink;
import forge.web.bridge.GameStream;

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

    public WebSeats(GameStream stream, Timeouts timeouts) {
        this.stream = stream;
        this.timeouts = timeouts;
        stream.setSeatHooks(this);
    }

    /** The GUI for the human player at {@code seat} (index in the game's player list). */
    public WebGuiGame newSeat(int seat) {
        SeatSession s = new SeatSession(seat, this);
        sessions.put(seat, s);
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
