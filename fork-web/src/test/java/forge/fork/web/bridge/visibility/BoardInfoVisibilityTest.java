package forge.fork.web.bridge.visibility;

import static org.testng.Assert.assertEquals;
import static org.testng.Assert.assertFalse;
import static org.testng.Assert.assertNotNull;
import static org.testng.Assert.assertNull;
import static org.testng.Assert.assertTrue;

import java.util.ArrayList;
import java.util.List;

import org.testng.annotations.BeforeClass;
import org.testng.annotations.Test;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;

import forge.card.GamePieceType;
import forge.game.Game;
import forge.game.ability.AbilityFactory;
import forge.game.card.Card;
import forge.game.player.Player;
import forge.game.spellability.SpellAbility;
import forge.game.zone.ZoneType;
import forge.fork.web.bridge.GameStream;
import forge.fork.web.bridge.GameStream.HiddenPolicy;

/**
 * What the board-information view data (effects, auras on a player, imprint / exiled-with links, sub-ability
 * targets) puts on the wire, per viewer, over a real engine game: nothing hidden may ride along.
 */
public class BoardInfoVisibilityTest {

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

    private void start() {
        game = TestEngine.newGame(2);
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

    private void flush() {
        stream.publish(new ArrayList<>(), false);
        for (ClientModel c : List.of(seat0, seat1, spectator)) {
            assertTrue(c.errors.isEmpty(), "client errors: " + c.errors);
        }
        assertNull(seat0.diffAgainst(stream.snapshot(0)), "seat 0 state");
        assertNull(seat1.diffAgainst(stream.snapshot(1)), "seat 1 state");
        assertNull(spectator.diffAgainst(stream.snapshot()), "spectator state");
    }

    private static List<Integer> ids(JsonObject props, String name) {
        List<Integer> out = new ArrayList<>();
        if (props != null && props.has(name)) {
            props.getAsJsonArray(name).forEach(e -> out.add(e.getAsInt()));
        }
        return out;
    }

    @Test
    public void effectCardsAndAurasOnAPlayerReachEveryViewer() {
        start();
        game.getAction().becomeMonarch(p0, "");
        Card curse = TestEngine.add("Curse of Bounty", p1, ZoneType.Battlefield);
        curse.attachToEntity(p0, null, true);
        flush();
        for (ClientModel c : List.of(seat0, seat1, spectator)) {
            List<Integer> command = c.zone(p0.getId(), "Command");
            assertEquals(command.size(), 1, "the Monarch effect card is in p0's command zone");
            JsonObject monarch = c.props("card:" + command.get(0));
            assertNotNull(monarch);
            assertEquals(monarch.get("GamePieceType").getAsString(), GamePieceType.EFFECT.name());
            assertEquals(ids(c.props("player:" + p0.getId()), "AttachedCards"), List.of(curse.getId()), "the Curse is on the enchanted player");
            JsonObject attachedTo = c.props("card:" + curse.getId()).getAsJsonObject("EntityAttachedTo");
            assertEquals(attachedTo.get("type").getAsString(), "player");
            assertEquals(attachedTo.get("id").getAsInt(), p0.getId());
        }
    }

    @Test
    public void imprintAndExiledWithLinksNeverNameACardTheViewerCannotSee() {
        start();
        Card vat = TestEngine.add("Mimic Vat", p0, ZoneType.Battlefield);
        Card inHand = TestEngine.add("Lightning Bolt", p0, ZoneType.Hand);
        Card faceDown = TestEngine.add("Grizzly Bears", p0, ZoneType.Exile);
        faceDown.turnFaceDown(true);
        Card faceUp = TestEngine.add("Llanowar Elves", p0, ZoneType.Exile);
        for (Card held : List.of(inHand, faceDown, faceUp)) {
            vat.addImprintedCard(held);
            vat.addExiledCard(held);
            held.setExiledWith(vat);
        }
        flush();

        // the owner: the cards they may see by their engine id (a face-down exiled card is not theirs to look at either)
        List<Integer> own = ids(seat0.props("card:" + vat.getId()), "ImprintedCards");
        assertEquals(own.size(), 3);
        assertEquals(own.get(0).intValue(), inHand.getId());
        assertEquals(own.get(2).intValue(), faceUp.getId());
        assertFalse(own.contains(faceDown.getId()));

        for (ClientModel c : List.of(seat1, spectator)) {
            JsonObject sent = c.props("card:" + vat.getId());
            for (String prop : List.of("ImprintedCards", "ExiledCards")) {
                List<Integer> held = ids(sent, prop);
                assertEquals(held.size(), 3, prop);
                assertTrue(held.contains(faceUp.getId()), prop + " names the card everyone may see");
                assertFalse(held.contains(inHand.getId()), prop + " leaks the hidden hand card's id");
                assertFalse(held.contains(faceDown.getId()), prop + " leaks the face-down exiled card's id");
                // the other two are ids that name no object here
                for (int id : held) {
                    if (id != faceUp.getId()) {
                        assertNull(c.objects.get("card:" + id), prop + " names a card the client holds (" + id + ")");
                    }
                }
            }
            // the visible exiled card points back at its holder; a hidden one has no card to carry it
            assertEquals(c.props("card:" + faceUp.getId()).get("ExiledWith").getAsInt(), vat.getId());
            String text = c.allText();
            assertFalse(text.contains("Lightning Bolt"), "the hidden hand card is named");
            assertFalse(text.contains("Grizzly Bears"), "the face-down exiled card is named");
            // Remembered (the toString of whatever a card remembers) is never sent
            for (JsonObject o : c.objects.values()) {
                assertFalse(o.getAsJsonObject("props").has("Remembered"), "Remembered is sent");
            }
        }
    }

    @Test
    public void aSubAbilityOfAStackItemReachesTheViewerWithItsTargets() {
        start();
        Card cratermaker = TestEngine.add("Goblin Cratermaker", p1, ZoneType.Battlefield);
        Card birds = TestEngine.add("Birds of Paradise", p0, ZoneType.Battlefield);
        cratermaker.setSVar("DBDmg", "DB$ DealDamage | ValidTgts$ Creature | NumDmg$ 2");
        SpellAbility top = AbilityFactory.getAbility("AB$ Draw | Cost$ 0 | Defined$ You | SubAbility$ DBDmg", cratermaker);
        top.setActivatingPlayer(p1);
        SpellAbility sub = top.getSubAbility();
        sub.setActivatingPlayer(p1);
        sub.getTargets().add(birds);
        game.getStack().add(top);
        flush();

        JsonObject gameProps = null;
        for (JsonObject o : seat0.objects.values()) {
            if ("game".equals(o.get("type").getAsString())) {
                gameProps = o.getAsJsonObject("props");
            }
        }
        assertNotNull(gameProps);
        List<Integer> stack = ids(gameProps, "Stack");
        assertEquals(stack.size(), 1, "one item on the stack");
        for (ClientModel c : List.of(seat0, seat1, spectator)) {
            JsonObject item = c.props("stackItem:" + stack.get(0));
            assertNotNull(item, "the stack item");
            assertTrue(item.has("SubInstance"), "the item names its sub-ability: " + item);
            JsonObject subItem = c.props("stackItem:" + item.get("SubInstance").getAsInt());
            assertNotNull(subItem, "the sub-ability is a wire object");
            JsonElement targets = subItem.get("TargetCards");
            assertNotNull(targets, "the sub-ability's targets: " + subItem);
            assertEquals(targets.getAsJsonArray().get(0).getAsInt(), birds.getId());
        }
    }
}
