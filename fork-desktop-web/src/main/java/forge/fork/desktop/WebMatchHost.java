package forge.fork.desktop;

import java.net.BindException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Consumer;
import java.util.function.Supplier;

import forge.game.event.GameEvent;
import forge.fork.web.bridge.GameStream;
import forge.fork.web.images.ForgeImages;
import forge.fork.web.seat.WebGuiGame;
import forge.fork.web.seat.WebSeats;
import forge.fork.web.server.AccessPolicy;
import forge.fork.web.server.ImageSource;
import forge.fork.web.server.StreamHub;
import forge.fork.web.server.WebServer;

/**
 * The in-process bridge of the desktop launcher: one loopback server for the app's lifetime, serving the
 * built frontend and the seat's WebSocket. One web match at a time (a new match ends a running one); the human
 * is a seat of that match.
 * Tokens are per launch (spectator first, then one per seat), so the seat's page URL stays the same from
 * one match to the next and an open page receives the next match's snapshot.
 */
public final class WebMatchHost {

    /** Seats with a token: Forge lobbies hold at most 8 players. */
    static final int SEATS = 8;

    /**
     * The launcher's default port: a fixed one keeps the page's browser origin, and so its saved settings
     * ({@code localStorage}), the same from one launch to the next (issue #153).
     */
    public static final int DEFAULT_PORT = 47321;

    /**
     * @param port               0 picks a free port
     * @param webRoot            the built frontend ({@code fork-web/frontend/dist})
     * @param images             card images for {@code /img}, created when the server starts (after the card database)
     * @param fallbackToFreePort when {@code port} is taken, start on a free port instead of failing (a second
     *                           Forge instance); an explicitly requested port is not a fallback case
     */
    public record Options(int port, Path webRoot, WebSeats.Timeouts timeouts, Supplier<ImageSource> images,
                          boolean fallbackToFreePort) {
        public Options(int port, Path webRoot, WebSeats.Timeouts timeouts, Supplier<ImageSource> images) {
            this(port, webRoot, timeouts, images, false);
        }

        /** Images from Forge's card image cache, downloading a missing one as the desktop does. */
        public Options(int port, Path webRoot, WebSeats.Timeouts timeouts) {
            this(port, webRoot, timeouts, ForgeImages::create);
        }

        /** The launcher's options: {@code --port} when given, else {@link #DEFAULT_PORT} with a free-port fallback. */
        public static Options launcher(String portArg, Path webRoot, WebSeats.Timeouts timeouts) {
            return portArg == null
                    ? new Options(DEFAULT_PORT, webRoot, timeouts, ForgeImages::create, true)
                    : new Options(Integer.parseInt(portArg), webRoot, timeouts);
        }
    }

    private final Options options;
    private final GameStream stream = new GameStream(GameStream.HiddenPolicy.REDACT, null);
    private final WebSeats seats;
    private final Map<String, Integer> tokens = new LinkedHashMap<>();
    private final List<String> seatTokens = new ArrayList<>();
    private final Consumer<String> openPage;
    private WebServer server;
    /** The last web match started, until it hands back to the lobby. */
    private WebHostedMatch running;
    /** Called when a web match hands back to the lobby (the app's music, {@link WebMatchAudio}). */
    private volatile Runnable onWebMatchOver;

    /** @param openPage opens a seat's page URL (the system browser); called when a match starts and no page is connected */
    public WebMatchHost(Options options, Consumer<String> openPage) {
        this.options = options;
        this.openPage = openPage;
        stream.setLabel("lobby");
        seats = new WebSeats(stream, options.timeouts());
        tokens.put(AccessPolicy.newToken(), GameStream.SPECTATOR);
        for (int s = 0; s < SEATS; s++) {
            String t = AccessPolicy.newToken();
            tokens.put(t, s);
            seatTokens.add(t);
        }
    }

    /** Starts the server if needed. */
    public synchronized void start() {
        if (server != null) {
            return;
        }
        if (!Files.isRegularFile(options.webRoot().resolve("index.html"))) {
            System.err.println("[web] no built frontend in " + options.webRoot().toAbsolutePath()
                    + " (run: make play, or pnpm build in fork-web/frontend)");
        }
        try {
            server = bind(options.port());
        } catch (RuntimeException e) {
            if (!options.fallbackToFreePort() || options.port() == 0 || !isPortTaken(e)) {
                throw e;
            }
            System.out.println("[web] port " + options.port() + " is taken (another Forge?): using a free port;"
                    + " the page's saved settings are per port, so they start from the defaults on this one");
            server = bind(0);
        }
    }

    /** A started server on {@code port}; its event loops are stopped again when the bind fails. */
    private WebServer bind(int port) {
        WebServer s = new WebServer(port, options.webRoot(), StreamHub.of(stream), tokens, options.images().get());
        try {
            s.start();
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            s.stop();
            throw new IllegalStateException("web server start interrupted", e);
        } catch (Exception e) { // netty rethrows the bind's checked BindException unchecked-style
            s.stop();
            throw e instanceof RuntimeException re ? re : new IllegalStateException(e);
        }
        return s;
    }

    private static boolean isPortTaken(Throwable e) {
        for (Throwable t = e; t != null; t = t.getCause()) {
            if (t instanceof BindException) {
                return true;
            }
        }
        return false;
    }

    /**
     * The GUI of the human at {@code seat} (index in the game's player list) for a new match. Opens the seat's
     * page unless one is already connected.
     */
    public synchronized WebGuiGame newSeat(int seat) {
        start();
        WebGuiGame gui = seats.newSeat(seat);
        String url = seatUrl(seat);
        System.out.println("[web] seat " + seat + " (human): " + url);
        if (stream.seatClientCount(seat) == 0) {
            openPage.accept(url);
        } else {
            System.out.println("[web] seat " + seat + " page already open: it gets the new match");
        }
        return gui;
    }

    /** Any match is starting (EDT): a web match still running from an earlier Start ends first. */
    synchronized void matchStarting(WebHostedMatch next) {
        WebHostedMatch previous = running;
        if (previous != null && previous != next) {
            running = null;
            previous.supersede();
        }
    }

    synchronized void webMatchStarted(WebHostedMatch match) {
        running = match;
    }

    /** A web match handed back to the lobby. */
    void matchOver(WebHostedMatch match) {
        synchronized (this) {
            if (running != match) {
                return;
            }
            running = null;
        }
        Runnable r = onWebMatchOver;
        if (r != null) {
            r.run();
        }
    }

    /** A web match is running: started, not yet handed back to the lobby. */
    synchronized boolean webMatchRunning() {
        return running != null;
    }

    void setOnWebMatchOver(Runnable r) {
        onWebMatchOver = r;
    }

    /** Hears the web seat's game events (the app's sounds, {@link WebMatchAudio}). */
    void setEventSink(Consumer<List<GameEvent>> sink) {
        seats.setEventSink(sink);
    }

    /**
     * The match screen of one seat (after {@link #start}): the frontend's live source ({@code ?live=1&seat=N},
     * {@code src/adapter/source.ts}) on this server's {@code /ws}, the token in the fragment, which the browser
     * never sends to a server.
     */
    public synchronized String seatUrl(int seat) {
        return "http://127.0.0.1:" + server.port() + "/?live=1&seat=" + seat + "#token=" + seatTokens.get(seat);
    }

    public synchronized int port() {
        return server.port();
    }

    public GameStream stream() {
        return stream;
    }

    public synchronized void stop() {
        if (server != null) {
            server.stop();
            server = null;
        }
    }
}
