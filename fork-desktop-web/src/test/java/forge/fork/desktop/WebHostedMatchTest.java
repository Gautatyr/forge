package forge.fork.desktop;

import static org.testng.Assert.assertEquals;
import static org.testng.Assert.assertNull;
import static org.testng.Assert.assertSame;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.testng.annotations.BeforeClass;
import org.testng.annotations.Test;

import forge.ai.LobbyPlayerAi;
import forge.deck.Deck;
import forge.game.GameRules;
import forge.game.GameType;
import forge.game.player.RegisteredPlayer;
import forge.gui.interfaces.IGuiGame;
import forge.player.LobbyPlayerHuman;
import forge.fork.web.bridge.WebSpectatorGuiGame;

/** Which matches get a web seat: lobby (constructed) matches with exactly one human, when the toggle is on. */
public class WebHostedMatchTest {

    private GameRules constructed;
    private RegisteredPlayer ai1;
    private RegisteredPlayer human;
    private RegisteredPlayer ai2;
    private IGuiGame swing;

    @BeforeClass
    public void boot() {
        HeadlessEngine.boot();
        constructed = new GameRules(GameType.Constructed);
        swing = new WebSpectatorGuiGame(null, false); // stands in for the lobby's Swing CMatchUI
        ai1 = new RegisteredPlayer(new Deck()).setPlayer(new LobbyPlayerAi("ai1", null));
        human = new RegisteredPlayer(new Deck()).setPlayer(new LobbyPlayerHuman("You"));
        ai2 = new RegisteredPlayer(new Deck()).setPlayer(new LobbyPlayerAi("ai2", null));
    }

    private Map<RegisteredPlayer, IGuiGame> guis(RegisteredPlayer... humans) {
        Map<RegisteredPlayer, IGuiGame> m = new HashMap<>();
        for (RegisteredPlayer h : humans) {
            m.put(h, swing);
        }
        return m;
    }

    @Test
    public void theLobbysSingleHumanGetsTheWebSeat() {
        assertSame(WebHostedMatch.webHuman(constructed, List.of(ai1, human, ai2), guis(human), true), human);
    }

    @Test
    public void toggleOffKeepsSwing() {
        assertNull(WebHostedMatch.webHuman(constructed, List.of(ai1, human, ai2), guis(human), false));
    }

    @Test
    public void otherModesKeepSwing() {
        // quest, gauntlet, draft, puzzle… run their rewards and win/lose screens in the Swing match UI
        for (GameType t : new GameType[] {GameType.Quest, GameType.Gauntlet, GameType.Draft, GameType.Puzzle, GameType.PlanarConquest}) {
            assertNull(WebHostedMatch.webHuman(new GameRules(t), List.of(ai1, human), guis(human), true), t.name());
        }
    }

    @Test
    public void hotseatAndSpectatingKeepSwing() {
        RegisteredPlayer human2 = new RegisteredPlayer(new Deck()).setPlayer(new LobbyPlayerHuman("Friend"));
        assertNull(WebHostedMatch.webHuman(constructed, List.of(human, ai1, human2), guis(human, human2), true));
        assertNull(WebHostedMatch.webHuman(constructed, List.of(ai1, ai2), guis(), true));
        assertNull(WebHostedMatch.webHuman(constructed, List.of(ai1, ai2), null, true));
    }

    @Test
    public void theHumanIsSeatZeroWhereverTheLobbyListsIt() {
        // HostedMatch sorts human players first (stable): the game's player list starts with the human
        assertEquals(WebHostedMatch.seatIndex(List.of(ai1, ai2, human), human), 0);
        assertEquals(WebHostedMatch.seatIndex(List.of(human, ai1), human), 0);
        assertEquals(WebHostedMatch.seatIndex(List.of(ai1, human, ai2), ai2), 2);
        assertEquals(WebHostedMatch.seatIndex(List.of(ai1, human, ai2), ai1), 1);
    }
}
