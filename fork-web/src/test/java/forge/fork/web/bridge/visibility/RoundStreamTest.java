package forge.fork.web.bridge.visibility;

import static org.testng.Assert.assertEquals;
import static org.testng.Assert.assertFalse;
import static org.testng.Assert.assertTrue;

import java.util.List;

import org.testng.annotations.BeforeClass;
import org.testng.annotations.Test;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

import forge.game.Game;
import forge.game.event.GameEvent;
import forge.game.event.GameEventTurnBegan;
import forge.game.player.Player;
import forge.fork.web.bridge.GameStream;
import forge.fork.web.bridge.GameStream.HiddenPolicy;

/** The stream sends the round (RoundCounter) in snapshots and in the deltas that change it. */
public class RoundStreamTest {

    @BeforeClass
    public void boot() {
        TestEngine.boot();
    }

    private static GameEvent turn(Player p, int n) {
        return new GameEventTurnBegan(p.getView(), n);
    }

    private static JsonObject last(ClientModel c) {
        return JsonParser.parseString(c.frames.get(c.frames.size() - 1)).getAsJsonObject();
    }

    @Test
    public void roundFollowsTurnEventsAcrossBatchesAndReconnects() {
        Game game = TestEngine.newGame(3);
        List<Player> ps = game.getPlayers();
        GameStream stream = new GameStream(HiddenPolicy.REDACT, null);
        stream.startGame(game.getView());
        ClientModel seat0 = new ClientModel();
        stream.addClient(seat0, 0);
        assertFalse(last(seat0).has("round"), "no round before turn 1");

        stream.publish(List.of(turn(ps.get(0), 1)), false);
        assertEquals(last(seat0).get("round").getAsInt(), 1);

        // Several turns in one batch: the counter still sees each one.
        stream.publish(List.of(turn(ps.get(1), 2), turn(ps.get(2), 3), turn(ps.get(0), 4), turn(ps.get(1), 5)), false);
        assertEquals(last(seat0).get("round").getAsInt(), 2);

        // A flush that does not change the round leaves it out (a life change makes sure a delta is sent).
        int mark = seat0.mark();
        ps.get(2).setLife(15, null);
        stream.publish(List.of(turn(ps.get(2), 6)), false);
        String sent = seat0.textSince(mark);
        assertFalse(sent.isEmpty(), "a delta is sent");
        assertFalse(sent.contains("\"round\""), sent);

        // The first player is out: the next one opens the rounds.
        ps.get(0).getView().setHasLost(true);
        stream.publish(List.of(turn(ps.get(1), 7)), false);
        assertEquals(last(seat0).get("round").getAsInt(), 3);

        ClientModel late = new ClientModel();
        stream.addClient(late, 1);
        assertEquals(JsonParser.parseString(late.frames.get(1)).getAsJsonObject().get("round").getAsInt(), 3);
        assertTrue(seat0.errors.isEmpty(), seat0.errors.toString());
    }
}
