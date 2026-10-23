package forge.fork.web;

import static org.testng.Assert.assertEquals;
import static org.testng.Assert.assertFalse;
import static org.testng.Assert.assertTrue;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.testng.annotations.BeforeClass;
import org.testng.annotations.Test;

import forge.fork.web.bridge.visibility.TestEngine;
import forge.deck.Deck;
import forge.game.GameRules;
import forge.game.GameType;
import forge.game.player.RegisteredPlayer;
import forge.gui.interfaces.IGuiGame;

public class WebMainTest {

    /** GameType's static init needs the engine's localizer: without it, a first-run NPE poisons GameType for the JVM. */
    @BeforeClass
    public void boot() {
        TestEngine.boot();
    }

    /** Issue #110: an AI seat is "AI n", never carrying its deck name. */
    @Test
    public void aiSeatNamesArePlain() {
        assertEquals(WebMain.aiName(1), "AI 1");
        assertEquals(WebMain.aiName(3), "AI 3");
    }

    /** Issue #110: the players a game starts with carry plain names, not the decks'; a regression in the start path fails here. */
    @Test
    public void gameStartNamesNoSeatAfterItsDeck() {
        List<WebMain.Slot> slots = List.of(
                new WebMain.Slot(0, new Deck("Mono Red Burn"), true),
                new WebMain.Slot(1, new Deck("Sultai Value"), false),
                new WebMain.Slot(2, new Deck("Selesnya Tokens"), false));
        Map<RegisteredPlayer, IGuiGame> guis = new LinkedHashMap<>();
        List<RegisteredPlayer> players = WebMain.registeredPlayers(false, slots, -1, seat -> null, guis);
        assertEquals(players.stream().map(p -> p.getPlayer().getName()).toList(), List.of("You", "AI 1", "AI 2"));
        assertEquals(guis.keySet(), Set.of(players.get(0)), "only the human seat has a GUI");
        for (RegisteredPlayer p : players) {
            for (WebMain.Slot s : slots) {
                assertFalse(p.getPlayer().getName().contains(s.deck().getName()), p.getPlayer().getName());
            }
        }
    }

    /**
     * Issue #68: Match.startGame reveals every AI deck's "AI can't play these cards well" list to each player when
     * {@code warnAboutAICards()} holds (the GameRules default); a web match turns it off.
     */
    @Test
    public void aWebMatchHasNoAiCardsWarning() {
        assertTrue(new GameRules(GameType.Commander).warnAboutAICards(), "the engine default this guards against");
        for (GameType type : new GameType[] {GameType.Commander, GameType.Constructed}) {
            GameRules rules = WebMain.matchRules(type);
            assertFalse(rules.warnAboutAICards(), type.name());
            assertTrue(rules.hasAppliedVariant(type), type.name());
            assertEquals(rules.getGamesPerMatch(), 1);
        }
    }
}
