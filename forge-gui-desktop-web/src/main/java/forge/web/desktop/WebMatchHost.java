package forge.web.desktop;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Consumer;
import java.util.function.Supplier;

import forge.web.bridge.GameStream;
import forge.web.images.ForgeImages;
import forge.web.seat.WebGuiGame;
import forge.web.seat.WebSeats;
import forge.web.server.AccessPolicy;
import forge.web.server.ImageSource;
import forge.web.server.StreamHub;
import forge.web.server.WebServer;

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
     * @param port    0 picks a free port
     * @param webRoot the built frontend ({@code forge-gui-web/frontend/dist})
     * @param images  card images for {@code /img}, created when the server starts (after the card database)
     */
    public record Options(int port, Path webRoot, WebSeats.Timeouts timeouts, Supplier<ImageSource> images) {
        /** Images from Forge's card image cache, downloading a missing one as the desktop does. */
        public Options(int port, Path webRoot, WebSeats.Timeouts timeouts) {
            this(port, webRoot, timeouts, ForgeImages::create);
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
                    + " (run: make play, or pnpm build in forge-gui-web/frontend)");
        }
        WebServer s = new WebServer(options.port(), options.webRoot(), StreamHub.of(stream), tokens, options.images().get());
        try {
            s.start();
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            s.stop();
            throw new IllegalStateException("web server start interrupted", e);
        } catch (RuntimeException e) {
            s.stop();
            throw e;
        }
        server = s;
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
    synchronized void matchOver(WebHostedMatch match) {
        if (running == match) {
            running = null;
        }
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
