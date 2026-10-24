package forge.fork.web.bridge.visibility;

import static org.testng.Assert.assertEquals;
import static org.testng.Assert.assertFalse;
import static org.testng.Assert.assertNull;

import java.util.ArrayList;
import java.util.List;

import org.testng.annotations.BeforeClass;
import org.testng.annotations.Test;

import com.google.gson.JsonObject;

import forge.fork.web.bridge.GameStream;
import forge.fork.web.bridge.GameStream.HiddenPolicy;
import forge.game.Game;
import forge.game.card.Card;
import forge.game.player.Player;
import forge.game.zone.ZoneType;

/**
 * Issue #185: the seat that may look at the top card of its library is sent the new top card each time the top changes (exile,
 * mill, draw, put on top, to the bottom, shuffle), and a placeholder again when the permission ends; an opponent and a
 * spectator get it only when it is revealed to all (Courser of Kruphix). The bridge was right here; the page showed no
 * library card unless it was castable (fixed in the frontend: {@code PlayerView.library}).
 */
public class LibraryTopLookTest {

    private Game game;
    private Player p0;
    private GameStream stream;
    private ClientModel seat0;
    private ClientModel seat1;
    private ClientModel spectator;

    @BeforeClass
    public void boot() {
        TestEngine.boot();
    }

    private void start() {
        game = TestEngine.newGame(2);
        p0 = game.getPlayers().get(0);
        stream = new GameStream(HiddenPolicy.REDACT, null);
        stream.startGame(game.getView());
        seat0 = new ClientModel();
        seat1 = new ClientModel();
        spectator = new ClientModel();
        stream.addClient(seat0, 0);
        stream.addClient(seat1, 1);
        stream.addClient(spectator);
    }

    private void flush() {
        game.getAction().checkStateEffects(true);
        stream.publish(new ArrayList<>(), false);
    }

    /** The name of the card on top of {@code p}'s library as this client holds it, or null while it only holds a placeholder. */
    private static String topName(ClientModel c, Player p) {
        List<Integer> ids = c.zone(p.getId(), "Library");
        if (ids.isEmpty()) {
            return null;
        }
        for (JsonObject o : c.objects.values()) {
            if ("cardState".equals(o.get("type").getAsString()) && o.get("id").getAsInt() == ids.get(0) && o.getAsJsonObject("props").has("Name")) {
                return o.getAsJsonObject("props").get("Name").getAsString();
            }
        }
        return null;
    }

    /** Fills the library, the first name on top. */
    private void library(String... names) {
        for (String n : names) {
            TestEngine.add(n, p0, ZoneType.Library);
        }
        assertEquals(top().getName(), names[0]);
    }

    private Card top() {
        return p0.getZone(ZoneType.Library).get(0);
    }

    private void assertSeatSeesTop(String why) {
        flush();
        assertEquals(topName(seat0, p0), top().getName(), why + ": the seat is sent the new top card");
        assertNull(topName(seat1, p0), why + ": not the opponent's seat");
        assertNull(topName(spectator, p0), why + ": nor a spectator");
    }

    private void withForge() {
        start();
        TestEngine.add("Mystic Forge", p0, ZoneType.Battlefield);
        library("Lightning Bolt", "Llanowar Elves", "Giant Growth", "Shock", "Counterspell");
        assertSeatSeesTop("at the start");
    }

    @Test
    public void exileShowsTheNewTop() {
        withForge();
        game.getAction().exile(top(), null, null);
        assertSeatSeesTop("exile");
    }

    @Test
    public void millShowsTheNewTop() {
        withForge();
        game.getAction().moveToGraveyard(top(), null);
        assertSeatSeesTop("mill");
    }

    @Test
    public void drawShowsTheNewTop() {
        withForge();
        p0.drawCards(1);
        assertSeatSeesTop("draw");
    }

    @Test
    public void putOnTopShowsTheNewTop() {
        withForge();
        Card c = TestEngine.add("Dark Ritual", p0, ZoneType.Hand);
        game.getAction().moveToLibrary(c, 0, null);
        assertEquals(top(), c);
        assertSeatSeesTop("put on top");
    }

    @Test
    public void toTheBottomShowsTheNewTop() {
        withForge();
        game.getAction().moveToLibrary(top(), -1, null);
        assertSeatSeesTop("to the bottom");
    }

    @Test
    public void shuffleShowsTheNewTop() {
        withForge();
        String before = top().getName();
        for (int i = 0; i < 20 && top().getName().equals(before); i++) {
            p0.shuffle(null);
        }
        assertSeatSeesTop("shuffle");
    }

    @Test
    public void theTopIsHiddenAgainWhenThePermissionEnds() {
        withForge();
        game.getAction().exile(p0.getCardsIn(ZoneType.Battlefield).get(0), null, null);
        flush();
        assertNull(topName(seat0, p0), "the source left: the top card is a placeholder again");
        assertFalse(seat0.zone(p0.getId(), "Library").isEmpty());
    }

    @Test
    public void aTopRevealedToAllIsSeenByEveryone() {
        start();
        TestEngine.add("Courser of Kruphix", p0, ZoneType.Battlefield);
        library("Forest", "Llanowar Elves", "Giant Growth");
        flush();
        assertEquals(topName(seat1, p0), "Forest", "Courser reveals the top card to the opponent");
        assertEquals(topName(spectator, p0), "Forest", "and to a spectator");
        game.getAction().exile(top(), null, null);
        flush();
        assertEquals(topName(seat0, p0), "Llanowar Elves");
        assertEquals(topName(seat1, p0), "Llanowar Elves", "the new top card is revealed at once");
        assertEquals(topName(spectator, p0), "Llanowar Elves");
    }
}
