package forge.ai.ability;

import java.io.ByteArrayOutputStream;
import java.io.PrintStream;
import java.nio.charset.StandardCharsets;

import org.testng.AssertJUnit;
import org.testng.annotations.Test;

import forge.ai.AITest;
import forge.game.Game;
import forge.game.card.Card;
import forge.game.phase.PhaseType;
import forge.game.player.Player;
import forge.game.zone.ZoneType;

/**
 * "Pay life equal to its mana value rather than its mana cost" ({@code PayLife<ConvertedManaCost>}) for an AI player:
 * Anrakyr the Traveller's attack trigger (PlayCost, from hand and from graveyard) and Bolas's Citadel (MayPlayAltManaCost).
 * The controller loses exactly the mana value, and no "SVar not defined" fallback to 0 is logged on the way.
 */
public class PayLifeManaValueTest extends AITest {

    private static final String ARTIFACT = "Wurmcoil Engine"; // mana value 6

    /** Runs {@code body} capturing System.err; returns what it printed. */
    private static String stderrOf(Runnable body) {
        PrintStream old = System.err;
        ByteArrayOutputStream buf = new ByteArrayOutputStream();
        System.setErr(new PrintStream(buf, true, StandardCharsets.UTF_8));
        try {
            body.run();
        } finally {
            System.setErr(old);
        }
        String out = buf.toString(StandardCharsets.UTF_8);
        old.print(out);
        return out;
    }

    private Game anrakyrAttacks(ZoneType artifactZone, Card[] artifact) {
        Game game = initAndCreateGame();
        Player ai = game.getPlayers().get(1);
        Player opp = game.getPlayers().get(0);
        fillLibrary(ai, 5);
        fillLibrary(opp, 5);
        Card anrakyr = addCard("Anrakyr the Traveller", ai);
        anrakyr.setSickness(false);
        artifact[0] = addCardToZone(ARTIFACT, ai, artifactZone);
        game.getPhaseHandler().devModeSet(PhaseType.MAIN1, ai);
        game.getPhaseHandler().onStackResolved();
        String err = stderrOf(() -> playUntilPhase(game, PhaseType.MAIN2));
        AssertJUnit.assertFalse("game must not be over", game.isGameOver());
        AssertJUnit.assertEquals("Anrakyr attacked", 16, opp.getLife());
        AssertJUnit.assertFalse("no SVar fallback: " + err, err.contains("SVar 'ConvertedManaCost'"));
        return game;
    }

    @Test
    public void anrakyrCastsFromHandForLifeEqualToManaValue() {
        Card[] artifact = new Card[1];
        Game game = anrakyrAttacks(ZoneType.Hand, artifact);
        Player ai = game.getPlayers().get(1);
        AssertJUnit.assertEquals(ZoneType.Battlefield, game.getCardState(artifact[0]).getZone().getZoneType());
        AssertJUnit.assertEquals("paid 6 life", 14, ai.getLife());
    }

    @Test
    public void anrakyrCastsFromGraveyardForLifeEqualToManaValue() {
        Card[] artifact = new Card[1];
        Game game = anrakyrAttacks(ZoneType.Graveyard, artifact);
        Player ai = game.getPlayers().get(1);
        AssertJUnit.assertEquals(ZoneType.Battlefield, game.getCardState(artifact[0]).getZone().getZoneType());
        AssertJUnit.assertEquals("paid 6 life", 14, ai.getLife());
    }

    @Test
    public void bolassCitadelCastsTheTopCardForLifeEqualToManaValue() {
        Game game = initAndCreateGame();
        Player ai = game.getPlayers().get(1);
        for (int i = 0; i < 5; i++) {
            addCardToZone("Swamp", ai, ZoneType.Library); // under the artifact: no other spell to pay life for
        }
        fillLibrary(game.getPlayers().get(0), 5);
        addCard("Bolas's Citadel", ai);
        Card top = createCard(ARTIFACT, ai);
        top.setGameTimestamp(game.getNextTimestamp());
        ai.getZone(ZoneType.Library).add(top, 0);
        AssertJUnit.assertEquals(top, ai.getCardsIn(ZoneType.Library).get(0));
        game.getPhaseHandler().devModeSet(PhaseType.MAIN1, ai);
        game.getPhaseHandler().onStackResolved();
        game.getAction().checkStateEffects(true);

        String err = stderrOf(() -> playUntilPhase(game, PhaseType.END_OF_TURN));

        AssertJUnit.assertEquals(ZoneType.Battlefield, game.getCardState(top).getZone().getZoneType());
        AssertJUnit.assertEquals("paid 6 life", 14, ai.getLife());
        AssertJUnit.assertFalse("no SVar fallback: " + err, err.contains("SVar 'ConvertedManaCost'"));
    }
}
