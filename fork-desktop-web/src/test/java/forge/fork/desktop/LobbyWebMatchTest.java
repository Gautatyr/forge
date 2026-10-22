package forge.fork.desktop;

import static org.testng.Assert.assertEquals;
import static org.testng.Assert.assertFalse;
import static org.testng.Assert.assertSame;
import static org.testng.Assert.assertTrue;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.net.http.WebSocket;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionStage;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.TimeUnit;
import java.util.function.BooleanSupplier;
import java.util.function.Predicate;

import org.testng.annotations.Test;

import forge.deck.Deck;
import forge.deck.DeckgenUtil;
import forge.game.Game;
import forge.game.GameType;
import forge.game.player.Player;
import forge.gamemodes.match.HostedMatch;
import forge.gamemodes.match.LocalLobby;
import forge.localinstance.properties.ForgePreferences.FPref;
import forge.model.FModel;
import forge.player.PlayerControllerHuman;
import forge.fork.web.seat.WebGuiGame;
import forge.fork.web.seat.WebSeats;
import forge.fork.web.server.ImageSource;

/**
 * The lobby path end to end, headless: Forge's {@link LocalLobby} sets up a Commander match and presses
 * Start; the match runs with the human in a web seat (served page opened once in the live mode with the seat's
 * token, card images, the seat's actionable highlights on); a WebSocket client on the seat concedes, and the
 * match hands back to the lobby.
 */
public class LobbyWebMatchTest {

    private static final String PAGE = "<!doctype html><title>match screen</title>";

    @Test(timeOut = 300_000)
    public void startFromTheLobbyPlaysTheHumanInTheWebSeatThenHandsBack() throws Exception {
        HeadlessEngine.boot();
        Path dist = Files.createTempDirectory("forge-dist");
        Files.writeString(dist.resolve("index.html"), PAGE);
        List<String> opened = new CopyOnWriteArrayList<>();
        byte[] png = {(byte) 0x89, 'P', 'N', 'G'};
        ImageSource images = key -> CompletableFuture.completedFuture("c:Forest|M21|1".equals(key) ? new ImageSource.Image(png, "image/png") : null);
        WebMatchHost host = new WebMatchHost(new WebMatchHost.Options(0, dist, new WebSeats.Timeouts(60_000, 60_000), () -> images), opened::add);
        HeadlessEngine.matches = () -> new WebHostedMatch(host, () -> true);
        try {
            Deck d0 = DeckgenUtil.generateCommanderDeck(true, GameType.Commander);
            Deck d1 = DeckgenUtil.generateCommanderDeck(true, GameType.Commander);
            LocalLobby lobby = LobbyRun.commanderLobby(List.of(d0, d1));
            LobbyRun.pressStart(lobby);

            HostedMatch match = lobby.getHostedMatch();
            assertTrue(match instanceof WebHostedMatch, String.valueOf(match));
            assertEquals(opened.size(), 1, "the browser opens the seat page once: " + opened);
            String url = opened.get(0);
            // the frontend's live source for seat 0 (src/adapter/source.ts); the token stays in the fragment
            String prefix = "http://127.0.0.1:" + host.port() + "/?live=1&seat=0#token=";
            assertTrue(url.startsWith(prefix), url);
            String token = url.substring(prefix.length());

            HttpClient http = HttpClient.newHttpClient();
            HttpResponse<String> page = http.send(HttpRequest.newBuilder(URI.create(url.substring(0, url.indexOf('#')))).build(),
                    HttpResponse.BodyHandlers.ofString());
            assertEquals(page.body(), PAGE);
            HttpResponse<byte[]> img = http.send(HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + host.port()
                    + "/img?key=c%3AForest%7CM21%7C1&token=" + token)).build(), HttpResponse.BodyHandlers.ofByteArray());
            assertEquals(img.statusCode(), 200, "the seat page's card images come from the bridge");
            assertEquals(img.body(), png);

            PlayerControllerHuman human = match.getHumanControllers().get(0);
            // the web client needs them (playable cards, mana sources, auto-pay plan, attack candidates),
            // for the web seat only: the desktop preferences stay as they are
            assertTrue(human.getYieldController().getBoolPref(FPref.UI_SHOW_ACTIONABLE_HIGHLIGHTS));
            assertTrue(human.getYieldController().getBoolPref(FPref.UI_SHOW_AUTOTAP_PREVIEW));
            assertFalse(FModel.getPreferences().getPrefBoolean(FPref.UI_SHOW_ACTIONABLE_HIGHLIGHTS));
            assertFalse(FModel.getPreferences().getPrefBoolean(FPref.UI_SHOW_AUTOTAP_PREVIEW));
            assertTrue(human.getGui() instanceof WebGuiGame, String.valueOf(human.getGui()));
            assertEquals(((WebGuiGame) human.getGui()).seat(), 0);
            List<Player> players = match.getGame().getPlayers();
            assertEquals(players.get(0).getController(), human, "the human is seat 0 of the game");
            assertEquals(players.get(0).getStartingLife(), 40);
            assertEquals(players.get(1).getStartingLife(), 40);
            // issue #68: no "AI can't play these cards well" reveal of the AI decks at match start
            assertFalse(match.getGame().getRules().warnAboutAICards());

            Client seat = Client.connect(host.port(), token);
            seat.await(m -> m.startsWith("{\"t\":\"snapshot\""), 60);
            seat.await(m -> m.startsWith("{\"t\":\"call\"") && m.contains("\"openView\""), 60);
            seat.socket.sendText("{\"t\":\"action\",\"method\":\"concede\"}", true).get(10, TimeUnit.SECONDS);
            seat.await(m -> m.contains("\"final\":true"), 120);

            long deadline = System.currentTimeMillis() + 60_000;
            while (lobby.getHostedMatch() != null && System.currentTimeMillis() < deadline) {
                Thread.sleep(100);
            }
            assertEquals(lobby.getHostedMatch(), null, "the match handed back to the lobby");
            assertTrue(match.isMatchOver());
            seat.socket.abort();
        } finally {
            HeadlessEngine.matches = HostedMatch::new;
            host.stop();
        }
    }

    @Test(timeOut = 300_000)
    public void startDuringAWebMatchEndsItAndTheLobbyKeepsTheNewMatch() throws Exception {
        HeadlessEngine.boot();
        Path dist = Files.createTempDirectory("forge-dist");
        Files.writeString(dist.resolve("index.html"), PAGE);
        List<String> opened = new CopyOnWriteArrayList<>();
        WebMatchHost host = new WebMatchHost(new WebMatchHost.Options(0, dist, new WebSeats.Timeouts(120_000, 120_000)), opened::add);
        HeadlessEngine.matches = () -> new WebHostedMatch(host, () -> true);
        try {
            LocalLobby lobby = LobbyRun.commanderLobby(List.of(DeckgenUtil.generateCommanderDeck(true, GameType.Commander),
                    DeckgenUtil.generateCommanderDeck(true, GameType.Commander)));
            host.start();
            Client seat = Client.connect(host.port(), host.seatUrl(0).substring(host.seatUrl(0).indexOf("#token=") + 7));
            LobbyRun.pressStart(lobby);
            HostedMatch first = lobby.getHostedMatch();
            Game firstGame = first.getGame();
            seat.await(m -> m.startsWith("{\"t\":\"call\"") && m.contains("\"openView\""), 60);
            Thread.sleep(3000); // the first game waits on the connected seat (mulligan)

            LobbyRun.pressStart(lobby);
            HostedMatch second = lobby.getHostedMatch();
            assertTrue(second instanceof WebHostedMatch && second != first, String.valueOf(second));
            waitFor(firstGame::isGameOver, 30, "the first game ends");
            waitFor(first::isMatchOver, 30, "the first match quits");
            Thread.sleep(500);
            assertSame(lobby.getHostedMatch(), second, "the first match's end does not hand the lobby back");
            assertFalse(second.getGame().isGameOver(), "the new match runs on");
            assertEquals(opened.size(), 0, "the seat's page is open: no browser");

            seat.socket.sendText("{\"t\":\"action\",\"method\":\"concede\"}", true).get(10, TimeUnit.SECONDS);
            waitFor(() -> lobby.getHostedMatch() == null, 60, "the new match hands back to the lobby");
            seat.socket.abort();
        } finally {
            HeadlessEngine.matches = HostedMatch::new;
            host.stop();
        }
    }

    private static void waitFor(BooleanSupplier c, int seconds, String what) throws InterruptedException {
        long deadline = System.currentTimeMillis() + seconds * 1000L;
        while (!c.getAsBoolean()) {
            if (System.currentTimeMillis() > deadline) {
                throw new AssertionError(what + ": not within " + seconds + " s");
            }
            Thread.sleep(100);
        }
    }

    /** A seat client without Origin (a non-browser client needs the token only). */
    private static final class Client implements WebSocket.Listener {
        final List<String> messages = new CopyOnWriteArrayList<>();
        private final StringBuilder partial = new StringBuilder();
        WebSocket socket;

        static Client connect(int port, String token) throws Exception {
            Client c = new Client();
            c.socket = HttpClient.newHttpClient().newWebSocketBuilder()
                    .buildAsync(URI.create("ws://127.0.0.1:" + port + "/ws?token=" + token), c).get(10, TimeUnit.SECONDS);
            return c;
        }

        @Override
        public CompletionStage<?> onText(WebSocket ws, CharSequence data, boolean last) {
            partial.append(data);
            if (last) {
                messages.add(partial.toString());
                partial.setLength(0);
            }
            ws.request(1);
            return null;
        }

        void await(Predicate<String> p, int seconds) throws InterruptedException {
            long deadline = System.currentTimeMillis() + seconds * 1000L;
            while (System.currentTimeMillis() < deadline) {
                if (messages.stream().anyMatch(p)) {
                    return;
                }
                Thread.sleep(50);
            }
            throw new AssertionError("no such message in " + seconds + " s; got " + messages.size() + " messages, last: "
                    + (messages.isEmpty() ? "none" : messages.get(messages.size() - 1).substring(0, Math.min(300, messages.get(messages.size() - 1).length()))));
        }
    }
}
