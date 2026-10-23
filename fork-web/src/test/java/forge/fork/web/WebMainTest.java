package forge.fork.web;

import static org.testng.Assert.assertEquals;
import static org.testng.Assert.assertFalse;
import static org.testng.Assert.assertTrue;

import org.testng.annotations.BeforeClass;
import org.testng.annotations.Test;

import forge.fork.web.bridge.visibility.TestEngine;
import forge.game.GameRules;
import forge.game.GameType;

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
