package forge.ai.ability;

import java.util.List;

import org.testng.AssertJUnit;
import org.testng.annotations.Test;

import com.google.common.collect.ImmutableMap;
import com.google.common.eventbus.Subscribe;
import com.google.common.collect.Lists;

import forge.ai.AITest;
import forge.ai.LobbyPlayerAi;
import forge.deck.Deck;
import forge.game.Game;
import forge.game.GameRules;
import forge.game.GameStage;
import forge.game.GameType;
import forge.game.Match;
import forge.game.ability.ApiType;
import forge.game.card.Card;
import forge.game.event.GameEventCardModeChosen;
import forge.game.phase.PhaseType;
import forge.game.player.Player;
import forge.game.player.PlayerView;
import forge.game.player.RegisteredPlayer;
import forge.game.spellability.SpellAbility;
import forge.game.trigger.Trigger;
import forge.game.zone.ZoneType;

/**
 * "Any opponent may ..." GenericChoice (Defined$ Opponent) in multiplayer, issue #86:
 * once one opponent makes the choice that consumes the shared object, the rest are not asked,
 * and the SinProdder AI logic survives an emptied imprint.
 */
public class ChooseGenericAnyOpponentTest extends AITest {

    private static final String TOP_CARD = "Grizzly Bears"; // mana value 2

    /** Records every GenericChoice pick of Sin Prodder: who chose, in order. */
    public static final class ChoiceRecorder {
        final List<PlayerView> choosers = Lists.newArrayList();
        final List<String> modes = Lists.newArrayList();

        @Subscribe
        public void receive(GameEventCardModeChosen ev) {
            if ("Sin Prodder".equals(ev.cardName())) {
                choosers.add(ev.player());
                modes.add(ev.mode());
            }
        }
    }

    private ChoiceRecorder record(Game game) {
        ChoiceRecorder r = new ChoiceRecorder();
        game.subscribeToEvents(r);
        return r;
    }

    private Game initFourPlayerGame() {
        initAndCreateGame(); // loads the Localizer before the real game is built
        List<RegisteredPlayer> players = Lists.newArrayList();
        for (int i = 0; i < 4; i++) {
            players.add(new RegisteredPlayer(new Deck()).setPlayer(new LobbyPlayerAi("p" + i, null)));
        }
        GameRules rules = new GameRules(GameType.Constructed);
        Game game = new Game(players, rules, new Match(rules, players, "Test"));
        game.setAge(GameStage.Play);
        return game;
    }

    /** Sin Prodder on p's battlefield, Grizzly Bears on top of p's library; plays p's upkeep to the draw step. */
    private Card runProdderUpkeep(Game game, Player p) {
        addCard("Sin Prodder", p);
        Card top = addCardToZone(TOP_CARD, p, ZoneType.Library);
        for (Player pl : game.getPlayers()) {
            fillLibrary(pl, 5);
        }
        AssertJUnit.assertEquals(top, p.getCardsIn(ZoneType.Library).get(0));
        game.getPhaseHandler().devModeSet(PhaseType.UNTAP, p);
        playUntilPhase(game, PhaseType.UPKEEP);
        playUntilPhase(game, PhaseType.DRAW);
        AssertJUnit.assertFalse("game must not be over", game.isGameOver());
        AssertJUnit.assertTrue("stack resolved", game.getStack().isEmpty());
        return top;
    }

    @Test
    public void firstOpponentMillsAndTakesDamageOthersAreNotAsked() {
        Game game = initFourPlayerGame();
        Player p = game.getPlayers().get(0);
        List<Player> opps = Lists.newArrayList(p.getOpponents());
        AssertJUnit.assertEquals(3, opps.size());
        // SinProdder AI mills when life - mv > 15
        for (Player o : opps) {
            o.setLife(20, null);
        }

        ChoiceRecorder rec = record(game);
        Card top = runProdderUpkeep(game, p);

        AssertJUnit.assertEquals("only the first opponent is asked", Lists.newArrayList(opps.get(0).getView()), rec.choosers);
        AssertJUnit.assertEquals(ZoneType.Graveyard, game.getCardState(top).getZone().getZoneType());
        AssertJUnit.assertEquals("first opponent took the damage", 18, opps.get(0).getLife());
        AssertJUnit.assertEquals(20, opps.get(1).getLife());
        AssertJUnit.assertEquals(20, opps.get(2).getLife());
    }

    @Test
    public void firstOpponentDeclinesSecondMills() {
        Game game = initFourPlayerGame();
        Player p = game.getPlayers().get(0);
        List<Player> opps = Lists.newArrayList(p.getOpponents());
        // SinProdder AI declines when mv + 3 > life
        opps.get(0).setLife(4, null);
        opps.get(1).setLife(20, null);
        opps.get(2).setLife(20, null);

        ChoiceRecorder rec = record(game);
        Card top = runProdderUpkeep(game, p);

        AssertJUnit.assertEquals("third opponent is not asked",
                Lists.newArrayList(opps.get(0).getView(), opps.get(1).getView()), rec.choosers);
        AssertJUnit.assertEquals(ZoneType.Graveyard, game.getCardState(top).getZone().getZoneType());
        AssertJUnit.assertEquals(4, opps.get(0).getLife());
        AssertJUnit.assertEquals("second opponent took the damage", 18, opps.get(1).getLife());
        AssertJUnit.assertEquals(20, opps.get(2).getLife());
    }

    @Test
    public void nobodyMillsCardGoesToHand() {
        Game game = initFourPlayerGame();
        Player p = game.getPlayers().get(0);
        List<Player> opps = Lists.newArrayList(p.getOpponents());
        for (Player o : opps) {
            o.setLife(4, null);
        }

        ChoiceRecorder rec = record(game);
        Card top = runProdderUpkeep(game, p);

        AssertJUnit.assertEquals("every opponent is asked", 3, rec.choosers.size());
        AssertJUnit.assertEquals(Lists.newArrayList("No", "No", "No"), rec.modes);
        AssertJUnit.assertEquals(ZoneType.Hand, game.getCardState(top).getZone().getZoneType());
        for (Player o : opps) {
            AssertJUnit.assertEquals(4, o.getLife());
        }
    }

    @Test
    public void sinProdderAiDeclinesWhenImprintIsEmpty() {
        Game game = initFourPlayerGame();
        Player p = game.getPlayers().get(0);
        Player opp = p.getOpponents().get(0);
        Card prodder = addCard("Sin Prodder", p);
        AssertJUnit.assertTrue(prodder.getImprintedCards().isEmpty());

        SpellAbility prod = null;
        for (Trigger t : prodder.getTriggers()) {
            for (SpellAbility sub = t.ensureAbility(); sub != null; sub = sub.getSubAbility()) {
                if (sub.getApi() == ApiType.GenericChoice) {
                    prod = sub;
                }
            }
        }
        AssertJUnit.assertNotNull(prod);
        prod.setActivatingPlayer(p);
        List<SpellAbility> choices = Lists.newArrayList(prod.getAdditionalAbilityList("Choices"));

        SpellAbility chosen = opp.getController().chooseSingleSpellForEffect(choices, prod, "", ImmutableMap.of());

        AssertJUnit.assertEquals("No", chosen.getDescription());
    }
}
