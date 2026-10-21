package forge.web.seat;

import static org.testng.Assert.assertEquals;
import static org.testng.Assert.assertFalse;
import static org.testng.Assert.assertNotNull;
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
import forge.web.bridge.SeatRefs;
import forge.web.bridge.visibility.TestEngine;
import forge.web.bridge.visibility.Visibility;

/** Issue #48: the blocks offered to the seat are the engine's, per attacker. */
public class BlockOptionsTest {

    private Game game;
    private Player me;
    private Player opp;
    private Combat combat;

    @BeforeClass
    public void boot() {
        TestEngine.boot();
    }

    private void start(int players) {
        game = TestEngine.newGame(players);
        me = game.getPlayers().get(0);
        opp = game.getPlayers().get(1);
        combat = new Combat(opp);
    }

    private Card add(String name, Player p) {
        Card c = TestEngine.add(name, p, ZoneType.Battlefield);
        c.setSickness(false);
        return c;
    }

    private Card attack(String name, Player defender) {
        Card c = add(name, opp);
        combat.addAttacker(c, defender);
        return c;
    }

    private BlockOptions.Attacker of(Card attacker) {
        game.getAction().checkStaticAbilities();
        for (BlockOptions.Attacker a : BlockOptions.of(combat, me).attackers()) {
            if (a.card() == attacker) {
                return a;
            }
        }
        return null;
    }

    @Test
    public void flyingNeedsFlyingOrReachAndCantBlockNeverBlocks() {
        start(2);
        Card hawk = attack("Suntail Hawk", me);
        Card lions = attack("Savannah Lions", me);
        Card bears = add("Grizzly Bears", me);
        Card spider = add("Giant Spider", me);
        Card goblin = add("Hulking Goblin", me); // can't block
        Card tapped = add("Grizzly Bears", me);
        tapped.setTapped(true);
        Card sick = TestEngine.add("Grizzly Bears", me, ZoneType.Battlefield); // summoning sickness doesn't stop blocking
        assertEquals(of(hawk).blockers(), List.of(spider));
        assertEquals(of(lions).blockers(), List.of(bears, spider, sick));
        assertFalse(of(lions).blockers().contains(goblin));
        assertEquals(of(lions).min(), 1);
    }

    @Test
    public void menaceNeedsTwoAndEachCreatureMayBlockAlone() {
        start(2);
        add("Goblin War Drums", opp); // creatures the attacker controls have menace
        Card lions = attack("Savannah Lions", me);
        Card bears = add("Grizzly Bears", me);
        Card bears2 = add("Grizzly Bears", me);
        assertEquals(of(lions).min(), 2);
        assertEquals(of(lions).blockers(), List.of(bears, bears2));
    }

    @Test
    public void aBlockingCreatureStaysOfferedForItsAttackerAndMovesToAnother() {
        start(2);
        Card lions = attack("Savannah Lions", me);
        Card hawk = attack("Suntail Hawk", me);
        Card vanguard = attack("Elite Vanguard", me);
        Card bears = add("Grizzly Bears", me);
        Card spider = add("Giant Spider", me);
        Card guard = add("Palace Guard", me); // can block any number of creatures
        combat.addBlocker(lions, bears);
        combat.addBlocker(lions, spider);
        combat.addBlocker(lions, guard);
        assertEquals(of(lions).blockers(), List.of(bears, spider, guard));
        // bears blocks the lions: it can block the vanguard only once taken off them; the guard may block both
        assertEquals(of(vanguard).blockers(), List.of(guard));
        assertEquals(of(vanguard).ifFreed(), List.of(bears, spider));
        // the hawk flies: only the spider, once freed
        assertEquals(of(hawk).blockers(), List.of());
        assertEquals(of(hawk).ifFreed(), List.of(spider));
    }

    @Test
    public void onlyAttackersOfPlayersTheSeatDeclaresFor() {
        start(3);
        Player other = game.getPlayers().get(2);
        Card atMe = attack("Savannah Lions", me);
        Card atOther = attack("Elite Vanguard", other);
        add("Grizzly Bears", me);
        assertNotNull(of(atMe));
        assertEquals(of(atOther), null);
        assertTrue(BlockOptions.of(null, me).attackers().isEmpty());
    }

    @Test
    public void jsonNamesCardsInTheSeatsIdSpace() {
        start(2);
        add("Goblin War Drums", opp);
        Card lions = attack("Savannah Lions", me);
        Card bears = add("Grizzly Bears", me);
        game.getAction().checkStaticAbilities();
        JsonObject j = BlockOptions.of(combat, me).toJson(new SeatRefs() {
            @Override
            public int card(int realId) {
                return realId + 1000;
            }

            @Override
            public Visibility visibility(forge.game.card.CardView card) {
                return null;
            }
        });
        assertEquals(j.toString(), "{\"t\":\"blockOptions\",\"attackers\":[{\"card\":" + (lions.getId() + 1000) + ",\"blockers\":["
                + (bears.getId() + 1000) + "],\"ifFreed\":[],\"min\":2}]}");
    }
}
