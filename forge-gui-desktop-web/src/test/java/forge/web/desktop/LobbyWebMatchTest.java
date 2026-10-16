package forge.web.desktop;

import static org.testng.Assert.assertEquals;
import static org.testng.Assert.assertTrue;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.net.http.WebSocket;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.concurrent.CompletionStage;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.TimeUnit;
import java.util.function.Predicate;

import org.testng.annotations.Test;

import forge.deck.Deck;
import forge.deck.DeckgenUtil;
import forge.game.GameType;
import forge.game.player.Player;
import forge.gamemodes.match.HostedMatch;
import forge.gamemodes.match.LocalLobby;
import forge.player.PlayerControllerHuman;
import forge.web.seat.WebGuiGame;
import forge.web.seat.WebSeats;

/**
 * The lobby path end to end, headless: Forge's {@link LocalLobby} sets up a Commander match and presses
 * Start; the match runs with the human in a web seat (served page, token in the URL, browser opened once);
 * a WebSocket client on the seat concedes, and the match hands back to the lobby.
 */
public class LobbyWebMatchTest {

    private static final String PAGE = "<!doctype html><title>match screen</title>";

    @Test(timeOut = 300_000)
    public void startFromTheLobbyPlaysTheHumanInTheWebSeatThenHandsBack() throws Exception {
        HeadlessEngine.boot();
        Path dist = Files.createTempDirectory("forge-dist");
        Files.writeString(dist.resolve("index.html"), PAGE);
        List<String> opened = new CopyOnWriteArrayList<>();
        WebMatchHost host = new WebMatchHost(new WebMatchHost.Options(0, dist, new WebSeats.Timeouts(60_000, 60_000)), opened::add);
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
            String prefix = "http://127.0.0.1:" + host.port() + "/#token=";
            assertTrue(url.startsWith(prefix), url);
            String token = url.substring(prefix.length());

            HttpResponse<String> page = HttpClient.newHttpClient().send(
                    HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + host.port() + "/")).build(), HttpResponse.BodyHandlers.ofString());
            assertEquals(page.body(), PAGE);

            PlayerControllerHuman human = match.getHumanControllers().get(0);
            assertTrue(human.getGui() instanceof WebGuiGame, String.valueOf(human.getGui()));
            assertEquals(((WebGuiGame) human.getGui()).seat(), 0);
            List<Player> players = match.getGame().getPlayers();
            assertEquals(players.get(0).getController(), human, "the human is seat 0 of the game");
            assertEquals(players.get(0).getStartingLife(), 40);
            assertEquals(players.get(1).getStartingLife(), 40);

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
