package forge.game.ability;

import static org.testng.Assert.assertEquals;
import static org.testng.Assert.assertNotSame;
import static org.testng.Assert.assertTrue;

import java.util.ArrayList;
import java.util.List;
import java.util.function.BiPredicate;

import org.mockito.Mockito;
import org.testng.annotations.Test;

import com.google.common.collect.Lists;

import forge.ai.AITest;
import forge.ai.LobbyPlayerAi;
import forge.deck.Deck;
import forge.game.Game;
import forge.game.GameRules;
import forge.game.GameStage;
import forge.game.GameType;
import forge.game.Match;
import forge.game.card.Card;
import forge.game.phase.PhaseType;
import forge.game.player.Player;
import forge.game.player.PlayerActionConfirmMode;
import forge.game.player.PlayerController;
import forge.game.player.RegisteredPlayer;
import forge.game.spellability.SpellAbility;
import forge.game.zone.ZoneType;

/** BidLife: in turn order after the high bidder each other player may top the bid; it ends when the high bid stands. */
public class BidLifeEffectTest extends AITest {
    private static final String LOSE = "DB$ LoseLife | Defined$ Remembered | LifeAmount$ X";

    private List<Player> players;
    private final List<Player> asked = new ArrayList<>();

    /** {@code count} players p0.. in turn order. */
    private void newGame(int count) {
        initAndCreateGame();
        List<RegisteredPlayer> regs = Lists.newArrayList();
        for (int i = 0; i < count; i++) {
            regs.add(new RegisteredPlayer(new Deck()).setPlayer(new LobbyPlayerAi("p" + i, null)));
        }
        GameRules rules = new GameRules(GameType.Constructed);
        Game game = new Game(regs, rules, new Match(rules, regs, "Test"));
        game.setAge(GameStage.Play);
        game.getPhaseHandler().devModeSet(PhaseType.MAIN1, game.getPlayers().get(0));
        game.getPhaseHandler().onStackResolved();
        players = new ArrayList<>(game.getPlayers());
        asked.clear();
    }

    /** Scripts one player's bidding: answer(bid, winner) is its answer to "top the bid?"; a top adds 1. */
    private PlayerController script(Player p, BiPredicate<Integer, Player> answer) {
        PlayerController spy = Mockito.spy(p.getController());
        Mockito.doAnswer(inv -> {
            asked.add(p);
            assertNotSame(inv.getArgument(4), p, p.getName() + " was asked to top their own high bid");
            // a bid that is never answered No would loop for ever, so fail instead
            assertTrue(asked.size() < 100, "bidding does not end");
            return answer.test(inv.getArgument(3), inv.getArgument(4));
        }).when(spy).confirmBidAction(Mockito.any(), Mockito.any(PlayerActionConfirmMode.class), Mockito.any(),
                Mockito.anyInt(), Mockito.any());
        Mockito.doReturn(1).when(spy).chooseNumber(Mockito.any(), Mockito.any(), Mockito.eq(1), Mockito.eq(9));
        p.dangerouslySetController(spy);
        return spy;
    }

    /** Resolves BidLife as {@code activator}; returns the host, whose chosen number is the final bid. */
    private Card bid(Player activator, String params) {
        Card host = addCardToZone("Mountain", activator, ZoneType.Battlefield);
        host.setSVar("DBLose", LOSE);
        host.setSVar("X", "Count$ChosenNumber");
        SpellAbility sa = AbilityFactory.getAbility("DB$ BidLife | " + params + " | BidSubAbility$ DBLose", host);
        sa.setActivatingPlayer(activator);
        AbilityUtils.resolve(sa);
        return host;
    }

    @Test(timeOut = 60000)
    public void theHighBidderIsNeverAskedToTopTheirOwnBid() {
        newGame(2);
        Player me = players.get(0);
        Player opp = players.get(1);
        // both always want to top; script() fails the test if one is asked while holding the high bid
        script(me, (bid, winner) -> bid < 4);
        script(opp, (bid, winner) -> bid < 3);

        Card host = bid(me, "StartBidding$ 0");

        // opp 1, me 2, opp 3, me 4, opp declines
        assertEquals(host.getChosenNumber(), 4);
        assertEquals(me.getLife(), 20 - 4);
        assertEquals(opp.getLife(), 20);
    }

    @Test(timeOut = 60000)
    public void theBiddingEndsWhenTheStartingBidStands() {
        newGame(3);
        Player me = players.get(0);
        for (Player p : players) {
            script(p, (bid, winner) -> false);
        }

        Card host = bid(me, "StartBidding$ 2");

        assertEquals(asked, List.of(players.get(1), players.get(2)), "each other player is asked once, the activator never");
        assertEquals(host.getChosenNumber(), 2);
        assertEquals(me.getLife(), 20 - 2);
    }

    @Test(timeOut = 60000)
    public void aFourPlayerBidGoesRoundInTurnOrderFromTheActivator() {
        newGame(4);
        Player p0 = players.get(0);
        Player p1 = players.get(1);
        Player p2 = players.get(2);
        Player p3 = players.get(3);
        // p1 activates, so p2, p3, p0 are asked in that order; p3 tops once
        script(p1, (bid, winner) -> false);
        script(p2, (bid, winner) -> false);
        script(p3, (bid, winner) -> bid == 0);
        script(p0, (bid, winner) -> false);

        Card host = bid(p1, "StartBidding$ 0");

        // after p3's top the bid goes round p0, p1, p2 and stands; p3 is not asked again
        assertEquals(asked, List.of(p2, p3, p0, p1, p2));
        assertEquals(host.getChosenNumber(), 1);
        assertEquals(p3.getLife(), 20 - 1);
    }

    @Test(timeOut = 60000)
    public void otherBidderLimitsTheBiddingToTheActivatorAndThatPlayer() {
        newGame(4);
        Player me = players.get(0);
        Player target = players.get(2);
        script(me, (bid, winner) -> false);
        script(target, (bid, winner) -> bid == 1);
        script(players.get(1), (bid, winner) -> {
            throw new AssertionError("a player who is not bidding was asked");
        });
        script(players.get(3), (bid, winner) -> {
            throw new AssertionError("a player who is not bidding was asked");
        });

        Card host = addCardToZone("Mountain", me, ZoneType.Battlefield);
        host.setSVar("DBLose", LOSE);
        host.setSVar("X", "Count$ChosenNumber");
        host.addRemembered(target);
        SpellAbility sa = AbilityFactory.getAbility(
                "DB$ BidLife | OtherBidder$ Remembered | StartBidding$ 1 | BidSubAbility$ DBLose", host);
        sa.setActivatingPlayer(me);
        AbilityUtils.resolve(sa);

        assertEquals(asked, List.of(target, me), "the other bidder tops once and the activator then declines");
        assertEquals(host.getChosenNumber(), 2);
        assertEquals(target.getLife(), 20 - 2);
        assertEquals(me.getLife(), 20);
    }

    /** The sweep's scripted web seat answers Yes to every prompt: against AIs (which stop at AIBidMax) the bidding must still end. */
    @Test(timeOut = 60000)
    public void anAlwaysYesSeatAgainstAisStillEndsTheBidding() {
        newGame(4);
        Player me = players.get(0);
        PlayerController spy = script(me, (bid, winner) -> true);
        Mockito.doReturn(0).when(spy).announceRequirements(Mockito.any(), Mockito.anyInt(), Mockito.anyInt(), Mockito.any());

        Card reward = createCard("Pain's Reward", me);
        reward.setGameTimestamp(me.getGame().getNextTimestamp());
        SpellAbility sa = reward.getFirstSpellAbility();
        sa.setActivatingPlayer(me);
        AbilityUtils.resolve(sa);

        // Pain's Reward: AIBidMax 10, so the AIs stop topping at 10 and the scripted seat has the last word
        assertEquals(reward.getChosenNumber(), 11);
        assertEquals(me.getLife(), 20 - 11);
    }

    @Test(timeOut = 60000)
    public void anyStartingBidIsAnnouncedByTheActivator() {
        newGame(2);
        Player me = players.get(0);
        Player opp = players.get(1);
        PlayerController spy = Mockito.spy(me.getController());
        Mockito.doReturn(5).when(spy).announceRequirements(Mockito.any(), Mockito.anyInt(), Mockito.anyInt(), Mockito.any());
        me.dangerouslySetController(spy);
        script(opp, (bid, winner) -> false);

        Card host = bid(me, "StartBidding$ Any");

        assertEquals(asked, List.of(opp));
        assertEquals(host.getChosenNumber(), 5);
        assertEquals(me.getLife(), 20 - 5);
    }
}
