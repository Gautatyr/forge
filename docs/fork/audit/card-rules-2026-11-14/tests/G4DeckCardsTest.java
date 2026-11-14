package forge.ai;

import java.util.List;

import org.testng.AssertJUnit;
import org.testng.annotations.Test;

import com.google.common.collect.Lists;

import forge.deck.Deck;
import forge.game.Game;
import forge.game.GameObject;
import forge.game.GameRules;
import forge.game.GameStage;
import forge.game.GameType;
import forge.game.Match;
import forge.game.card.Card;
import forge.game.card.CounterEnumType;
import forge.game.card.CounterType;
import forge.game.phase.PhaseType;
import forge.game.player.Player;
import forge.game.player.RegisteredPlayer;
import forge.game.spellability.SpellAbility;
import forge.game.zone.ZoneType;

/**
 * Card-pool sweep, group g4 (Aminatou, Guff, Tam, Vnwxt decks). Each test asserts the Oracle outcome.
 */
public class G4DeckCardsTest extends AITest {

    private static final CounterType LOYALTY = CounterEnumType.LOYALTY;

    protected Game nPlayerGame(int n) {
        initAndCreateGame();
        List<RegisteredPlayer> players = Lists.newArrayList();
        Deck d1 = new Deck();
        for (int i = 0; i < n; i++) {
            players.add(new RegisteredPlayer(d1).setPlayer(new LobbyPlayerAi("p" + i, null)));
        }
        GameRules rules = new GameRules(GameType.Constructed);
        Match match = new Match(rules, players, "Test");
        Game game = new Game(players, rules, match);
        game.setAge(GameStage.Play);
        game.getPhaseHandler().devModeSet(PhaseType.MAIN1, game.getPlayers().get(0));
        game.getPhaseHandler().onStackResolved();
        return game;
    }

    private Card pw(String name, Player p, int loyalty) {
        Card c = addCard(name, p);
        if (loyalty > 0) {
            c.addCounterInternal(LOYALTY, loyalty, p, false, null, null);
        }
        return c;
    }

    private SpellAbility ability(Card c, String prefix) {
        for (SpellAbility sa : c.getSpellAbilities()) {
            if (sa.getDescription().startsWith(prefix)) {
                return sa;
            }
        }
        for (SpellAbility sa : c.getSpellAbilities()) {
            if (sa.getDescription().contains(prefix)) {
                return sa;
            }
        }
        AssertJUnit.fail("no ability starting with '" + prefix + "' on " + c + ": " + c.getSpellAbilities());
        return null;
    }

    private void activate(Game game, Player p, Card c, String prefix, GameObject... targets) {
        SpellAbility sa = ability(c, prefix);
        sa.setActivatingPlayer(p);
        for (GameObject t : targets) {
            sa.getTargets().add(t);
        }
        AssertJUnit.assertTrue("could not activate " + prefix + " of " + c, ComputerUtil.playStack(sa, p, game));
        resolveAll(game);
    }

    private void cast(Game game, Player p, Card c, GameObject... targets) {
        SpellAbility sa = c.getFirstSpellAbility();
        sa.setActivatingPlayer(p);
        for (GameObject t : targets) {
            sa.getTargets().add(t);
        }
        AssertJUnit.assertTrue("could not cast " + c, ComputerUtil.playStack(sa, p, game));
        resolveAll(game);
    }

    private void resolveAll(Game game) {
        for (int i = 0; i < 20; i++) {
            playUntilStackClear(game);
            game.getAction().checkStateEffects(true);
            game.getStack().addAllTriggeredAbilitiesToStack();
            if (game.getStack().isEmpty()) {
                return;
            }
        }
    }

    private String log(Game game) {
        StringBuilder sb = new StringBuilder();
        java.util.List<forge.game.GameLogEntry> l = new java.util.ArrayList<>(game.getGameLog().getLogEntries(null));
        java.util.Collections.reverse(l);
        for (forge.game.GameLogEntry e : l) {
            sb.append("  LOG ").append(e.message()).append("\n");
        }
        return sb.toString();
    }

    private int loyalty(Card c) {
        return c.getCounters(LOYALTY);
    }

    // ---------------------------------------------------------------- Narset Transcendent

    /** Control: the [-2] works when the instant is cast the same turn. */
    @Test
    public void narsetTranscendentReboundSameTurn() {
        Game game = initAndCreateGame();
        Player p = game.getPlayers().get(1);
        fillLibrary(p, 10);
        Card narset = pw("Narset Transcendent", p, 6);
        addCard("Island", p);
        Card opt = addCardToZone("Opt", p, ZoneType.Hand);
        game.getAction().checkStateEffects(true);
        activate(game, p, narset, "-2");
        AssertJUnit.assertEquals(4, loyalty(narset));
        cast(game, p, opt);
        AssertJUnit.assertEquals("Opt should have rebound and be exiled", ZoneType.Exile, game.getCardState(opt).getZone().getZoneType());
    }

    /** Oracle: "When you cast your next instant or sorcery spell from your hand THIS TURN, it gains rebound." */
    @Test
    public void narsetTranscendentReboundExpiresAtEndOfTurn() {
        Game game = initAndCreateGame();
        Player p = game.getPlayers().get(1);
        for (Player o : game.getPlayers()) {
            fillLibrary(o, 10);
        }
        Card narset = pw("Narset Transcendent", p, 6);
        addCard("Island", p);
        game.getAction().checkStateEffects(true);
        activate(game, p, narset, "-2");
        // no instant/sorcery this turn; go to the next player's turn
        playUntilNextTurn(game);
        AssertJUnit.assertNotSame(p, game.getPhaseHandler().getPlayerTurn());
        playUntilPhase(game, PhaseType.MAIN1);
        Card opt = addCardToZone("Opt", p, ZoneType.Hand);
        cast(game, p, opt);
        AssertJUnit.assertEquals("Opt was cast on a later turn: it must not gain rebound",
                ZoneType.Graveyard, game.getCardState(opt).getZone().getZoneType());
    }

    // ---------------------------------------------------------------- Commodore Guff

    @Test
    public void commodoreGuffMinusThreeFourPlayers() {
        Game game = nPlayerGame(4);
        Player p = game.getPlayers().get(0);
        fillLibrary(p, 10);
        Card guff = pw("Commodore Guff", p, 5);
        pw("Teferi, Hero of Dominaria", p, 4);
        pw("Jace, the Mind Sculptor", p, 3);
        game.getAction().checkStateEffects(true);
        int hand = p.getCardsIn(ZoneType.Hand).size();
        activate(game, p, guff, "-3");
        AssertJUnit.assertEquals(2, loyalty(guff));
        AssertJUnit.assertEquals("draw X = 3 planeswalkers", hand + 3, p.getCardsIn(ZoneType.Hand).size());
        for (Player o : p.getOpponents()) {
            AssertJUnit.assertEquals("each opponent takes 3", 17, o.getLife());
        }
        AssertJUnit.assertEquals(20, p.getLife());
    }

    @Test
    public void commodoreGuffEndStepLoyalty() {
        Game game = initAndCreateGame();
        Player p = game.getPlayers().get(1);
        fillLibrary(p, 10);
        pw("Commodore Guff", p, 5);
        Card teferi = pw("Teferi, Hero of Dominaria", p, 4);
        game.getAction().checkStateEffects(true);
        // use Teferi's one activation ourselves so the AI cannot touch his loyalty afterwards
        activate(game, p, teferi, "+1");
        AssertJUnit.assertEquals(5, loyalty(teferi));
        playUntilPhase(game, PhaseType.CLEANUP);
        AssertJUnit.assertEquals("Guff end step: +1 on another planeswalker", 6, loyalty(teferi));
    }

    // ---------------------------------------------------------------- Tam, the Possibility

    @Test
    public void tamProliferatesOncePerPlaneswalkerType() {
        Game game = initAndCreateGame();
        Player p = game.getPlayers().get(1);
        Card tam = addCard("Tam, the Possibility", p);
        tam.setSickness(false);
        for (String land : new String[] {"Plains", "Island", "Swamp", "Mountain", "Forest"}) {
            addCard(land, p);
        }
        Card jtms = pw("Jace, the Mind Sculptor", p, 3);
        Card theorist = pw("The Theorist, Jace Beleren", p, 3);
        Card teferi = pw("Teferi, Hero of Dominaria", p, 4);
        game.getAction().checkStateEffects(true);
        activate(game, p, tam, "Proliferate");
        // two types among them (Jace, Teferi): proliferate twice
        AssertJUnit.assertEquals(5, loyalty(jtms));
        AssertJUnit.assertEquals(5, loyalty(theorist));
        AssertJUnit.assertEquals(6, loyalty(teferi));
    }

    @Test
    public void tamReducesPlaneswalkerSpellCost() {
        Game game = initAndCreateGame();
        Player p = game.getPlayers().get(1);
        addCard("Tam, the Possibility", p);
        addCards("Island", 3, p);
        fillLibrary(p, 5);
        Card jace = addCardToZone("Jace, the Mind Sculptor", p, ZoneType.Hand);
        game.getAction().checkStateEffects(true);
        cast(game, p, jace);
        AssertJUnit.assertEquals("JTMS {2}{U}{U} castable with 3 Islands under Tam", ZoneType.Battlefield, game.getCardState(jace).getZone().getZoneType());
    }

    // ---------------------------------------------------------------- Aminatou

    @Test
    public void aminatouUltimateRotatesNonlandPermanents() {
        Game game = nPlayerGame(4);
        List<Player> ps = game.getPlayers();
        Player p = ps.get(0);
        Card aminatou = pw("Aminatou, the Fateshifter", p, 7);
        Card[] stuff = new Card[4];
        Card[] lands = new Card[4];
        for (int i = 0; i < 4; i++) {
            stuff[i] = addCard("Grizzly Bears", ps.get(i));
            lands[i] = addCard("Plains", ps.get(i));
        }
        game.getAction().checkStateEffects(true);
        activate(game, p, aminatou, "-6");
        Player newOwnerOf0 = stuff[0].getController();
        AssertJUnit.assertNotSame(p, newOwnerOf0);
        int shift = ps.indexOf(newOwnerOf0); // p0's stuff went to player at index shift (1 or 3)
        for (int i = 0; i < 4; i++) {
            AssertJUnit.assertEquals("land never moves", ps.get(i), lands[i].getController());
            AssertJUnit.assertEquals("bear " + i, ps.get((i + shift) % 4), stuff[i].getController());
        }
    }

    @Test
    public void aminatouMinusOneReturnsOwnedPermanentUnderYourControl() {
        Game game = nPlayerGame(4);
        List<Player> ps = game.getPlayers();
        Player p = ps.get(0);
        fillLibrary(p, 5);
        addCards("Plains", 2, p);
        Card purse = addCard("Bucknard's Everfull Purse", p);
        activate(game, p, purse, "Roll a d4");
        Player right = purse.getController();
        AssertJUnit.assertNotSame(p, right);
        // Oracle: "The player to your right gains control" ; turn order passes to the left, so right = previous player
        AssertJUnit.assertEquals(ps.get(3), right);
        Card aminatou = pw("Aminatou, the Fateshifter", p, 3);
        game.getAction().checkStateEffects(true);
        activate(game, p, aminatou, "-1", purse);
        Card newPurse = game.getCardState(purse);
        AssertJUnit.assertEquals(ZoneType.Battlefield, newPurse.getZone().getZoneType());
        AssertJUnit.assertEquals(p, newPurse.getController());
    }

    // ---------------------------------------------------------------- Vnwxt

    @Test
    public void vnwxtMaxSpeedDoublesDraws() {
        Game game = initAndCreateGame();
        Player p = game.getPlayers().get(1);
        fillLibrary(p, 20);
        addCard("Vnwxt, Verbose Host", p);
        p.setSpeed(4);
        addCards("Island", 3, p);
        Card div = addCardToZone("Divination", p, ZoneType.Hand);
        game.getAction().checkStateEffects(true);
        int hand = p.getCardsIn(ZoneType.Hand).size() - 1;
        cast(game, p, div);
        AssertJUnit.assertEquals(hand + 4, p.getCardsIn(ZoneType.Hand).size());
    }

    @Test
    public void vnwxtAndAgelessInsightCompound() {
        Game game = initAndCreateGame();
        Player p = game.getPlayers().get(1);
        fillLibrary(p, 30);
        addCard("Vnwxt, Verbose Host", p);
        addCard("Teferi's Ageless Insight", p);
        p.setSpeed(4);
        addCards("Island", 3, p);
        Card div = addCardToZone("Divination", p, ZoneType.Hand);
        game.getAction().checkStateEffects(true);
        int hand = p.getCardsIn(ZoneType.Hand).size() - 1;
        cast(game, p, div);
        // each of the 2 draws -> 2 (one replacement) -> each of those -> 2 (the other replacement): 8
        AssertJUnit.assertEquals(hand + 8, p.getCardsIn(ZoneType.Hand).size());
    }

    // ---------------------------------------------------------------- counter replacement + loyalty costs

    @Test
    public void doublingSeasonDoublesEnteringLoyaltyButNotLoyaltyCost() {
        Game game = initAndCreateGame();
        Player p = game.getPlayers().get(1);
        fillLibrary(p, 5);
        addCard("Doubling Season", p);
        addCards("Island", 4, p);
        Card jace = addCardToZone("Jace, the Mind Sculptor", p, ZoneType.Hand);
        game.getAction().checkStateEffects(true);
        cast(game, p, jace);
        jace = game.getCardState(jace);
        AssertJUnit.assertEquals("enters with 3*2", 6, loyalty(jace));
        activate(game, p, jace, "+2", game.getPlayers().get(0));
        AssertJUnit.assertEquals("a loyalty cost is not an effect: +2 only", 8, loyalty(jace));
    }

    @Test
    public void laezelAddsOneToEnteringLoyaltyAndPlusCost() {
        Game game = initAndCreateGame();
        Player p = game.getPlayers().get(1);
        fillLibrary(p, 5);
        addCard("Lae'zel, Vlaakith's Champion", p);
        addCards("Island", 4, p);
        Card jace = addCardToZone("Jace, the Mind Sculptor", p, ZoneType.Hand);
        game.getAction().checkStateEffects(true);
        cast(game, p, jace);
        jace = game.getCardState(jace);
        AssertJUnit.assertEquals("enters with 3+1", 4, loyalty(jace));
        activate(game, p, jace, "+2", game.getPlayers().get(0));
        AssertJUnit.assertEquals("+2 cost puts 2+1", 7, loyalty(jace));
    }

    @Test
    public void carthAddsPlusOneToLoyaltyCosts() {
        Game game = initAndCreateGame();
        Player p = game.getPlayers().get(1);
        Player o = game.getPlayers().get(0);
        fillLibrary(p, 5);
        addCard("Carth the Lion", p);
        Card teferi = pw("Teferi, Hero of Dominaria", p, 4);
        Card jace = pw("Jace, the Mind Sculptor", p, 3);
        Card bear = addCard("Grizzly Bears", o);
        game.getAction().checkStateEffects(true);
        activate(game, p, teferi, "+1");
        AssertJUnit.assertEquals("+1 and additional +1", 6, loyalty(teferi));
        activate(game, p, jace, "-1", bear);
        AssertJUnit.assertEquals("-1 and additional +1", 3, loyalty(jace));
        AssertJUnit.assertEquals(ZoneType.Hand, game.getCardState(bear).getZone().getZoneType());
    }

    @Test
    public void oathOfTeferiAllowsTwoActivations() {
        Game game = initAndCreateGame();
        Player p = game.getPlayers().get(1);
        fillLibrary(p, 5);
        addCard("Oath of Teferi", p);
        Card teferi = pw("Teferi, Hero of Dominaria", p, 4);
        game.getAction().checkStateEffects(true);
        activate(game, p, teferi, "+1");
        activate(game, p, teferi, "+1");
        AssertJUnit.assertEquals(6, loyalty(teferi));
        SpellAbility third = ability(teferi, "+1");
        third.setActivatingPlayer(p);
        AssertJUnit.assertFalse(third.canPlay());
    }

    @Test
    public void elspethStormSlayerAndDoublingSeasonQuadrupleTokens() {
        Game game = initAndCreateGame();
        Player p = game.getPlayers().get(1);
        addCard("Doubling Season", p);
        Card elspeth = pw("Elspeth, Storm Slayer", p, 5);
        game.getAction().checkStateEffects(true);
        activate(game, p, elspeth, "+1");
        AssertJUnit.assertEquals(4, countCardsWithName(game, "Soldier Token"));
    }

    @Test
    public void sanctumLurkerKeepsZeroLoyaltyWalkerAndGrantsPlusTwo() {
        Game game = nPlayerGame(3);
        Player p = game.getPlayers().get(0);
        addCard("Sanctum Lurker", p);
        Card teferi = pw("Teferi, Hero of Dominaria", p, 0);
        game.getAction().checkStateEffects(true);
        AssertJUnit.assertEquals(ZoneType.Battlefield, teferi.getZone().getZoneType());
        activate(game, p, teferi, "+2");
        AssertJUnit.assertEquals(2, loyalty(teferi));
        AssertJUnit.assertEquals(21, p.getLife());
        for (Player o : p.getOpponents()) {
            AssertJUnit.assertEquals(19, o.getLife());
        }
    }

    @Test
    public void ichormoonGauntletGrantsZeroProliferate() {
        Game game = initAndCreateGame();
        Player p = game.getPlayers().get(1);
        addCard("Ichormoon Gauntlet", p);
        Card teferi = pw("Teferi, Hero of Dominaria", p, 4);
        Card jace = pw("Jace, the Mind Sculptor", p, 3);
        game.getAction().checkStateEffects(true);
        activate(game, p, teferi, "0: Proliferate");
        AssertJUnit.assertEquals(5, loyalty(teferi));
        AssertJUnit.assertEquals(4, loyalty(jace));
    }

    @Test
    public void garrukVeiledButcherMinusThreeCountsOpponents() {
        Game game = nPlayerGame(4);
        List<Player> ps = game.getPlayers();
        Player p = ps.get(0);
        fillLibrary(p, 10);
        Card garruk = pw("Garruk, Veiled Butcher", p, 5);
        // p1: two nonland cards -> no draw
        addCardToZone("Grizzly Bears", ps.get(1), ZoneType.Hand);
        addCardToZone("Grizzly Bears", ps.get(1), ZoneType.Hand);
        // p2: land + nonland -> draw
        addCardToZone("Forest", ps.get(2), ZoneType.Hand);
        addCardToZone("Grizzly Bears", ps.get(2), ZoneType.Hand);
        // p3: empty hand -> draw
        game.getAction().checkStateEffects(true);
        int hand = p.getCardsIn(ZoneType.Hand).size();
        activate(game, p, garruk, "-3");
        System.out.println("GARRUK loyalty=" + loyalty(garruk) + "\n" + gameStateToString(game) + log(game));
        for (Player x : ps) { System.out.println("GARRUK " + x + " hand=" + x.getCardsIn(ZoneType.Hand) + " gy=" + x.getCardsIn(ZoneType.Graveyard)); }
        AssertJUnit.assertEquals(0, ps.get(1).getCardsIn(ZoneType.Hand).size());
        AssertJUnit.assertEquals(0, ps.get(2).getCardsIn(ZoneType.Hand).size());
        AssertJUnit.assertEquals("two opponents did not discard two nonland cards", hand + 2, p.getCardsIn(ZoneType.Hand).size());
    }

    @Test
    public void teferiHeroMinusThreeThirdFromTop() {
        Game game = initAndCreateGame();
        Player p = game.getPlayers().get(1);
        Player o = game.getPlayers().get(0);
        fillLibrary(o, 5);
        Card teferi = pw("Teferi, Hero of Dominaria", p, 4);
        Card bear = addCard("Grizzly Bears", o);
        game.getAction().checkStateEffects(true);
        activate(game, p, teferi, "-3", bear);
        Card moved = game.getCardState(bear);
        AssertJUnit.assertEquals(ZoneType.Library, moved.getZone().getZoneType());
        AssertJUnit.assertEquals(2, o.getCardsIn(ZoneType.Library).indexOf(moved));
    }

    @Test
    public void sparkDoubleCopiesPlaneswalkerWithExtraLoyalty() {
        Game game = initAndCreateGame();
        Player p = game.getPlayers().get(1);
        pw("Teferi, Hero of Dominaria", p, 4);
        addCards("Island", 4, p);
        Card spark = addCardToZone("Spark Double", p, ZoneType.Hand);
        game.getAction().checkStateEffects(true);
        cast(game, p, spark);
        game.getAction().checkStateEffects(true);
        Card copy = game.getCardState(spark);
        AssertJUnit.assertEquals("Spark Double should have entered as a copy: " + gameStateToString(game),
                "Teferi, Hero of Dominaria", copy.getName());
        AssertJUnit.assertEquals(ZoneType.Battlefield, copy.getZone().getZoneType());
        AssertJUnit.assertFalse(copy.getType().isLegendary());
        AssertJUnit.assertEquals("4 + 1", 5, loyalty(copy));
        AssertJUnit.assertEquals(2, countCardsWithName(game, "Teferi, Hero of Dominaria"));
    }

    // ================================================================ batch 2

    private Game commanderGame(String... commanders) {
        initAndCreateGame();
        List<RegisteredPlayer> players = Lists.newArrayList();
        for (int i = 0; i < commanders.length; i++) {
            Deck deck = new Deck();
            deck.getOrCreate(forge.deck.DeckSection.Commander).add(commanders[i], 1);
            players.add(RegisteredPlayer.forCommander(deck).setPlayer(new LobbyPlayerAi("p" + i, null)));
        }
        GameRules rules = new GameRules(GameType.Commander);
        Game game = new Game(players, rules, new Match(rules, players, "Test"));
        for (Player pl : game.getPlayers()) {
            pl.initVariantsZones(pl.getRegisteredPlayer());
        }
        game.setAge(GameStage.Play);
        game.getPhaseHandler().devModeSet(PhaseType.MAIN1, game.getPlayers().get(0));
        game.getPhaseHandler().onStackResolved();
        return game;
    }

    @Test
    public void semestersEndReturnsWalkerWithExtraLoyaltyAndCreatureWithCounter() {
        Game game = initAndCreateGame();
        Player p = game.getPlayers().get(1);
        fillLibrary(p, 5);
        Card teferi = pw("Teferi, Hero of Dominaria", p, 4);
        activate(game, p, teferi, "+1"); // 5, and the AI cannot use him again this turn
        Card bear = addCard("Grizzly Bears", p);
        addCards("Plains", 4, p);
        Card se = addCardToZone("Semester's End", p, ZoneType.Hand);
        game.getAction().checkStateEffects(true);
        cast(game, p, se, teferi, bear);
        AssertJUnit.assertEquals(ZoneType.Exile, game.getCardState(teferi).getZone().getZoneType());
        playUntilPhase(game, PhaseType.CLEANUP);
        Card t2 = game.getCardState(teferi);
        Card b2 = game.getCardState(bear);
        AssertJUnit.assertEquals(ZoneType.Battlefield, t2.getZone().getZoneType());
        AssertJUnit.assertEquals("printed 4 + 1", 5, loyalty(t2));
        AssertJUnit.assertEquals(ZoneType.Battlefield, b2.getZone().getZoneType());
        AssertJUnit.assertEquals(1, b2.getCounters(CounterEnumType.P1P1));
    }

    @Test
    public void allWillBeOneTriggersOnLoyaltyCost() {
        Game game = initAndCreateGame();
        Player p = game.getPlayers().get(1);
        Player o = game.getPlayers().get(0);
        fillLibrary(p, 5);
        addCard("All Will Be One", p);
        Card teferi = pw("Teferi, Hero of Dominaria", p, 4);
        game.getAction().checkStateEffects(true);
        activate(game, p, teferi, "+1");
        AssertJUnit.assertEquals("1 loyalty counter put as a cost -> 1 damage", 19, o.getLife());
    }

    @Test
    public void ajaniUnrelentingMakesCadetOnLoyaltyActivation() {
        Game game = initAndCreateGame();
        Player p = game.getPlayers().get(1);
        fillLibrary(p, 5);
        addCard("Ajani Unrelenting", p).addCounterInternal(CounterEnumType.LOYALTY, 5, p, false, null, null);
        Card teferi = pw("Teferi, Hero of Dominaria", p, 4);
        game.getAction().checkStateEffects(true);
        activate(game, p, teferi, "+1");
        AssertJUnit.assertTrue(countCardsWithName(game, "Cadet") >= 1);
    }

    @Test
    public void teveshSzatUltimateTakesAllCommanders() {
        Game game = commanderGame("Isamaru, Hound of Konda", "Ruhan of the Fomori", "Kozilek, Butcher of Truth");
        List<Player> ps = game.getPlayers();
        Player p = ps.get(0);
        // p1's commander is on the battlefield under p1, the others are in the command zone
        Card ruhan = ps.get(1).getCommanders().get(0);
        game.getAction().moveToPlay(ruhan, ps.get(1), null, null);
        Card tevesh = pw("Tevesh Szat, Doom of Fools", p, 11);
        game.getAction().checkStateEffects(true);
        activate(game, p, tevesh, "-10");
        game.getAction().checkStateEffects(true);
        for (Player x : ps) {
            Card cmd = game.getCardState(x.getCommanders().get(0));
            AssertJUnit.assertEquals(cmd + " zone", ZoneType.Battlefield, cmd.getZone().getZoneType());
            AssertJUnit.assertEquals(cmd + " controller", p, cmd.getController());
        }
    }

    @Test
    public void midnightClockTwelfthCounter() {
        Game game = initAndCreateGame();
        Player p = game.getPlayers().get(1);
        fillLibrary(p, 10);
        Card clock = addCard("Midnight Clock", p);
        clock.addCounterInternal(CounterEnumType.HOUR, 11, p, false, null, null);
        addCards("Island", 3, p);
        addCardToZone("Grizzly Bears", p, ZoneType.Graveyard);
        addCardToZone("Grizzly Bears", p, ZoneType.Hand);
        game.getAction().checkStateEffects(true);
        activate(game, p, clock, "{2}{U}");
        AssertJUnit.assertEquals(ZoneType.Exile, game.getCardState(clock).getZone().getZoneType());
        AssertJUnit.assertEquals(7, p.getCardsIn(ZoneType.Hand).size());
        AssertJUnit.assertEquals(0, p.getCardsIn(ZoneType.Graveyard).size());
        AssertJUnit.assertEquals(5, p.getCardsIn(ZoneType.Library).size());
    }

    @Test
    public void agelessInsightDoesNotReplaceFirstDrawStepDraw() {
        Game game = initAndCreateGame();
        Player p = game.getPlayers().get(1);
        for (Player x : game.getPlayers()) {
            fillLibrary(x, 10);
        }
        addCard("Teferi's Ageless Insight", p);
        game.getAction().checkStateEffects(true);
        playUntilNextTurn(game);
        playUntilNextTurn(game);
        AssertJUnit.assertEquals(p, game.getPhaseHandler().getPlayerTurn());
        playUntilPhase(game, PhaseType.MAIN1);
        AssertJUnit.assertEquals(1, p.getCardsIn(ZoneType.Hand).size());
    }

    @Test
    public void outOfTimePhasesOutAndCounts() {
        Game game = initAndCreateGame();
        Player p = game.getPlayers().get(1);
        Player o = game.getPlayers().get(0);
        Card b1 = addCard("Grizzly Bears", p);
        Card b2 = addCard("Grizzly Bears", o);
        Card b3 = addCard("Grizzly Bears", o);
        b2.tap(true, null, null);
        addCards("Plains", 3, p);
        Card oot = addCardToZone("Out of Time", p, ZoneType.Hand);
        game.getAction().checkStateEffects(true);
        cast(game, p, oot);
        oot = game.getCardState(oot);
        AssertJUnit.assertEquals(3, oot.getCounters(CounterEnumType.TIME));
        AssertJUnit.assertTrue(b1.isPhasedOut() && b2.isPhasedOut() && b3.isPhasedOut());
        AssertJUnit.assertFalse("untapped first", b2.isTapped());
        game.getAction().moveToGraveyard(oot, null, null);
        game.getAction().checkStateEffects(true);
        AssertJUnit.assertFalse(b1.isPhasedOut() || b2.isPhasedOut() || b3.isPhasedOut());
    }

    @Test
    public void dakkonEntersWithLoyaltyEqualToLands() {
        Game game = initAndCreateGame();
        Player p = game.getPlayers().get(1);
        addCard("Plains", p);
        addCard("Island", p);
        addCard("Swamp", p);
        addCard("Forest", p);
        Card dakkon = addCardToZone("Dakkon, Shadow Slayer", p, ZoneType.Hand);
        game.getAction().checkStateEffects(true);
        cast(game, p, dakkon);
        AssertJUnit.assertEquals(4, loyalty(game.getCardState(dakkon)));
    }

    @Test
    public void teferiTemporalPilgrimGainsLoyaltyOnDraw() {
        Game game = initAndCreateGame();
        Player p = game.getPlayers().get(1);
        fillLibrary(p, 5);
        Card teferi = pw("Teferi, Temporal Pilgrim", p, 4);
        game.getAction().checkStateEffects(true);
        activate(game, p, teferi, "0: Draw");
        AssertJUnit.assertEquals(5, loyalty(teferi));
    }

    @Test
    public void willKenrithMinusTwoReducesSorceryCost() {
        Game game = initAndCreateGame();
        Player p = game.getPlayers().get(1);
        fillLibrary(p, 10);
        Card will = pw("Will Kenrith", p, 4);
        addCard("Island", p);
        game.getAction().checkStateEffects(true);
        activate(game, p, will, "-2", p);
        AssertJUnit.assertEquals(2, p.getCardsIn(ZoneType.Hand).size());
        Card div = addCardToZone("Divination", p, ZoneType.Hand);
        cast(game, p, div);
        AssertJUnit.assertEquals("Divination {2}{U} for {U}", ZoneType.Graveyard, game.getCardState(div).getZone().getZoneType());
        AssertJUnit.assertEquals(4, p.getCardsIn(ZoneType.Hand).size());
    }

    @Test
    public void minscAndBooSacrificeHamsterDrawsX() {
        Game game = initAndCreateGame();
        Player p = game.getPlayers().get(1);
        Player o = game.getPlayers().get(0);
        fillLibrary(p, 10);
        Card minsc = pw("Minsc & Boo, Timeless Heroes", p, 3);
        Card boo = addToken("boo", p);
        boo.addCounterInternal(CounterEnumType.P1P1, 3, p, false, null, null);
        game.getAction().checkStateEffects(true);
        activate(game, p, minsc, "-2");
        AssertJUnit.assertFalse(boo.isInPlay());
        AssertJUnit.assertEquals("draw X = 4", 4, p.getCardsIn(ZoneType.Hand).size());
        AssertJUnit.assertEquals("4 damage", 16, o.getLife());
    }

    @Test
    public void enduringCuriosityReturnsAsNonCreatureEnchantment() {
        Game game = initAndCreateGame();
        Player p = game.getPlayers().get(1);
        Card ec = addCard("Enduring Curiosity", p);
        addCards("Swamp", 3, p);
        Card murder = addCardToZone("Murder", p, ZoneType.Hand);
        game.getAction().checkStateEffects(true);
        cast(game, p, murder, ec);
        Card back = game.getCardState(ec);
        AssertJUnit.assertEquals(ZoneType.Battlefield, back.getZone().getZoneType());
        AssertJUnit.assertFalse(back.isCreature());
        AssertJUnit.assertTrue(back.isEnchantment());
    }

    @Test
    public void chainVeilAllowsSecondActivation() {
        Game game = initAndCreateGame();
        Player p = game.getPlayers().get(1);
        fillLibrary(p, 5);
        Card veil = addCard("The Chain Veil", p);
        addCards("Wastes", 4, p);
        Card teferi = pw("Teferi, Hero of Dominaria", p, 4);
        game.getAction().checkStateEffects(true);
        activate(game, p, teferi, "+1");
        activate(game, p, veil, "{4}, {T}");
        activate(game, p, teferi, "+1");
        AssertJUnit.assertEquals(6, loyalty(teferi));
    }

    @Test
    public void windfallDrawsGreatestDiscarded() {
        Game game = initAndCreateGame();
        Player p = game.getPlayers().get(1);
        Player o = game.getPlayers().get(0);
        fillLibrary(p, 10);
        fillLibrary(o, 10);
        for (int i = 0; i < 5; i++) {
            addCardToZone("Grizzly Bears", o, ZoneType.Hand);
        }
        addCardToZone("Grizzly Bears", p, ZoneType.Hand);
        addCards("Island", 3, p);
        Card wf = addCardToZone("Windfall", p, ZoneType.Hand);
        game.getAction().checkStateEffects(true);
        cast(game, p, wf);
        AssertJUnit.assertEquals(5, p.getCardsIn(ZoneType.Hand).size());
        AssertJUnit.assertEquals(5, o.getCardsIn(ZoneType.Hand).size());
    }

    @Test
    public void vraskaUltimatePoisonDifference() {
        Game game = initAndCreateGame();
        Player p = game.getPlayers().get(1);
        Player o = game.getPlayers().get(0);
        o.setPoisonCounters(3, p);
        Card vraska = pw("Vraska, Betrayal's Sting", p, 10);
        game.getAction().checkStateEffects(true);
        activate(game, p, vraska, "-9", o);
        AssertJUnit.assertEquals(9, o.getPoisonCounters());
    }

    @Test
    public void brokersAscendancyEndStep() {
        Game game = initAndCreateGame();
        Player p = game.getPlayers().get(1);
        fillLibrary(p, 5);
        addCard("Brokers Ascendancy", p);
        Card bear = addCard("Grizzly Bears", p);
        Card teferi = pw("Teferi, Hero of Dominaria", p, 4);
        game.getAction().checkStateEffects(true);
        activate(game, p, teferi, "+1");
        playUntilPhase(game, PhaseType.CLEANUP);
        AssertJUnit.assertEquals(6, loyalty(teferi));
        AssertJUnit.assertEquals(1, bear.getCounters(CounterEnumType.P1P1));
    }

    @Test(enabled = false) // AI declines the optional move (CountersMoveAi.doTriggerNoCost falls through to CantPlayAi); not a rules bug
    public void gatewatchBeaconMovesLoyaltyToEnteringWalker() {
        Game game = initAndCreateGame();
        Player p = game.getPlayers().get(1);
        Card beacon = addCard("Gatewatch Beacon", p);
        beacon.addCounterInternal(CounterEnumType.LOYALTY, 3, p, false, null, null);
        addCards("Island", 4, p);
        fillLibrary(p, 5);
        Card jace = addCardToZone("Jace, the Mind Sculptor", p, ZoneType.Hand);
        game.getAction().checkStateEffects(true);
        cast(game, p, jace);
        AssertJUnit.assertEquals(2, loyalty(beacon));
        AssertJUnit.assertEquals(4, loyalty(game.getCardState(jace)));
    }

    // ================================================================ batch 3

    @Test
    public void garrukVeiledButcherOpponentCreatureDiesIsExiled() {
        Game game = initAndCreateGame();
        Player p = game.getPlayers().get(1);
        Player o = game.getPlayers().get(0);
        pw("Garruk, Veiled Butcher", p, 5);
        Card bear = addCard("Grizzly Bears", o);
        addCards("Swamp", 3, p);
        Card murder = addCardToZone("Murder", p, ZoneType.Hand);
        game.getAction().checkStateEffects(true);
        cast(game, p, murder, bear);
        AssertJUnit.assertEquals(ZoneType.Exile, game.getCardState(bear).getZone().getZoneType());
    }

    /** Oracle: "If a creature an opponent controls would die" = battlefield to graveyard only. Milling is not dying. */
    @Test
    public void garrukVeiledButcherDoesNotStopOpponentMill() {
        Game game = initAndCreateGame();
        Player p = game.getPlayers().get(1);
        Player o = game.getPlayers().get(0);
        fillLibrary(p, 5);
        pw("Garruk, Veiled Butcher", p, 5);
        Card jace = pw("Jace, Wielder of Mysteries", p, 4);
        for (int i = 0; i < 4; i++) {
            addCardToZone("Grizzly Bears", o, ZoneType.Library);
        }
        game.getAction().checkStateEffects(true);
        activate(game, p, jace, "+1", o);
        AssertJUnit.assertEquals("two creature cards milled: " + log(game), 2, o.getCardsIn(ZoneType.Graveyard).size());
        AssertJUnit.assertEquals(2, o.getCardsIn(ZoneType.Library).size());
    }

    /** Opponent must discard down to 7 at cleanup; Garruk's replacement must not keep creature cards in hand (or loop). */
    @Test(timeOut = 120000)
    public void garrukVeiledButcherDoesNotStopCleanupDiscard() {
        Game game = initAndCreateGame();
        Player p = game.getPlayers().get(1);
        Player o = game.getPlayers().get(0);
        fillLibrary(p, 10);
        fillLibrary(o, 10);
        pw("Garruk, Veiled Butcher", p, 5);
        for (int i = 0; i < 9; i++) {
            addCardToZone("Grizzly Bears", o, ZoneType.Hand);
        }
        game.getAction().checkStateEffects(true);
        playUntilNextTurn(game); // to o's turn
        AssertJUnit.assertEquals(o, game.getPhaseHandler().getPlayerTurn());
        playUntilNextTurn(game); // o's cleanup happened
        AssertJUnit.assertTrue("o should have discarded down to 7, has " + o.getCardsIn(ZoneType.Hand).size(),
                o.getCardsIn(ZoneType.Hand).size() <= 7);
    }

    @Test
    public void gatewatchBeaconDebug() {
        Game game = initAndCreateGame();
        Player p = game.getPlayers().get(1);
        Card beacon = addCard("Gatewatch Beacon", p);
        beacon.addCounterInternal(CounterEnumType.LOYALTY, 3, p, false, null, null);
        addCards("Island", 4, p);
        fillLibrary(p, 5);
        Card jace = addCardToZone("Jace, the Mind Sculptor", p, ZoneType.Hand);
        game.getAction().checkStateEffects(true);
        cast(game, p, jace);
        System.out.println("BEACON beacon=" + loyalty(beacon) + " jace=" + loyalty(game.getCardState(jace)) + "\n" + log(game));
    }

    @Test
    public void narsetParterLimitsOpponentDraws() {
        Game game = initAndCreateGame();
        Player p = game.getPlayers().get(1);
        Player o = game.getPlayers().get(0);
        fillLibrary(o, 10);
        pw("Narset, Parter of Veils", p, 5);
        addCards("Island", 3, o);
        Card div = addCardToZone("Divination", o, ZoneType.Hand);
        game.getAction().checkStateEffects(true);
        cast(game, o, div);
        AssertJUnit.assertEquals(1, o.getCardsIn(ZoneType.Hand).size());
    }

    @Test
    public void jaceWielderWinsOnEmptyLibraryDrawWithVnwxt() {
        Game game = initAndCreateGame();
        Player p = game.getPlayers().get(1);
        pw("Jace, Wielder of Mysteries", p, 4);
        addCard("Vnwxt, Verbose Host", p);
        p.setSpeed(4);
        addCardToZone("Runeclaw Bear", p, ZoneType.Library);
        addCards("Island", 3, p);
        Card div = addCardToZone("Divination", p, ZoneType.Hand);
        game.getAction().checkStateEffects(true);
        cast(game, p, div);
        AssertJUnit.assertTrue(game.isGameOver());
        AssertJUnit.assertTrue(p.hasWon());
    }

    @Test(enabled = false) // harness artifact: the */* Crawler is 0/0 with an empty hand
    public void psychosisCrawlerWithVnwxtFourPlayers() {
        Game game = nPlayerGame(4);
        Player p = game.getPlayers().get(0);
        fillLibrary(p, 10);
        addCard("Psychosis Crawler", p);
        addCard("Vnwxt, Verbose Host", p);
        p.setSpeed(4);
        addCards("Island", 3, p);
        Card div = addCardToZone("Divination", p, ZoneType.Hand);
        game.getAction().checkStateEffects(true);
        cast(game, p, div);
        for (Player o : p.getOpponents()) {
            AssertJUnit.assertEquals("4 draws -> lose 4", 16, o.getLife());
        }
    }

    @Test
    public void alandraSecondDrawMakesOneDrake() {
        Game game = initAndCreateGame();
        Player p = game.getPlayers().get(1);
        fillLibrary(p, 10);
        addCard("Alandra, Sky Dreamer", p);
        addCard("Vnwxt, Verbose Host", p);
        p.setSpeed(4);
        addCards("Island", 3, p);
        Card div = addCardToZone("Divination", p, ZoneType.Hand);
        game.getAction().checkStateEffects(true);
        cast(game, p, div);
        AssertJUnit.assertEquals(4, p.getCardsIn(ZoneType.Hand).size());
        AssertJUnit.assertEquals(1, countCardsWithName(game, "Drake Token"));
    }

    @Test
    public void kayaGhostAssassinDrainFourPlayers() {
        Game game = nPlayerGame(4);
        Player p = game.getPlayers().get(0);
        Card kaya = pw("Kaya, Ghost Assassin", p, 5);
        game.getAction().checkStateEffects(true);
        activate(game, p, kaya, "-1");
        for (Player o : p.getOpponents()) {
            AssertJUnit.assertEquals(18, o.getLife());
        }
        AssertJUnit.assertEquals("you gain 2 (not 2 per opponent)", 22, p.getLife());
    }

    @Test
    public void bolasGodPharaohPlusOneEachOpponentExilesTwo() {
        Game game = nPlayerGame(4);
        Player p = game.getPlayers().get(0);
        Card bolas = pw("Nicol Bolas, God-Pharaoh", p, 7);
        for (Player o : p.getOpponents()) {
            for (int i = 0; i < 3; i++) {
                addCardToZone("Grizzly Bears", o, ZoneType.Hand);
            }
        }
        game.getAction().checkStateEffects(true);
        activate(game, p, bolas, "+1");
        for (Player o : p.getOpponents()) {
            AssertJUnit.assertEquals(1, o.getCardsIn(ZoneType.Hand).size());
            AssertJUnit.assertEquals(2, o.getCardsIn(ZoneType.Exile).size());
        }
    }

    @Test
    public void chandraAwakenedInfernoEmblemForEachOpponent() {
        Game game = nPlayerGame(4);
        Player p = game.getPlayers().get(0);
        Card chandra = pw("Chandra, Awakened Inferno", p, 6);
        game.getAction().checkStateEffects(true);
        activate(game, p, chandra, "+2");
        for (Player o : p.getOpponents()) {
            AssertJUnit.assertEquals(1, o.getCardsIn(ZoneType.Command).size());
        }
        AssertJUnit.assertEquals(0, p.getCardsIn(ZoneType.Command).size());
        playUntilNextTurn(game);
        playUntilPhase(game, PhaseType.MAIN1);
        Player next = game.getPhaseHandler().getPlayerTurn();
        AssertJUnit.assertEquals(19, next.getLife());
    }

    @Test
    public void willKenrithPlusTwoUntilYourNextTurn() {
        Game game = initAndCreateGame();
        Player p = game.getPlayers().get(1);
        Player o = game.getPlayers().get(0);
        fillLibrary(p, 10);
        fillLibrary(o, 10);
        Card will = pw("Will Kenrith", p, 4);
        Card angel = addCard("Serra Angel", o);
        game.getAction().checkStateEffects(true);
        activate(game, p, will, "+2", angel);
        AssertJUnit.assertEquals(0, angel.getNetPower());
        AssertJUnit.assertEquals(3, angel.getNetToughness());
        AssertJUnit.assertFalse(angel.hasKeyword(forge.game.keyword.Keyword.FLYING));
        playUntilNextTurn(game);
        AssertJUnit.assertEquals("still shrunk during opponent's turn", 0, angel.getNetPower());
        playUntilNextTurn(game);
        AssertJUnit.assertEquals(p, game.getPhaseHandler().getPlayerTurn());
        AssertJUnit.assertEquals(4, angel.getNetPower());
        AssertJUnit.assertTrue(angel.hasKeyword(forge.game.keyword.Keyword.FLYING));
    }

    @Test
    public void necromancyReanimatesAndSacrificesOnLeave() {
        Game game = initAndCreateGame();
        Player p = game.getPlayers().get(1);
        Player o = game.getPlayers().get(0);
        Card bear = addCardToZone("Grizzly Bears", o, ZoneType.Graveyard);
        addCards("Swamp", 3, p);
        Card necro = addCardToZone("Necromancy", p, ZoneType.Hand);
        game.getAction().checkStateEffects(true);
        SpellAbility sa = necro.getFirstSpellAbility();
        sa.setActivatingPlayer(p);
        AssertJUnit.assertTrue(ComputerUtil.playStack(sa, p, game));
        resolveAll(game);
        Card b = game.getCardState(bear);
        Card n = game.getCardState(necro);
        AssertJUnit.assertEquals("bear reanimated: " + log(game), ZoneType.Battlefield, b.getZone().getZoneType());
        AssertJUnit.assertEquals(p, b.getController());
        AssertJUnit.assertEquals(b, n.getAttachedTo());
        game.getAction().moveToGraveyard(n, null, null);
        resolveAll(game);
        AssertJUnit.assertEquals(ZoneType.Graveyard, game.getCardState(bear).getZone().getZoneType());
    }

    @Test
    public void seaOfCloudsUntappedWithTwoOpponents() {
        Game game = nPlayerGame(3);
        Player p = game.getPlayers().get(0);
        Card land = addCardToZone("Sea of Clouds", p, ZoneType.Hand);
        Card pool = addCardToZone("Morphic Pool", p, ZoneType.Hand);
        game.getAction().moveToPlay(land, p, null, null);
        game.getAction().moveToPlay(pool, p, null, null);
        AssertJUnit.assertFalse(game.getCardState(land).isTapped());
        AssertJUnit.assertFalse(game.getCardState(pool).isTapped());
    }

    @Test
    public void chandraLegacyOfFireEndStepFourPlayers() {
        Game game = nPlayerGame(4);
        Player p = game.getPlayers().get(0);
        fillLibrary(p, 10);
        Card chandra = pw("Chandra, Legacy of Fire", p, 3);
        Card teferi = pw("Teferi, Hero of Dominaria", p, 4);
        activate(game, p, chandra, "+1");
        activate(game, p, teferi, "+1");
        playUntilPhase(game, PhaseType.CLEANUP);
        for (Player o : p.getOpponents()) {
            AssertJUnit.assertEquals(18, o.getLife());
        }
    }

    @Test
    public void ajaniSteadfastMinusTwo() {
        Game game = initAndCreateGame();
        Player p = game.getPlayers().get(1);
        Card ajani = pw("Ajani Steadfast", p, 4);
        Card teferi = pw("Teferi, Hero of Dominaria", p, 4);
        Card bear = addCard("Grizzly Bears", p);
        game.getAction().checkStateEffects(true);
        activate(game, p, ajani, "-2");
        AssertJUnit.assertEquals(2, loyalty(ajani));
        AssertJUnit.assertEquals(5, loyalty(teferi));
        AssertJUnit.assertEquals(1, bear.getCounters(CounterEnumType.P1P1));
    }

    @Test
    public void chasmSkulkerDiesIntoSquids() {
        Game game = initAndCreateGame();
        Player p = game.getPlayers().get(1);
        Card sk = addCard("Chasm Skulker", p);
        sk.addCounterInternal(CounterEnumType.P1P1, 3, p, false, null, null);
        addCards("Swamp", 3, p);
        Card murder = addCardToZone("Murder", p, ZoneType.Hand);
        game.getAction().checkStateEffects(true);
        cast(game, p, murder, sk);
        AssertJUnit.assertEquals(3, countCardsWithName(game, "Squid Token"));
    }

    // ================================================================ batch 4

    @Test
    public void psychosisCrawlerWithVnwxtFourPlayersFixed() {
        Game game = nPlayerGame(4);
        Player p = game.getPlayers().get(0);
        fillLibrary(p, 10);
        addCard("Psychosis Crawler", p);
        addCard("Vnwxt, Verbose Host", p);
        for (int i = 0; i < 3; i++) {
            addCardToZone("Grizzly Bears", p, ZoneType.Hand); // keep the */* Crawler alive
        }
        p.setSpeed(4);
        addCards("Island", 3, p);
        Card div = addCardToZone("Divination", p, ZoneType.Hand);
        game.getAction().checkStateEffects(true);
        cast(game, p, div);
        for (Player o : p.getOpponents()) {
            AssertJUnit.assertEquals("4 draws -> lose 4: " + log(game), 16, o.getLife());
        }
    }

    @Test
    public void teferiTimeRavelerSorcerySpeedOpponents() {
        Game game = initAndCreateGame();
        Player p = game.getPlayers().get(1);
        Player o = game.getPlayers().get(0);
        pw("Teferi, Time Raveler", p, 4);
        addCard("Island", o);
        Card opt = addCardToZone("Opt", o, ZoneType.Hand);
        game.getAction().checkStateEffects(true);
        SpellAbility sa = opt.getFirstSpellAbility();
        sa.setActivatingPlayer(o);
        AssertJUnit.assertTrue("control: castable timing-wise", sa.canPlay());
        AssertJUnit.assertFalse("opponent cannot cast an instant on my turn (Raveler)", sa.checkRestrictions(o));
    }

    @Test
    public void wanderingEmperorFlashActivationOnOpponentTurn() {
        Game game = initAndCreateGame();
        Player p = game.getPlayers().get(1);
        Player o = game.getPlayers().get(0);
        fillLibrary(p, 10);
        fillLibrary(o, 10);
        Card teferi = pw("Teferi, Hero of Dominaria", p, 4);
        playUntilNextTurn(game);
        AssertJUnit.assertEquals(o, game.getPhaseHandler().getPlayerTurn());
        playUntilPhase(game, PhaseType.MAIN1);
        Card emp = addCardToZone("The Wandering Emperor", p, ZoneType.Hand);
        emp = game.getAction().moveToPlay(emp, p, null, null);
        emp.addCounterInternal(CounterEnumType.LOYALTY, 3, p, false, null, null);
        game.getAction().checkStateEffects(true);
        SpellAbility minus = ability(emp, "-1");
        minus.setActivatingPlayer(p);
        AssertJUnit.assertTrue("Emperor entered this turn: instant-speed loyalty", minus.canPlay());
        SpellAbility tef = ability(teferi, "+1");
        tef.setActivatingPlayer(p);
        AssertJUnit.assertFalse("other walkers stay sorcery-speed", tef.canPlay());
    }

    @Test
    public void wayOfThePyromancerEmpowersJaceAndGrantsMana() {
        Game game = initAndCreateGame();
        Player p = game.getPlayers().get(1);
        addCards("Mountain", 2, p);
        Card way = addCardToZone("Way of the Pyromancer", p, ZoneType.Hand);
        game.getAction().checkStateEffects(true);
        cast(game, p, way);
        Card jace = null;
        for (Card c : p.getCardsIn(ZoneType.Battlefield)) {
            if (c.isPlaneswalker()) {
                jace = c;
            }
        }
        AssertJUnit.assertNotNull("Jace token created: " + gameStateToString(game), jace);
        AssertJUnit.assertTrue(jace.isToken());
        AssertJUnit.assertEquals(2, loyalty(jace));
        ability(jace, "+1: Add {R}");
    }

    @Test
    public void sanctumLurkerEmpowersJaceOne() {
        Game game = initAndCreateGame();
        Player p = game.getPlayers().get(1);
        addCards("Swamp", 3, p);
        Card lurker = addCardToZone("Sanctum Lurker", p, ZoneType.Hand);
        game.getAction().checkStateEffects(true);
        cast(game, p, lurker);
        int jaces = 0;
        for (Card c : p.getCardsIn(ZoneType.Battlefield)) {
            if (c.isPlaneswalker()) {
                jaces++;
                AssertJUnit.assertEquals(1, loyalty(c));
            }
        }
        AssertJUnit.assertEquals(1, jaces);
    }

    @Test
    public void fierceGuardianshipFreeWithCommander() {
        Game game = commanderGame("Tam, the Possibility", "Isamaru, Hound of Konda");
        List<Player> ps = game.getPlayers();
        Player p = ps.get(0);
        Player o = ps.get(1);
        fillLibrary(o, 10);
        Card tam = p.getCommanders().get(0);
        game.getAction().moveToPlay(tam, p, null, null);
        addCards("Island", 3, o);
        Card div = addCardToZone("Divination", o, ZoneType.Hand);
        Card fg = addCardToZone("Fierce Guardianship", p, ZoneType.Hand);
        game.getAction().checkStateEffects(true);
        SpellAbility dsa = div.getFirstSpellAbility();
        dsa.setActivatingPlayer(o);
        AssertJUnit.assertTrue(ComputerUtil.playStack(dsa, o, game));
        SpellAbility free = null;
        for (SpellAbility alt : forge.game.GameActionUtil.getAlternativeCosts(fg.getFirstSpellAbility(), p, true)) {
            free = alt;
        }
        AssertJUnit.assertNotNull("alternative cost available while controlling a commander", free);
        free.setActivatingPlayer(p);
        free.getTargets().add(game.getStack().peekAbility());
        AssertJUnit.assertTrue("cast for free with no lands", ComputerUtil.playStack(free, p, game));
        resolveAll(game);
        AssertJUnit.assertEquals(ZoneType.Graveyard, game.getCardState(div).getZone().getZoneType());
        AssertJUnit.assertEquals(0, o.getCardsIn(ZoneType.Hand).size());
    }

    @Test
    public void forgeOfHeroesOnPlaneswalkerCommander() {
        Game game = commanderGame("Aminatou, the Fateshifter", "Isamaru, Hound of Konda");
        Player p = game.getPlayers().get(0);
        Card am = p.getCommanders().get(0);
        am = game.getAction().moveToPlay(am, p, null, null);
        game.getAction().checkStateEffects(true);
        AssertJUnit.assertEquals(3, loyalty(am));
        Card forgeH = addCard("Forge of Heroes", p);
        activate(game, p, forgeH, "Choose target commander", am);
        AssertJUnit.assertEquals(4, loyalty(game.getCardState(am)));
    }

    @Test
    public void temporalArchmageEmblemInstantSpeedLoyalty() {
        Game game = initAndCreateGame();
        Player p = game.getPlayers().get(1);
        Player o = game.getPlayers().get(0);
        fillLibrary(p, 10);
        fillLibrary(o, 10);
        Card teferi = pw("Teferi, Temporal Archmage", p, 11);
        Card jace = pw("Jace, the Mind Sculptor", p, 3);
        game.getAction().checkStateEffects(true);
        activate(game, p, teferi, "-10");
        playUntilNextTurn(game);
        playUntilPhase(game, PhaseType.MAIN1);
        AssertJUnit.assertEquals(o, game.getPhaseHandler().getPlayerTurn());
        SpellAbility sa = ability(jace, "+2");
        sa.setActivatingPlayer(p);
        System.out.println("ARCHMAGE cmd=" + p.getCardsIn(ZoneType.Command) + " jaceZone=" + jace.getZone() + " acts=" + jace.getPlaneswalkerAbilityActivated()
            + " timing=" + sa.canCastTiming(jace, p) + " restr=" + sa.getRestrictions().canPlay(jace, sa) + " loyalty=" + loyalty(jace)
            + " teferi=" + teferi.getZone() + "\n" + log(game));
        // the AI itself already used Jace on the opponent's turn (only possible with the emblem), or can still do it
        AssertJUnit.assertTrue("emblem: loyalty abilities on any player's turn",
                sa.canPlay() || jace.getPlaneswalkerAbilityActivated() >= 1);
    }

    @Test
    public void okoExchangeControl() {
        Game game = initAndCreateGame();
        Player p = game.getPlayers().get(1);
        Player o = game.getPlayers().get(0);
        Card oko = pw("Oko, Thief of Crowns", p, 6);
        Card food = addToken("c_a_food_sac", p);
        Card bear = addCard("Grizzly Bears", o);
        game.getAction().checkStateEffects(true);
        SpellAbility sa = ability(oko, "-5");
        sa.setActivatingPlayer(p);
        sa.getTargets().add(food);
        sa.getSubAbility().getTargets().add(bear);
        AssertJUnit.assertTrue(ComputerUtil.playStack(sa, p, game));
        resolveAll(game);
        AssertJUnit.assertEquals(o, food.getController());
        AssertJUnit.assertEquals(p, bear.getController());
    }

    @Test
    public void bolasPlaneswalkerStealIsPermanent() {
        Game game = initAndCreateGame();
        Player p = game.getPlayers().get(1);
        Player o = game.getPlayers().get(0);
        Card bolas = pw("Nicol Bolas, Planeswalker", p, 5);
        Card bear = addCard("Grizzly Bears", o);
        game.getAction().checkStateEffects(true);
        activate(game, p, bolas, "-2", bear);
        AssertJUnit.assertEquals(p, bear.getController());
        game.getAction().moveToGraveyard(bolas, null, null);
        game.getAction().checkStateEffects(true);
        AssertJUnit.assertEquals(p, bear.getController());
    }

    @Test
    public void resourcefulDefenseMovesCountersOfDyingPermanent() {
        Game game = initAndCreateGame();
        Player p = game.getPlayers().get(1);
        addCard("Resourceful Defense", p);
        Card bear = addCard("Grizzly Bears", p);
        bear.addCounterInternal(CounterEnumType.P1P1, 2, p, false, null, null);
        Card ox = addCard("Hill Giant", p);
        addCards("Swamp", 3, p);
        Card murder = addCardToZone("Murder", p, ZoneType.Hand);
        game.getAction().checkStateEffects(true);
        cast(game, p, murder, bear);
        int total = 0;
        for (Card c : p.getCardsIn(ZoneType.Battlefield)) {
            total += c.getCounters(CounterEnumType.P1P1);
        }
        AssertJUnit.assertEquals("2 +1/+1 counters moved: " + log(game), 2, total);
    }

    @Test(timeOut = 120000)
    public void triskaidekaphileWinsAtUpkeep() {
        Game game = initAndCreateGame();
        Player p = game.getPlayers().get(1);
        Player o = game.getPlayers().get(0);
        fillLibrary(p, 10);
        fillLibrary(o, 10);
        addCard("Triskaidekaphile", p);
        for (int i = 0; i < 13; i++) {
            addCardToZone("Grizzly Bears", p, ZoneType.Hand);
        }
        game.getAction().checkStateEffects(true);
        playUntilNextTurn(game);
        playUntilNextTurn(game);
        playUntilPhase(game, PhaseType.DRAW);
        AssertJUnit.assertTrue(game.isGameOver());
        AssertJUnit.assertTrue(p.hasWon());
    }

    @Test
    public void bodyOfKnowledgeDrawsDamage() {
        Game game = initAndCreateGame();
        Player p = game.getPlayers().get(1);
        fillLibrary(p, 10);
        Card body = addCard("Body of Knowledge", p);
        for (int i = 0; i < 5; i++) {
            addCardToZone("Grizzly Bears", p, ZoneType.Hand);
        }
        addCard("Mountain", p);
        Card bolt = addCardToZone("Lightning Bolt", p, ZoneType.Hand);
        game.getAction().checkStateEffects(true);
        cast(game, p, bolt, body);
        AssertJUnit.assertEquals(5 + 3, p.getCardsIn(ZoneType.Hand).size());
    }

    @Test
    public void ominousSeasKraken() {
        Game game = initAndCreateGame();
        Player p = game.getPlayers().get(1);
        Card seas = addCard("Ominous Seas", p);
        seas.addCounterInternal(CounterEnumType.FORESHADOW, 8, p, false, null, null);
        game.getAction().checkStateEffects(true);
        activate(game, p, seas, "Kraken");
        AssertJUnit.assertEquals(0, seas.getCounters(CounterEnumType.FORESHADOW));
        AssertJUnit.assertEquals(1, countCardsWithName(game, "Kraken Token"));
    }

    @Test
    public void vanquishTheHordeCostReduction() {
        Game game = initAndCreateGame();
        Player p = game.getPlayers().get(1);
        Player o = game.getPlayers().get(0);
        for (int i = 0; i < 3; i++) {
            addCard("Grizzly Bears", p);
            addCard("Grizzly Bears", o);
        }
        addCards("Plains", 2, p);
        Card v = addCardToZone("Vanquish the Horde", p, ZoneType.Hand);
        game.getAction().checkStateEffects(true);
        cast(game, p, v);
        AssertJUnit.assertEquals(0, countCardsWithName(game, "Grizzly Bears"));
    }

    // ================================================================ batch 5

    @Test
    public void aminatouPlusOneDrawThenPutOneOnTop() {
        Game game = initAndCreateGame();
        Player p = game.getPlayers().get(1);
        fillLibrary(p, 5);
        Card am = pw("Aminatou, the Fateshifter", p, 3);
        addCardToZone("Grizzly Bears", p, ZoneType.Hand);
        game.getAction().checkStateEffects(true);
        activate(game, p, am, "+1");
        AssertJUnit.assertEquals(4, loyalty(am));
        AssertJUnit.assertEquals(1, p.getCardsIn(ZoneType.Hand).size());
        AssertJUnit.assertEquals(5, p.getCardsIn(ZoneType.Library).size());
    }

    @Test
    public void ichormoonCastTriggerAddsCounterOfExistingKind() {
        Game game = initAndCreateGame();
        Player p = game.getPlayers().get(1);
        fillLibrary(p, 5);
        addCard("Ichormoon Gauntlet", p);
        Card teferi = pw("Teferi, Hero of Dominaria", p, 4);
        activate(game, p, teferi, "+1"); // 5; AI cannot use him again
        addCard("Island", p);
        Card opt = addCardToZone("Opt", p, ZoneType.Hand);
        game.getAction().checkStateEffects(true);
        cast(game, p, opt);
        AssertJUnit.assertEquals("noncreature spell: +1 loyalty on target permanent: " + log(game), 6, loyalty(teferi));
    }

    @Test
    public void teyoPlusOneYouAndTargetOpponentDraw() {
        Game game = nPlayerGame(4);
        List<Player> ps = game.getPlayers();
        Player p = ps.get(0);
        for (Player x : ps) {
            fillLibrary(x, 5);
        }
        Card teyo = pw("Teyo, Geometric Tactician", p, 3);
        game.getAction().checkStateEffects(true);
        activate(game, p, teyo, "+1", ps.get(2));
        AssertJUnit.assertEquals(1, p.getCardsIn(ZoneType.Hand).size());
        AssertJUnit.assertEquals(1, ps.get(2).getCardsIn(ZoneType.Hand).size());
        AssertJUnit.assertEquals(0, ps.get(1).getCardsIn(ZoneType.Hand).size());
        AssertJUnit.assertEquals(0, ps.get(3).getCardsIn(ZoneType.Hand).size());
    }

    @Test
    public void narsetTranscendentPlusOneTakesNoncreatureNonland() {
        Game game = initAndCreateGame();
        Player p = game.getPlayers().get(1);
        fillLibrary(p, 3);
        Card top = addCardToZone("Opt", p, ZoneType.Library);
        p.getZone(ZoneType.Library).remove(top);
        p.getZone(ZoneType.Library).add(top, 0);
        Card narset = pw("Narset Transcendent", p, 6);
        game.getAction().checkStateEffects(true);
        activate(game, p, narset, "+1");
        AssertJUnit.assertEquals(ZoneType.Hand, game.getCardState(top).getZone().getZoneType());
    }
}
