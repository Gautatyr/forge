package forge.fork.web.bridge.visibility;

import static org.testng.Assert.assertEquals;
import static org.testng.Assert.assertFalse;
import static org.testng.Assert.assertNotEquals;
import static org.testng.Assert.assertNotNull;
import static org.testng.Assert.assertNull;
import static org.testng.Assert.assertTrue;

import java.util.ArrayList;
import java.util.List;

import org.testng.annotations.BeforeClass;
import org.testng.annotations.Test;

import com.google.common.eventbus.Subscribe;
import com.google.gson.JsonObject;

import forge.game.Game;
import forge.game.card.Card;
import forge.game.event.GameEvent;
import forge.game.player.Player;
import forge.game.undo.UndoManager;
import forge.game.zone.ZoneType;
import forge.fork.web.bridge.GameStream;
import forge.fork.web.bridge.GameStream.HiddenPolicy;

/**
 * Undo ({@link UndoManager#undo}) rewinds the game by writing fields directly: the views' properties,
 * their delta-sync dirty bits and their consumer registrations included. A delta collection after it
 * sees nothing changed, and an object registered after the restored checkpoint never reports a change
 * again. The stream must resend the whole view after a restore (issue #47).
 */
public class UndoResyncTest {

    private Game game;
    private Player p0;
    private GameStream stream;
    private ClientModel seat0;
    private ClientModel seat1;
    private ClientModel spectator;
    private final List<GameEvent> events = new ArrayList<>();

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
        events.clear();
        game.subscribeToEvents(new Object() {
            @Subscribe
            public void on(GameEvent e) {
                events.add(e);
            }
        });
    }

    /** Publishes the events fired since the last flush, as the seat's event forwarder does. */
    private void flush() {
        List<GameEvent> batch = new ArrayList<>(events);
        events.clear();
        stream.publish(batch, false);
        for (ClientModel c : List.of(seat0, seat1, spectator)) {
            assertTrue(c.errors.isEmpty(), "client errors: " + c.errors);
        }
        assertNull(seat0.diffAgainst(stream.snapshot(0)), "seat 0 client vs server mirror");
        assertNull(seat1.diffAgainst(stream.snapshot(1)), "seat 1 client vs server mirror");
        assertNull(spectator.diffAgainst(stream.snapshot()), "spectator client vs server mirror");
    }

    /** As PlayerControllerHuman.chooseSpellAbilityToPlay: a checkpoint before each priority prompt, then the prompt's flush. */
    private void priorityPrompt() {
        game.getUndoManager().checkpoint(game, p0);
        flush();
    }

    private static boolean tapped(ClientModel c, int cardId) {
        JsonObject props = c.props("card:" + cardId);
        assertNotNull(props, "client holds card " + cardId);
        return props.has("Tapped") && props.get("Tapped").getAsBoolean();
    }

    @Test
    public void undoingATapUntapsTheCardOnEveryClient() {
        start();
        Card forest = TestEngine.add("Forest", p0, ZoneType.Battlefield);
        priorityPrompt();

        forest.setTapped(true);
        priorityPrompt();
        for (ClientModel c : List.of(seat0, seat1, spectator)) {
            assertTrue(tapped(c, forest.getId()), "tap reached the client");
        }

        assertTrue(game.getUndoManager().undo(game));
        assertFalse(forest.isTapped(), "engine untapped the card");
        flush();
        for (ClientModel c : List.of(seat0, seat1, spectator)) {
            assertFalse(tapped(c, forest.getId()), "undo reached the client");
        }
    }

    @Test
    public void undoingAZoneChangeMovesTheCardBackOnEveryClient() {
        start();
        Card forest = TestEngine.add("Forest", p0, ZoneType.Hand);
        priorityPrompt();

        game.getAction().moveTo(ZoneType.Battlefield, forest, null, null);
        Card played = p0.getCardsIn(ZoneType.Battlefield).get(0);
        played.setTapped(true);
        priorityPrompt();
        assertEquals(seat0.zone(p0.getId(), "Battlefield"), List.of(played.getId()));
        assertTrue(seat0.zone(p0.getId(), "Hand").isEmpty());

        assertTrue(game.getUndoManager().undo(game));
        assertEquals(p0.getCardsIn(ZoneType.Hand).size(), 1, "engine put the card back in hand");
        assertTrue(p0.getCardsIn(ZoneType.Battlefield).isEmpty());
        flush();
        int handId = p0.getCardsIn(ZoneType.Hand).get(0).getId();
        assertEquals(seat0.zone(p0.getId(), "Hand"), List.of(handId));
        for (ClientModel c : List.of(seat0, seat1, spectator)) {
            assertTrue(c.zone(p0.getId(), "Battlefield").isEmpty(), "undo emptied the battlefield on the client");
            assertEquals(c.zone(p0.getId(), "Hand").size(), 1);
        }
        assertFalse(tapped(seat0, handId), "the card in hand is not tapped");
        // back in a hidden zone: the opponent holds it under a fresh alias only
        assertNotEquals(seat1.zone(p0.getId(), "Hand").get(0).intValue(), handId);
        assertNull(seat1.objects.get("card:" + handId), "opponent still holds the card under its engine id");
    }

    @Test
    public void changesAfterAnUndoStillReachTheClients() {
        start();
        Card forest = TestEngine.add("Forest", p0, ZoneType.Battlefield);
        priorityPrompt();
        forest.setTapped(true);
        priorityPrompt();
        assertTrue(game.getUndoManager().undo(game));
        flush();

        // the forest was registered for delta sync after the restored checkpoint: the restore rewound that
        // registration too, and without a reset its later changes were never collected (playtest item 11)
        forest.setTapped(true);
        flush();
        assertTrue(tapped(seat0, forest.getId()), "tap after the undo reached the client");
        forest.setTapped(false);
        flush();
        assertFalse(tapped(seat0, forest.getId()), "untap after the undo reached the client");
        Card bears = TestEngine.add("Grizzly Bears", p0, ZoneType.Battlefield);
        flush();
        assertTrue(seat1.zone(p0.getId(), "Battlefield").contains(bears.getId()), "a new permanent after the undo reached the client");
    }
}
