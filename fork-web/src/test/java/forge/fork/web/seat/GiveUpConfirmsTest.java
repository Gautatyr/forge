package forge.fork.web.seat;

import static org.testng.Assert.assertEquals;
import static org.testng.Assert.assertFalse;
import static org.testng.Assert.assertNotNull;
import static org.testng.Assert.assertTrue;

import java.util.ArrayList;
import java.util.List;

import org.testng.annotations.BeforeClass;
import org.testng.annotations.Test;

import com.google.gson.JsonObject;

import forge.ai.LobbyPlayerAi;
import forge.deck.Deck;
import forge.game.Game;
import forge.game.GameRules;
import forge.game.GameType;
import forge.game.Match;
import forge.game.player.RegisteredPlayer;
import forge.gamemodes.match.input.InputConfirm;
import forge.gamemodes.net.ProtocolMethod;
import forge.player.LobbyPlayerHuman;
import forge.player.PlayerControllerHuman;
import forge.util.Localizer;
import forge.fork.web.bridge.visibility.TestEngine;

/**
 * U8 (Space-default safety): an engine yes/no whose Yes gives up what the seat was doing ("Cancel Search? Up to 1 more
 * card(s) can be selected.") says so on the wire ({@code giveUp: "yes"}), so the page never answers it with Space.
 * Classified by the engine's message keys in the current language, never by English words.
 */
public class GiveUpConfirmsTest {

    private PlayerControllerHuman pch;

    @BeforeClass
    public void boot() {
        TestEngine.boot();
        List<RegisteredPlayer> rps = new ArrayList<>();
        rps.add(new RegisteredPlayer(new Deck()).setPlayer(new LobbyPlayerHuman("You")));
        rps.add(new RegisteredPlayer(new Deck()).setPlayer(new LobbyPlayerAi("ai1", null)));
        GameRules rules = new GameRules(GameType.Constructed);
        Game game = new Game(rps, rules, new Match(rules, rps, "Test"));
        pch = (PlayerControllerHuman) game.getPlayers().get(0).getController();
    }

    private static String msg(String key, Object... args) {
        return Localizer.getInstance().getMessage(key, args);
    }

    @Test
    public void theEnginesCancelConfirmationsGiveUpOnYes() {
        // ChangeZoneEffect: the seat chose nothing in a search ("Cancel Search? Up to 1 more card(s) can be selected.").
        assertTrue(GiveUpConfirms.yesGivesUp(msg("lblCancelSearchUpToSelectNumCards", "1")));
        assertTrue(GiveUpConfirms.yesGivesUp(msg("lblCancelSearchUpToSelectNumCards", "12")));
        // ChooseCardEffect, CopyPermanentEffect: the seat chose nothing in an optional choice.
        assertTrue(GiveUpConfirms.yesGivesUp(msg("lblCancelChooseConfirm")));
    }

    @Test
    public void otherConfirmationsDoNot() {
        assertFalse(GiveUpConfirms.yesGivesUp(null));
        assertFalse(GiveUpConfirms.yesGivesUp(""));
        assertFalse(GiveUpConfirms.yesGivesUp("Use triggered ability of Llanowar Elves?"));
        assertFalse(GiveUpConfirms.yesGivesUp(msg("lblPutCardOnTopOrBottomLibrary", "Plains")));
        // The search question inside another question is that other question.
        assertFalse(GiveUpConfirms.yesGivesUp("Pay 2? " + msg("lblCancelSearchUpToSelectNumCards", "1")));
    }

    @Test
    public void anInputConfirmCarriesItsGiveUpAnswer() {
        JsonObject search = InputInfo.of(new InputConfirm(pch, msg("lblCancelSearchUpToSelectNumCards", "1"), "Yes", "No", true));
        assertNotNull(search);
        assertEquals(search.get("kind").getAsString(), "confirm", search.toString());
        assertEquals(search.has("giveUp") ? search.get("giveUp").getAsString() : null, "yes", search.toString());

        JsonObject may = InputInfo.of(new InputConfirm(pch, "Use triggered ability of Llanowar Elves?", "Yes", "No", true));
        assertNotNull(may);
        assertEquals(may.get("kind").getAsString(), "confirm", may.toString());
        assertFalse(may.has("giveUp"), may.toString());
    }

    @Test
    public void aConfirmPromptCarriesItsGiveUpAnswer() {
        JsonObject j = new JsonObject();
        new Prompt.Confirm(ProtocolMethod.confirm, msg("lblCancelChooseConfirm"), null, null, "Yes", "No", true).fill(j, null);
        assertEquals(j.has("giveUp") ? j.get("giveUp").getAsString() : null, "yes", j.toString());
        JsonObject other = new JsonObject();
        new Prompt.Confirm(ProtocolMethod.confirm, "Play first?", null, null, "Play", "Draw", true).fill(other, null);
        assertFalse(other.has("giveUp"), other.toString());
    }
}
