package forge.fork.web.seat;

import static org.testng.Assert.assertEquals;
import static org.testng.Assert.assertTrue;

import java.util.List;

import org.testng.annotations.BeforeClass;
import org.testng.annotations.Test;

import com.google.gson.JsonObject;

import forge.game.Game;
import forge.game.card.Card;
import forge.game.combat.Combat;
import forge.game.player.Player;
import forge.game.zone.ZoneType;
import forge.fork.web.bridge.SeatRefs;
import forge.fork.web.bridge.visibility.TestEngine;
import forge.fork.web.bridge.visibility.Visibility;

/** Issue #65: the defenders offered to the attacking seat are the engine's, planeswalkers included. */
public class AttackOptionsTest {

    @BeforeClass
    public void boot() {
        TestEngine.boot();
    }

    @Test
    public void opponentsAndTheirPlaneswalkersNotYours() {
        Game game = TestEngine.newGame(3);
        Player me = game.getPlayers().get(0);
        Player a = game.getPlayers().get(1);
        Player b = game.getPlayers().get(2);
        Card teferi = TestEngine.add("Teferi, Temporal Archmage", a, ZoneType.Battlefield);
        Card mine = TestEngine.add("Ajani Goldmane", me, ZoneType.Battlefield);
        TestEngine.add("Grizzly Bears", b, ZoneType.Battlefield);
        AttackOptions o = AttackOptions.of(new Combat(me));
        assertTrue(o.defenders().containsAll(List.of(a, b, teferi)), o.defenders().toString());
        assertEquals(o.defenders().size(), 3, o.defenders().toString());
        assertTrue(!o.defenders().contains(mine));
        assertTrue(AttackOptions.of(null).defenders().isEmpty());
    }

    @Test
    public void jsonNamesPlayersAndCardsInTheSeatsIdSpace() {
        Game game = TestEngine.newGame(2);
        Player me = game.getPlayers().get(0);
        Player opp = game.getPlayers().get(1);
        Card teferi = TestEngine.add("Teferi, Temporal Archmage", opp, ZoneType.Battlefield);
        JsonObject j = AttackOptions.of(new Combat(me)).toJson(new SeatRefs() {
            @Override
            public int card(int realId) {
                return realId + 1000;
            }

            @Override
            public Visibility visibility(forge.game.card.CardView card) {
                return null;
            }
        });
        assertEquals(j.toString(), "{\"t\":\"attackOptions\",\"defenders\":[{\"type\":\"player\",\"id\":" + opp.getId()
                + "},{\"type\":\"card\",\"id\":" + (teferi.getId() + 1000) + "}]}");
    }
}
