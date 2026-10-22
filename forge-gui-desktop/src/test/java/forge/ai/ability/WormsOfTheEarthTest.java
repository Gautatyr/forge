package forge.ai.ability;

import java.util.List;

import org.testng.AssertJUnit;
import org.testng.annotations.Test;

import com.google.common.collect.Lists;
import com.google.common.eventbus.Subscribe;

import forge.ai.AITest;
import forge.ai.LobbyPlayerAi;
import forge.deck.Deck;
import forge.game.Game;
import forge.game.GameRules;
import forge.game.GameStage;
import forge.game.GameType;
import forge.game.Match;
import forge.game.card.Card;
import forge.game.event.GameEventCardModeChosen;
import forge.game.phase.PhaseType;
import forge.game.player.Player;
import forge.game.player.PlayerView;
import forge.game.player.RegisteredPlayer;
import forge.game.zone.ZoneType;

/**
 * Worms of the Earth, issue #91: "any player may sacrifice two lands or take 5 damage; if a player does, destroy it".
 * Once a player destroys it, the remaining players are not asked. 3 AI players, no lands: the AI controlling it pays
 * 5 damage at life 20, an AI at life 8 declines.
 */
public class WormsOfTheEarthTest extends AITest {

    /** Every Worms of the Earth pick: who chose, in order. */
    public static final class ChoiceRecorder {
        final List<PlayerView> choosers = Lists.newArrayList();

        @Subscribe
        public void receive(GameEventCardModeChosen ev) {
            if ("Worms of the Earth".equals(ev.cardName())) {
                choosers.add(ev.player());
            }
        }
    }

    private Game initThreePlayerGame() {
        initAndCreateGame(); // loads the Localizer before the real game is built
        List<RegisteredPlayer> players = Lists.newArrayList();
        for (int i = 0; i < 3; i++) {
            players.add(new RegisteredPlayer(new Deck()).setPlayer(new LobbyPlayerAi("p" + i, null)));
        }
        GameRules rules = new GameRules(GameType.Constructed);
        Game game = new Game(players, rules, new Match(rules, players, "Test"));
        game.setAge(GameStage.Play);
        return game;
    }

    /** Plays p0's upkeep to the draw step (choosers in turn order from p0). Returns the picks. */
    private ChoiceRecorder runWormsUpkeep(Game game) {
        Player p0 = game.getPlayers().get(0);
        for (Player pl : game.getPlayers()) {
            fillLibrary(pl, 5);
        }
        ChoiceRecorder rec = new ChoiceRecorder();
        game.subscribeToEvents(rec);
        game.getPhaseHandler().devModeSet(PhaseType.UNTAP, p0);
        playUntilPhase(game, PhaseType.UPKEEP);
        playUntilPhase(game, PhaseType.DRAW);
        AssertJUnit.assertFalse("game must not be over", game.isGameOver());
        AssertJUnit.assertTrue("stack resolved", game.getStack().isEmpty());
        return rec;
    }

    private static String lives(List<Player> ps) {
        return "lives " + ps.get(0).getLife() + "/" + ps.get(1).getLife() + "/" + ps.get(2).getLife();
    }

    /** p0 controls it and pays: p1 and p2 are not asked. */
    @Test
    public void firstPlayerDestroysItOthersAreNotAsked() {
        Game game = initThreePlayerGame();
        List<Player> ps = game.getPlayers();
        Card worms = addCard("Worms of the Earth", ps.get(0));

        ChoiceRecorder rec = runWormsUpkeep(game);

        AssertJUnit.assertEquals("only the first player is asked; " + lives(ps), Lists.newArrayList(ps.get(0).getView()), rec.choosers);
        AssertJUnit.assertEquals(ZoneType.Graveyard, game.getCardState(worms).getZone().getZoneType());
        AssertJUnit.assertEquals("first player took 5", 15, ps.get(0).getLife());
        AssertJUnit.assertEquals(20, ps.get(1).getLife());
        AssertJUnit.assertEquals(20, ps.get(2).getLife());
    }

    /** p1 controls it; in p0's upkeep p0 (life 8) declines, p1 (life 20) pays, p2 is not asked. */
    @Test
    public void firstDeclinesSecondDestroysItThirdIsNotAsked() {
        Game game = initThreePlayerGame();
        List<Player> ps = game.getPlayers();
        Card worms = addCard("Worms of the Earth", ps.get(1));
        ps.get(0).setLife(8, null);

        ChoiceRecorder rec = runWormsUpkeep(game);

        AssertJUnit.assertEquals("third player is not asked; " + lives(ps),
                Lists.newArrayList(ps.get(0).getView(), ps.get(1).getView()), rec.choosers);
        AssertJUnit.assertEquals(ZoneType.Graveyard, game.getCardState(worms).getZone().getZoneType());
        AssertJUnit.assertEquals(8, ps.get(0).getLife());
        AssertJUnit.assertEquals("second player took 5", 15, ps.get(1).getLife());
        AssertJUnit.assertEquals(20, ps.get(2).getLife());
    }

    @Test
    public void nobodyPaysEveryoneIsAskedAndItStays() {
        Game game = initThreePlayerGame();
        List<Player> ps = game.getPlayers();
        Card worms = addCard("Worms of the Earth", ps.get(0));
        for (Player p : ps) {
            p.setLife(8, null);
        }

        ChoiceRecorder rec = runWormsUpkeep(game);

        AssertJUnit.assertEquals("every player is asked", 3, rec.choosers.size());
        AssertJUnit.assertEquals(ZoneType.Battlefield, game.getCardState(worms).getZone().getZoneType());
        for (Player p : ps) {
            AssertJUnit.assertEquals(8, p.getLife());
        }
    }
}
