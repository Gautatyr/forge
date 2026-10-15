package forge.web.bridge.visibility;

import static org.testng.Assert.assertEquals;
import static org.testng.Assert.assertFalse;
import static org.testng.Assert.assertNotEquals;
import static org.testng.Assert.assertNotNull;
import static org.testng.Assert.assertNull;
import static org.testng.Assert.assertTrue;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

import org.testng.annotations.BeforeClass;
import org.testng.annotations.Test;

import com.google.gson.JsonObject;
import com.google.gson.JsonPrimitive;

import forge.game.Game;
import forge.game.card.Card;
import forge.game.card.CardCollection;
import forge.game.event.GameEvent;
import forge.game.event.GameEventShuffle;
import forge.game.player.Player;
import forge.game.zone.ZoneType;
import forge.web.bridge.GameStream;
import forge.web.bridge.GameStream.HiddenPolicy;

/**
 * Per-viewer streams over a real engine game: each seat and the spectator get only what the
 * engine's view rules ({@code CardView.canBeShownTo} / {@code canFaceDownBeShownTo}) allow.
 */
public class PerViewerVisibilityTest {

    private static final Set<String> PLACEHOLDER_PROPS = Set.of("Zone", "Owner", "Controller");

    private Game game;
    private Player p0;
    private Player p1;
    private GameStream stream;
    private ClientModel seat0;
    private ClientModel seat1;
    private ClientModel spectator;

    @BeforeClass
    public void boot() {
        TestEngine.boot();
    }

    private void start(int players) {
        game = TestEngine.newGame(players);
        p0 = game.getPlayers().get(0);
        p1 = game.getPlayers().get(1);
        stream = new GameStream(HiddenPolicy.REDACT, null);
        stream.startGame(game.getView());
        seat0 = new ClientModel();
        seat1 = new ClientModel();
        spectator = new ClientModel();
        stream.addClient(seat0, 0);
        stream.addClient(seat1, 1);
        stream.addClient(spectator);
    }

    private void flush(GameEvent... events) {
        List<GameEvent> l = new ArrayList<>();
        Collections.addAll(l, events);
        stream.publish(l, false);
        assertConsistent(seat0, 0);
        assertConsistent(seat1, 1);
        assertConsistent(spectator, -1);
    }

    private void assertConsistent(ClientModel c, int seat) {
        assertTrue(c.errors.isEmpty(), "client errors for seat " + seat + ": " + c.errors);
        assertNull(c.diffAgainst(seat < 0 ? stream.snapshot() : stream.snapshot(seat)), "client state for seat " + seat);
    }

    private static void assertPlaceholder(ClientModel c, int wireId) {
        JsonObject props = c.props("card:" + wireId);
        assertNotNull(props, "placeholder card:" + wireId);
        assertTrue(PLACEHOLDER_PROPS.containsAll(props.keySet()), "placeholder leaks " + props.keySet());
        for (String key : c.objects.keySet()) {
            assertFalse(key.startsWith("cardState:" + wireId + ":"), "placeholder has a card state: " + key);
        }
    }

    @Test
    public void handCardIsNeverSentToAnOpponentOrSpectator() {
        start(2);
        Card bolt = TestEngine.add("Lightning Bolt", p0, ZoneType.Hand);
        TestEngine.add("Grizzly Bears", p1, ZoneType.Hand);
        for (int i = 0; i < 3; i++) {
            TestEngine.add("Llanowar Elves", p0, ZoneType.Library);
            TestEngine.add("Llanowar Elves", p1, ZoneType.Library);
        }
        flush();

        assertEquals(seat0.viewer.get("seat").getAsInt(), 0);
        assertEquals(seat0.viewer.get("player").getAsInt(), p0.getId());
        assertTrue(spectator.viewer.get("spectator").getAsBoolean());

        // the owner sees their own hand card in full
        assertEquals(seat0.zone(p0.getId(), "Hand"), List.of(bolt.getId()));
        assertNotNull(seat0.props("card:" + bolt.getId()));
        assertTrue(seat0.allText().contains("Lightning Bolt"));

        // the opponent gets an anonymous placeholder with another id
        List<Integer> oppHand = seat1.zone(p0.getId(), "Hand");
        assertEquals(oppHand.size(), 1);
        assertNotEquals(oppHand.get(0).intValue(), bolt.getId());
        assertNull(seat1.objects.get("card:" + bolt.getId()));
        assertPlaceholder(seat1, oppHand.get(0));
        assertFalse(seat1.allText().contains("Lightning Bolt"), "opponent stream names the hand card");
        assertTrue(seat1.allText().contains("Grizzly Bears"), "seat 1 sees its own hand");
        assertFalse(seat0.allText().contains("Grizzly Bears"));

        // libraries: hidden to everyone, owner included; counts stay right
        for (ClientModel c : List.of(seat0, seat1, spectator)) {
            assertEquals(c.zone(p0.getId(), "Library").size(), 3);
            assertEquals(c.zone(p1.getId(), "Library").size(), 3);
            for (int id : c.zone(p0.getId(), "Library")) {
                assertPlaceholder(c, id);
            }
            assertFalse(c.allText().contains("Llanowar Elves"));
        }

        // spectator: no hand card at all, only counts
        assertEquals(spectator.zone(p0.getId(), "Hand").size(), 1);
        assertEquals(spectator.zone(p1.getId(), "Hand").size(), 1);
        assertFalse(spectator.allText().contains("Lightning Bolt"));
        assertFalse(spectator.allText().contains("Grizzly Bears"));

        // a played card becomes public: the opponent now gets the real card
        game.getAction().moveTo(ZoneType.Graveyard, bolt, null, null);
        flush();
        int boltId = game.getCardsIn(ZoneType.Graveyard).get(0).getId();
        assertEquals(seat1.zone(p0.getId(), "Graveyard"), List.of(boltId));
        assertTrue(seat1.zone(p0.getId(), "Hand").isEmpty());
        assertNotNull(seat1.props("card:" + boltId));
        assertTrue(spectator.allText().contains("Lightning Bolt"));
    }

    @Test
    public void revealedCardIsSentWhileRevealedAndHiddenAgainAfter() {
        start(3);
        Player p2 = game.getPlayers().get(2);
        ClientModel seat2 = new ClientModel();
        stream.addClient(seat2, 2);
        Card bolt = TestEngine.add("Lightning Bolt", p0, ZoneType.Hand);
        flush();
        int before = seat1.zone(p0.getId(), "Hand").get(0);
        assertPlaceholder(seat1, before);

        // temporary reveal to seat 1 only (what PlayerControllerHuman.tempShowCards does for a reveal or a DelayedReveal)
        bolt.addMayLookTemp(p1);
        int mark1 = seat1.mark();
        int mark2 = seat2.mark();
        int markSpec = spectator.mark();
        flush();
        assertEquals(seat1.zone(p0.getId(), "Hand"), List.of(bolt.getId()));
        assertNotNull(seat1.props("card:" + bolt.getId()));
        assertNull(seat1.objects.get("card:" + before), "the placeholder is replaced");
        assertTrue(seat1.textSince(mark1).contains("Lightning Bolt"));
        assertFalse(seat2.textSince(mark2).contains("Lightning Bolt"), "not revealed to seat 2");
        assertFalse(spectator.textSince(markSpec).contains("Lightning Bolt"), "a reveal to one seat is not public");

        // reveal ends: hidden again under a fresh id the client cannot link to the revealed card
        bolt.removeMayLookTemp(p1);
        mark1 = seat1.mark();
        flush();
        List<Integer> after = seat1.zone(p0.getId(), "Hand");
        assertEquals(after.size(), 1);
        assertNotEquals(after.get(0).intValue(), bolt.getId());
        assertNotEquals(after.get(0).intValue(), before);
        assertPlaceholder(seat1, after.get(0));
        assertNull(seat1.objects.get("card:" + bolt.getId()));
        assertFalse(seat1.textSince(mark1).contains("Lightning Bolt"));

        // a reveal to every player is public: the spectator sees it too
        bolt.addMayLookTemp(p1);
        bolt.addMayLookTemp(p2);
        markSpec = spectator.mark();
        flush();
        assertTrue(spectator.textSince(markSpec).contains("Lightning Bolt"));
        assertEquals(spectator.zone(p0.getId(), "Hand"), List.of(bolt.getId()));
    }

    @Test
    public void ownLibraryCardIsVisibleOnlyWhileLookedAt() {
        start(2);
        Card top = TestEngine.add("Lightning Bolt", p0, ZoneType.Library);
        TestEngine.add("Llanowar Elves", p0, ZoneType.Library);
        flush();
        assertFalse(seat0.allText().contains("Lightning Bolt"), "own library is hidden");

        // scry / surveil: the owner looks at the top card
        top.addMayLookTemp(p0);
        int mark0 = seat0.mark();
        int mark1 = seat1.mark();
        flush();
        assertEquals(seat0.zone(p0.getId(), "Library").get(0).intValue(), top.getId());
        assertTrue(seat0.textSince(mark0).contains("Lightning Bolt"));
        assertFalse(seat1.textSince(mark1).contains("Lightning Bolt"));

        top.removeMayLookTemp(p0);
        mark0 = seat0.mark();
        flush();
        int wire = seat0.zone(p0.getId(), "Library").get(0);
        assertNotEquals(wire, top.getId());
        assertPlaceholder(seat0, wire);
        assertFalse(seat0.textSince(mark0).contains("Lightning Bolt"));
    }

    @Test
    public void faceDownCardShowsOnlyWhatEachPlayerMayKnow() {
        start(2);
        Card bears = TestEngine.add("Grizzly Bears", p0, ZoneType.Battlefield);
        Card aura = TestEngine.add("Holy Strength", p0, ZoneType.Battlefield);
        bears.turnFaceDown(true);
        aura.attachToEntity(bears, null, true);
        flush();

        // controller: full card, real face included
        JsonObject own = seat0.props("card:" + bears.getId());
        assertNotNull(own);
        assertTrue(own.get("Facedown").getAsBoolean());
        assertTrue(own.has("AlternateState"), "controller sees the real face");
        assertTrue(seat0.allText().contains("Grizzly Bears"));

        for (ClientModel c : List.of(seat1, spectator)) {
            List<Integer> bf = c.zone(p0.getId(), "Battlefield");
            assertEquals(bf.size(), 2);
            assertFalse(bf.contains(bears.getId()), "face-down card keeps its real id hidden");
            int wire = bf.stream().filter(id -> id != aura.getId()).findFirst().orElseThrow();
            JsonObject props = c.props("card:" + wire);
            assertNotNull(props);
            assertTrue(props.get("Facedown").getAsBoolean());
            assertEquals(props.get("CurrentState").getAsString(), "FaceDown");
            assertFalse(props.has("AlternateState"));
            assertNotNull(c.props("cardState:" + wire + ":FaceDown"));
            assertNull(c.objects.get("cardState:" + wire + ":Original"));
            assertFalse(c.allText().contains("Grizzly Bears"), "face-down card's real face leaks");
            // references to it use the same anonymous id
            JsonObject attachedTo = c.props("card:" + aura.getId()).getAsJsonObject("EntityAttachedTo");
            assertEquals(attachedTo.get("type").getAsString(), "card");
            assertEquals(attachedTo.get("id").getAsInt(), wire);
            assertTrue(props.getAsJsonArray("AttachedCards").contains(new JsonPrimitive(aura.getId())));
        }

        // turned face up: everyone gets the real card, and references follow
        int mark1 = seat1.mark();
        bears.turnFaceUp(false, null);
        flush();
        for (ClientModel c : List.of(seat1, spectator)) {
            assertTrue(c.zone(p0.getId(), "Battlefield").contains(bears.getId()));
            JsonObject attachedTo = c.props("card:" + aura.getId()).getAsJsonObject("EntityAttachedTo");
            assertEquals(attachedTo.get("id").getAsInt(), bears.getId());
        }
        assertTrue(seat1.textSince(mark1).contains("Grizzly Bears"));
    }

    @Test
    public void faceDownExiledCardIsAPlaceholderUnlessTheViewerMayLook() {
        start(2);
        Card exiled = TestEngine.add("Grizzly Bears", p0, ZoneType.Exile);
        exiled.turnFaceDown(true);
        exiled.addMayLookTemp(p0); // e.g. foretell: the owner may look at it
        flush();
        assertEquals(seat0.zone(p0.getId(), "Exile"), List.of(exiled.getId()));
        assertTrue(seat0.allText().contains("Grizzly Bears"));
        for (ClientModel c : List.of(seat1, spectator)) {
            List<Integer> exile = c.zone(p0.getId(), "Exile");
            assertEquals(exile.size(), 1);
            assertPlaceholder(c, exile.get(0));
            assertFalse(c.allText().contains("Grizzly Bears"));
        }
    }

    @Test
    public void shuffleOrReorderReissuesHiddenIds() {
        start(2);
        List<Card> lib = new ArrayList<>();
        for (int i = 0; i < 6; i++) {
            lib.add(TestEngine.add("Llanowar Elves", p0, ZoneType.Library));
        }
        flush();
        Set<Integer> first = new HashSet<>(seat1.zone(p0.getId(), "Library"));
        assertEquals(first.size(), 6);

        // a shuffle event re-issues every hidden id, even if the order happens to be unchanged
        flush(new GameEventShuffle(p0));
        Set<Integer> second = new HashSet<>(seat1.zone(p0.getId(), "Library"));
        assertEquals(second.size(), 6);
        assertTrue(Collections.disjoint(first, second), "ids survived a shuffle: " + first + " / " + second);

        // a reorder without an event is detected from the order itself
        CardCollection reversed = new CardCollection(p0.getCardsIn(ZoneType.Library));
        Collections.reverse(reversed);
        p0.getZone(ZoneType.Library).setCards(reversed);
        flush();
        Set<Integer> third = new HashSet<>(seat1.zone(p0.getId(), "Library"));
        assertEquals(third.size(), 6);
        assertTrue(Collections.disjoint(second, third));

        // drawing does not reorder: the remaining ids are kept
        game.getAction().moveTo(ZoneType.Hand, p0.getCardsIn(ZoneType.Library).get(0), null, null);
        List<Integer> beforeDraw = seat1.zone(p0.getId(), "Library");
        flush();
        List<Integer> afterDraw = seat1.zone(p0.getId(), "Library");
        assertEquals(afterDraw, beforeDraw.subList(1, beforeDraw.size()));
    }

    @Test
    public void seatResolvesItsWireIdsToEngineIds() {
        start(2);
        Card bolt = TestEngine.add("Lightning Bolt", p0, ZoneType.Hand);
        Card bears = TestEngine.add("Grizzly Bears", p0, ZoneType.Battlefield);
        flush();
        int wire = seat1.zone(p0.getId(), "Hand").get(0);
        assertEquals(stream.realCardId(1, wire), bolt.getId());
        assertEquals(stream.realCardId(1, bears.getId()), bears.getId());
        assertEquals(stream.realCardId(0, bolt.getId()), bolt.getId());
        // a seat cannot address a card it does not see under that id
        assertEquals(stream.realCardId(1, bolt.getId()), -1);
        assertEquals(stream.realCardId(0, wire), -1);
    }

    @Test
    public void fullPolicyIsOmniscient() {
        game = TestEngine.newGame(2);
        p0 = game.getPlayers().get(0);
        stream = new GameStream(HiddenPolicy.FULL, null);
        stream.startGame(game.getView());
        ClientModel c = new ClientModel();
        stream.addClient(c);
        Card bolt = TestEngine.add("Lightning Bolt", p0, ZoneType.Hand);
        stream.publish(new ArrayList<>(), false);
        assertEquals(c.zone(p0.getId(), "Hand"), List.of(bolt.getId()));
        assertTrue(c.allText().contains("Lightning Bolt"));
    }
}
