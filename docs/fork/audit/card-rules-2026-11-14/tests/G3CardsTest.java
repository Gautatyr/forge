package forge.ai;

import java.util.List;

import org.testng.AssertJUnit;
import org.testng.annotations.Test;

import com.google.common.collect.Lists;

import forge.deck.Deck;
import forge.game.Game;
import forge.game.GameRules;
import forge.game.GameStage;
import forge.game.GameType;
import forge.game.Match;
import forge.game.ability.AbilityKey;
import forge.game.card.Card;
import forge.game.card.CounterEnumType;
import forge.game.keyword.Keyword;
import forge.game.phase.PhaseType;
import forge.game.player.Player;
import forge.game.player.RegisteredPlayer;
import forge.game.spellability.SpellAbility;
import forge.game.zone.ZoneType;

/** g3 card sweep: Pod Acererak, Pod Fynn, Pod Kodama Toggo, Prosper. Each test asserts the Oracle outcome. */
public class G3CardsTest extends AITest {

    // ------------------------------------------------------------------ helpers

    protected Game fourPlayerGame() {
        initAndCreateGame(); // loads the model
        List<RegisteredPlayer> players = Lists.newArrayList();
        Deck d1 = new Deck();
        players.add(new RegisteredPlayer(d1).setPlayer(new LobbyPlayerAi("opp1", null)));
        players.add(new RegisteredPlayer(d1).setPlayer(new LobbyPlayerAi("ai", null)));
        players.add(new RegisteredPlayer(d1).setPlayer(new LobbyPlayerAi("opp2", null)));
        players.add(new RegisteredPlayer(d1).setPlayer(new LobbyPlayerAi("opp3", null)));
        GameRules rules = new GameRules(GameType.Constructed);
        Match match = new Match(rules, players, "Test");
        Game game = new Game(players, rules, match);
        Player ai = game.getPlayers().get(1);
        game.setAge(GameStage.Play);
        game.getPhaseHandler().devModeSet(PhaseType.MAIN1, ai);
        game.getPhaseHandler().onStackResolved();
        return game;
    }

    /** Harness: cards added straight to a zone are neither registered as active triggers nor in the last-known state. */
    protected void sync(Game game) {
        game.getAction().checkStateEffects(true);
        game.getTriggerHandler().resetActiveTriggers(false, null);
        game.copyLastState();
    }

    /** Cards added straight to a zone are not in the last-known battlefield snapshot that ChangesZone triggers read. */
    /**
     * Resolves the stack, then keeps going while state-based actions or waiting triggers put more on it (the base helper
     * stops as soon as the stack is empty, before the triggers of the last resolution are put on the stack).
     */
    @Override
    protected void playUntilStackClear(Game game) {
        sync(game);
        int guard = 0;
        while (!game.isGameOver() && guard++ < 1000) {
            game.getAction().checkStateEffects(true);
            boolean added = game.getStack().addAllTriggeredAbilitiesToStack();
            if (game.getStack().isEmpty() && !added) {
                break;
            }
            game.getPhaseHandler().mainLoopStep();
        }
    }

    @Override
    protected void playUntilPhase(Game game, PhaseType phase) {
        sync(game);
        super.playUntilPhase(game, phase);
    }

    protected Card ready(String name, Player p) {
        Card c = addCard(name, p);
        c.setSickness(false);
        return c;
    }

    protected int countType(Player p, String subtype) {
        int n = 0;
        for (Card c : p.getCardsIn(ZoneType.Battlefield)) {
            if (c.getType().hasSubtype(subtype)) {
                n++;
            }
        }
        return n;
    }

    protected int countNamed(Player p, String name, ZoneType zone) {
        int n = 0;
        for (Card c : p.getCardsIn(zone)) {
            if (c.getName().equals(name)) {
                n++;
            }
        }
        return n;
    }

    protected int oppPoison(Player me) {
        int n = 0;
        for (Player o : me.getOpponents()) {
            n += o.getPoisonCounters();
        }
        return n;
    }

    protected int oppLife(Player me) {
        int n = 0;
        for (Player o : me.getOpponents()) {
            n += o.getLife();
        }
        return n;
    }

    /** Casts with AI cost payment (targets must be set by the caller), then resolves the stack. */
    protected void castAndResolve(Game game, SpellAbility sa, Player p) {
        sync(game);
        sa.setActivatingPlayer(p);
        AssertJUnit.assertTrue("could not cast " + sa, ComputerUtil.playStack(sa, p, game));
        playUntilStackClear(game);
    }

    protected SpellAbility spellOf(Card c) {
        return c.getFirstSpellAbility();
    }

    /** A spell or land ability the player may use for a card outside the hand (exile, library top, graveyard). */
    protected SpellAbility playableFrom(Card c, Player p, boolean land) {
        for (SpellAbility sa : c.getAllPossibleAbilities(p, true)) {
            if (land ? sa.isLandAbility() : sa.isSpell()) {
                return sa;
            }
        }
        return null;
    }

    protected void playLand(Card land, Player p) {
        sync(p.getGame());
        SpellAbility play = playableFrom(land, p, true);
        AssertJUnit.assertNotNull("land not playable: " + land, play);
        play.setActivatingPlayer(p);
        sync(p.getGame());
        p.getController().playChosenSpellAbility(play);
        playUntilStackClear(p.getGame());
    }

    protected void putOnTop(Card c, Player p) {
        p.getZone(ZoneType.Library).remove(c);
        p.getZone(ZoneType.Library).add(c, 0);
    }

    protected Card enter(Game game, Card c) {
        sync(game);
        return game.getAction().moveToPlay(c, null, AbilityKey.newMap());
    }

    // ------------------------------------------------------------------ Prosper

    @Test
    public void prosperMysticArcanumThenPactBoonOnCast() {
        Game game = initAndCreateGame();
        Player ai = game.getPlayers().get(1);
        ready("Prosper, Tome-Bound", ai);
        addCards("Swamp", 2, ai);
        fillLibrary(ai, 3);
        Card ritual = addCardToZone("Dark Ritual", ai, ZoneType.Library);
        putOnTop(ritual, ai);
        game.getPhaseHandler().devModeSet(PhaseType.MAIN2, ai);
        playUntilPhase(game, PhaseType.END_OF_TURN);
        playUntilStackClear(game);
        Card exiled = game.getCardState(ritual);
        AssertJUnit.assertTrue("Mystic Arcanum should exile the top card: " + exiled.getZone(), exiled.isInZone(ZoneType.Exile));
        SpellAbility sa = playableFrom(exiled, ai, false);
        AssertJUnit.assertNotNull("the exiled card should be castable", sa);
        castAndResolve(game, sa, ai);
        AssertJUnit.assertEquals("Pact Boon: one Treasure", 1, countType(ai, "Treasure"));
    }

    @Test
    public void prosperPactBoonOnLandPlayedFromExileAndXornDoubles() {
        Game game = initAndCreateGame();
        Player ai = game.getPlayers().get(1);
        ready("Prosper, Tome-Bound", ai);
        ready("Xorn", ai);
        fillLibrary(ai, 3);
        Card land = addCardToZone("Mountain", ai, ZoneType.Library);
        putOnTop(land, ai);
        game.getPhaseHandler().devModeSet(PhaseType.MAIN2, ai);
        playUntilPhase(game, PhaseType.END_OF_TURN);
        playUntilStackClear(game);
        Card exiled = game.getCardState(land);
        AssertJUnit.assertTrue(exiled.isInZone(ZoneType.Exile));
        game.getPhaseHandler().devModeSet(PhaseType.MAIN2, ai);
        playLand(exiled, ai);
        AssertJUnit.assertTrue(game.getCardState(land).isInZone(ZoneType.Battlefield));
        AssertJUnit.assertEquals("Pact Boon + Xorn: two Treasures", 2, countType(ai, "Treasure"));
    }

    @Test
    public void academyManufactorAloneMakesOneOfEach() {
        Game game = initAndCreateGame();
        Player ai = game.getPlayers().get(1);
        ready("Academy Manufactor", ai);
        addCards("Mountain", 2, ai);
        Card spell = addCardToZone("Strike It Rich", ai, ZoneType.Hand);
        castAndResolve(game, spellOf(spell), ai);
        AssertJUnit.assertEquals(1, countType(ai, "Treasure"));
        AssertJUnit.assertEquals(1, countType(ai, "Clue"));
        AssertJUnit.assertEquals(1, countType(ai, "Food"));
    }

    @Test
    public void academyManufactorWithXornGivesALegalResult() {
        Game game = initAndCreateGame();
        Player ai = game.getPlayers().get(1);
        ready("Academy Manufactor", ai);
        ready("Xorn", ai);
        addCards("Mountain", 2, ai);
        Card spell = addCardToZone("Strike It Rich", ai, ZoneType.Hand);
        castAndResolve(game, spellOf(spell), ai);
        int t = countType(ai, "Treasure"), c = countType(ai, "Clue"), f = countType(ai, "Food");
        String got = "T" + t + " C" + c + " F" + f;
        // CR 616.1: either order. Manufactor then Xorn: C,F,T,T. Xorn then Manufactor: 2 of each.
        AssertJUnit.assertTrue("legal outcomes are T2 C1 F1 or T2 C2 F2, got " + got,
                t == 2 && ((c == 1 && f == 1) || (c == 2 && f == 2)));
    }

    @Test
    public void academyManufactorWithGrimHirelingTwoTreasuresMakesTwoOfEach() {
        Game game = initAndCreateGame();
        Player ai = game.getPlayers().get(1);
        ready("Academy Manufactor", ai).setSickness(true);
        ready("Grim Hireling", ai);
        playUntilPhase(game, PhaseType.MAIN2);
        String got = "T" + countType(ai, "Treasure") + " C" + countType(ai, "Clue") + " F" + countType(ai, "Food");
        AssertJUnit.assertEquals("Academy Manufactor ruling: two Treasures become two of each\n" + gameStateToString(game), "T2 C2 F2", got);
    }

    @Test
    public void wildMagicSorcererGivesCascadeToFirstSpellCastFromExile() {
        Game game = initAndCreateGame();
        Player ai = game.getPlayers().get(1);
        Player opp = game.getPlayers().get(0);
        ready("Wild-Magic Sorcerer", ai);
        ready("Prosper, Tome-Bound", ai);
        addCards("Mountain", 4, ai);
        fillLibrary(ai, 3);
        Card shock = addCardToZone("Shock", ai, ZoneType.Library);
        putOnTop(shock, ai);
        Card giant = addCardToZone("Hill Giant", ai, ZoneType.Library);
        putOnTop(giant, ai);
        game.getPhaseHandler().devModeSet(PhaseType.MAIN2, ai);
        playUntilPhase(game, PhaseType.END_OF_TURN);
        playUntilStackClear(game);
        Card exiled = game.getCardState(giant);
        AssertJUnit.assertTrue(exiled.isInZone(ZoneType.Exile));
        game.getPhaseHandler().devModeSet(PhaseType.MAIN2, ai);
        SpellAbility sa = playableFrom(exiled, ai, false);
        AssertJUnit.assertNotNull(sa);
        castAndResolve(game, sa, ai);
        Card s = game.getCardState(shock);
        AssertJUnit.assertTrue("Shock should have been cascaded into and cast; zone=" + s.getZone() + " oppLife=" + opp.getLife()
                + "\n" + gameStateToString(game), s.isInZone(ZoneType.Graveyard));
        AssertJUnit.assertEquals("Pact Boon for Hill Giant and the cascaded Shock", 2, countType(ai, "Treasure"));
    }

    @Test
    public void revelInRichesTreasureOnDeathAndUpkeepWin() {
        Game game = initAndCreateThreePlayerGame();
        Player ai = game.getPlayers().get(1);
        Player opp = game.getPlayers().get(0);
        addCard("Revel in Riches", ai);
        addCards("Swamp", 2, ai);
        Card bear = addCard("Runeclaw Bear", opp);
        Card spell = addCardToZone("Go for the Throat", ai, ZoneType.Hand);
        SpellAbility sa = spellOf(spell);
        sa.getTargets().add(bear);
        castAndResolve(game, sa, ai);
        AssertJUnit.assertEquals(1, countType(ai, "Treasure"));
        for (int i = 0; i < 9; i++) {
            addToken("c_a_treasure_sac", ai);
        }
        AssertJUnit.assertEquals(10, countType(ai, "Treasure"));
        fillLibrary(ai, 3);
        game.getPhaseHandler().devModeSet(PhaseType.UNTAP, ai);
        playUntilPhase(game, PhaseType.UPKEEP);
        playUntilStackClear(game);
        AssertJUnit.assertTrue("Revel in Riches: the controller wins", game.isGameOver());
        AssertJUnit.assertTrue(ai.getOutcome() != null && ai.getOutcome().hasWon());
    }

    // ------------------------------------------------------------------ Fynn

    @Test
    public void fynnDeathtouchCombatDamageGivesTwoPoison() {
        Game game = initAndCreateThreePlayerGame();
        Player ai = game.getPlayers().get(1);
        ready("Fynn, the Fangbearer", ai);
        playUntilPhase(game, PhaseType.MAIN2);
        AssertJUnit.assertEquals("1 damage + 2 poison to the defending player\n" + gameStateToString(game), 2, oppPoison(ai));
        AssertJUnit.assertEquals(39, oppLife(ai));
    }

    @Test
    public void fynnOhranAndToxicRex() {
        Game game = initAndCreateThreePlayerGame();
        Player ai = game.getPlayers().get(1);
        addCard("Fynn, the Fangbearer", ai); // summoning sick: does not attack
        addCard("Ohran Frostfang", ai); // summoning sick
        addCard("Tyrranax Rex", ai); // haste
        fillLibrary(ai, 3);
        int hand = ai.getCardsIn(ZoneType.Hand).size();
        playUntilPhase(game, PhaseType.MAIN2);
        AssertJUnit.assertEquals("toxic 4 + Fynn 2\n" + gameStateToString(game), 6, oppPoison(ai));
        AssertJUnit.assertEquals(40 - 8, oppLife(ai));
        AssertJUnit.assertEquals("Ohran draws a card", hand + 1, ai.getCardsIn(ZoneType.Hand).size());
    }

    @Test
    public void fynnWithTriumphOfTheHordes() {
        Game game = initAndCreateThreePlayerGame();
        Player ai = game.getPlayers().get(1);
        ready("Fynn, the Fangbearer", ai);
        addCards("Forest", 4, ai);
        Card spell = addCardToZone("Triumph of the Hordes", ai, ZoneType.Hand);
        castAndResolve(game, spellOf(spell), ai);
        playUntilPhase(game, PhaseType.MAIN2);
        AssertJUnit.assertEquals("2 infect damage + Fynn 2\n" + gameStateToString(game), 4, oppPoison(ai));
        AssertJUnit.assertEquals("infect damage causes no life loss", 40, oppLife(ai));
    }

    @Test
    public void veneratedRotpriestAndInfectiousBite() {
        Game game = initAndCreateThreePlayerGame();
        Player ai = game.getPlayers().get(1);
        Player opp = game.getPlayers().get(0);
        Card rot = ready("Venerated Rotpriest", ai);
        Card bear = addCard("Runeclaw Bear", opp);
        addCards("Forest", 2, ai);
        Card spell = addCardToZone("Infectious Bite", ai, ZoneType.Hand);
        SpellAbility sa = spellOf(spell);
        sa.getTargets().add(rot);
        sa.getSubAbility().getTargets().add(bear);
        castAndResolve(game, sa, ai);
        AssertJUnit.assertEquals("Rotpriest 1 + Infectious Bite 1 per opponent (2)", 3, oppPoison(ai));
        AssertJUnit.assertEquals(1, game.getCardState(bear).getDamage());
    }

    @Test
    public void glisteningSphereCorrupted() {
        Game game = initAndCreateThreePlayerGame();
        Player ai = game.getPlayers().get(1);
        Player opp = game.getPlayers().get(0);
        Card sphere = addCard("Glistening Sphere", ai);
        sphere.setTapped(false);
        SpellAbility corrupted = null;
        for (SpellAbility sa : sphere.getManaAbilities()) {
            if (sa.getDescription().contains("three")) {
                corrupted = sa;
            }
        }
        AssertJUnit.assertNotNull(corrupted);
        corrupted.setActivatingPlayer(ai);
        opp.setPoisonCounters(2, ai);
        AssertJUnit.assertFalse("2 poison: corrupted off", corrupted.canPlay());
        opp.setPoisonCounters(3, ai);
        AssertJUnit.assertTrue("3 poison on one opponent enables corrupted", corrupted.canPlay());
    }

    @Test
    public void ramThroughDeathtouchTrampleExcess() {
        Game game = initAndCreateThreePlayerGame();
        Player ai = game.getPlayers().get(1);
        Player opp = game.getPlayers().get(0);
        ready("Saryth, the Viper's Fang", ai);
        Card cont = ready("Bloated Contaminator", ai);
        cont.setTapped(true); // Saryth: other tapped creatures have deathtouch
        Card big = addCard("Craw Wurm", opp); // 6/4
        addCards("Forest", 2, ai);
        game.getAction().checkStateEffects(true);
        AssertJUnit.assertTrue(cont.hasKeyword(Keyword.DEATHTOUCH));
        Card spell = addCardToZone("Ram Through", ai, ZoneType.Hand);
        SpellAbility sa = spellOf(spell);
        sa.getTargets().add(cont);
        sa.getSubAbility().getTargets().add(big);
        castAndResolve(game, sa, ai);
        AssertJUnit.assertTrue(gameStateToString(game) + " oppLife=" + opp.getLife(), game.getCardState(big).isInZone(ZoneType.Graveyard));
        AssertJUnit.assertEquals("deathtouch: 1 is lethal, 3 excess to the controller", 17, opp.getLife());
    }

    // ------------------------------------------------------------------ Kodama / Toggo

    @Test
    public void kodamaPutsLesserPermanentAndDoesNotRetrigger() {
        Game game = initAndCreateGame();
        Player ai = game.getPlayers().get(1);
        ready("Kodama of the East Tree", ai);
        Card first = addCardToZone("Runeclaw Bear", ai, ZoneType.Hand);
        addCardToZone("Runeclaw Bear", ai, ZoneType.Hand);
        addCardToZone("Runeclaw Bear", ai, ZoneType.Hand);
        addCardToZone("Hill Giant", ai, ZoneType.Hand);
        enter(game, first);
        playUntilStackClear(game);
        AssertJUnit.assertEquals("one Bear put by Kodama, which does not retrigger\n" + gameStateToString(game), 2, countNamed(ai, "Runeclaw Bear", ZoneType.Battlefield));
        AssertJUnit.assertEquals(1, countNamed(ai, "Hill Giant", ZoneType.Hand));
    }

    @Test
    public void toggoAndKodamaChainLandsAndRocks() {
        Game game = initAndCreateGame();
        Player ai = game.getPlayers().get(1);
        ready("Kodama of the East Tree", ai);
        ready("Toggo, Goblin Weaponsmith", ai);
        Card f1 = addCardToZone("Forest", ai, ZoneType.Hand);
        addCardToZone("Forest", ai, ZoneType.Hand);
        addCardToZone("Forest", ai, ZoneType.Hand);
        playLand(f1, ai);
        AssertJUnit.assertEquals("all 3 Forests end on the battlefield\n" + gameStateToString(game), 3, countNamed(ai, "Forest", ZoneType.Battlefield));
        AssertJUnit.assertEquals("one Rock per land", 3, countNamed(ai, "Rock", ZoneType.Battlefield));
    }

    @Test
    public void tannukWithAncientGreenwardenDrawsOnSecondResolution() {
        Game game = initAndCreateThreePlayerGame();
        Player ai = game.getPlayers().get(1);
        ready("Tannuk, Memorial Ensign", ai);
        ready("Ancient Greenwarden", ai);
        fillLibrary(ai, 5);
        Card f1 = addCardToZone("Forest", ai, ZoneType.Hand);
        playLand(f1, ai);
        AssertJUnit.assertEquals("two triggers: 2 damage to each of 2 opponents", 36, oppLife(ai));
        AssertJUnit.assertEquals("second resolution draws one card", 1, ai.getCardsIn(ZoneType.Hand).size());
    }

    @Test
    public void scuteSwarmCopiesWithSixLands() {
        Game game = initAndCreateGame();
        Player ai = game.getPlayers().get(1);
        ready("Scute Swarm", ai);
        addCards("Forest", 5, ai);
        Card f = addCardToZone("Forest", ai, ZoneType.Hand);
        playLand(f, ai);
        AssertJUnit.assertEquals(2, countNamed(ai, "Scute Swarm", ZoneType.Battlefield));
    }

    // ------------------------------------------------------------------ Acererak

    @Test
    public void acererakEntersBouncesAndVentures() {
        Game game = initAndCreateGame();
        Player ai = game.getPlayers().get(1);
        Card acer = addCardToZone("Acererak the Archlich", ai, ZoneType.Hand);
        enter(game, acer);
        playUntilStackClear(game);
        AssertJUnit.assertTrue(game.getCardState(acer).isInZone(ZoneType.Hand));
        AssertJUnit.assertEquals(1, ai.getVenturedThisTurn());
        boolean dungeon = ai.getCardsIn(ZoneType.Command).stream().anyMatch(c -> c.getType().isDungeon());
        AssertJUnit.assertTrue("a dungeon in the command zone", dungeon);
    }

    @Test
    public void acererakAttackZombiePerOpponentInFourPlayer() {
        Game game = fourPlayerGame();
        Player ai = game.getPlayers().get(1);
        ready("Acererak the Archlich", ai);
        playUntilPhase(game, PhaseType.MAIN2);
        AssertJUnit.assertEquals("three opponents with no creature: three Zombies\n" + gameStateToString(game), 3, countType(ai, "Zombie") - 1);
    }

    @Test
    public void sibsigCeremonyReducesDestroysAndMakesZombieDruid() {
        Game game = initAndCreateGame();
        Player ai = game.getPlayers().get(1);
        addCard("The Sibsig Ceremony", ai);
        addCards("Swamp", 1, ai);
        Card col = addCardToZone("Diregraf Colossus", ai, ZoneType.Hand);
        castAndResolve(game, spellOf(col), ai);
        AssertJUnit.assertTrue(gameStateToString(game), game.getCardState(col).isInZone(ZoneType.Graveyard));
        AssertJUnit.assertEquals(1, countType(ai, "Druid"));
    }

    @Test
    public void diregrafColossusCountersAndZombieCastTrigger() {
        Game game = initAndCreateGame();
        Player ai = game.getPlayers().get(1);
        addCardToZone("Gravecrawler", ai, ZoneType.Graveyard);
        addCardToZone("Champion of the Perished", ai, ZoneType.Graveyard);
        addCardToZone("Runeclaw Bear", ai, ZoneType.Graveyard);
        addCards("Swamp", 4, ai);
        Card col = addCardToZone("Diregraf Colossus", ai, ZoneType.Hand);
        castAndResolve(game, spellOf(col), ai);
        Card c = game.getCardState(col);
        AssertJUnit.assertEquals(2, c.getCounters(CounterEnumType.P1P1));
        Card champ = addCardToZone("Champion of the Perished", ai, ZoneType.Hand);
        castAndResolve(game, spellOf(champ), ai);
        Card tok = null;
        for (Card x : ai.getCardsIn(ZoneType.Battlefield)) {
            if (x.isToken() && x.getType().hasCreatureType("Zombie")) {
                tok = x;
            }
        }
        AssertJUnit.assertNotNull("Colossus: casting a Zombie makes a token", tok);
        AssertJUnit.assertTrue("the token enters tapped", tok.isTapped());
    }

    @Test
    public void endlessRanksHalfZombiesRoundedDown() {
        Game game = initAndCreateGame();
        Player ai = game.getPlayers().get(1);
        addCard("Endless Ranks of the Dead", ai);
        addTokens("b_2_2_zombie", 5, ai);
        fillLibrary(ai, 3);
        game.getPhaseHandler().devModeSet(PhaseType.UNTAP, ai);
        playUntilPhase(game, PhaseType.UPKEEP);
        playUntilStackClear(game);
        AssertJUnit.assertEquals(7, countType(ai, "Zombie"));
    }

    @Test
    public void darknessCrystalExilesOpponentsCreatureAndGainsTwo() {
        Game game = initAndCreateGame();
        Player ai = game.getPlayers().get(1);
        Player opp = game.getPlayers().get(0);
        addCard("The Darkness Crystal", ai);
        addCards("Swamp", 2, ai);
        Card bear = addCard("Runeclaw Bear", opp);
        Card spell = addCardToZone("Go for the Throat", ai, ZoneType.Hand);
        SpellAbility sa = spellOf(spell);
        sa.getTargets().add(bear);
        castAndResolve(game, sa, ai);
        AssertJUnit.assertTrue(game.getCardState(bear).isInZone(ZoneType.Exile));
        AssertJUnit.assertEquals(22, ai.getLife());
        long untapped = ai.getCardsIn(ZoneType.Battlefield).stream().filter(c -> c.getName().equals("Swamp") && !c.isTapped()).count();
        AssertJUnit.assertEquals("Go for the Throat costs {B} with the Crystal", 1, untapped);
    }

    @Test
    public void aetherfluxReservoirCountsSpellsThisTurn() {
        Game game = initAndCreateGame();
        Player ai = game.getPlayers().get(1);
        addCard("Aetherflux Reservoir", ai);
        addCards("Swamp", 3, ai);
        for (int i = 0; i < 3; i++) {
            Card r = addCardToZone("Dark Ritual", ai, ZoneType.Hand);
            castAndResolve(game, spellOf(r), ai);
            ai.getManaPool().clearPool(false);
        }
        AssertJUnit.assertEquals("1+2+3", 26, ai.getLife());
    }

    @Test
    public void krrikGrowsOnBlackSpellAndCryptGhastDoublesSwamps() {
        Game game = initAndCreateGame();
        Player ai = game.getPlayers().get(1);
        Card krrik = ready("K'rrik, Son of Yawgmoth", ai);
        ready("Crypt Ghast", ai);
        Card swamp = addCard("Swamp", ai);
        SpellAbility mana = swamp.getManaAbilities().get(0);
        mana.setActivatingPlayer(ai);
        sync(game);
        game.getAction().checkStateEffects(true);
        ComputerUtil.playNoStack(ai, mana, game, false);
        AssertJUnit.assertEquals("Crypt Ghast: Swamp adds BB", 2, ai.getManaPool().totalMana());
        ai.getManaPool().clearPool(false);
        swamp.setTapped(false);
        Card r = addCardToZone("Dark Ritual", ai, ZoneType.Hand);
        castAndResolve(game, spellOf(r), ai);
        AssertJUnit.assertEquals(1, game.getCardState(krrik).getCounters(CounterEnumType.P1P1));
    }

    @Test
    public void feedTheSwarmLosesLifeEqualToManaValue() {
        Game game = initAndCreateGame();
        Player ai = game.getPlayers().get(1);
        Player opp = game.getPlayers().get(0);
        addCards("Swamp", 2, ai);
        Card wurm = addCard("Craw Wurm", opp); // MV 6
        Card spell = addCardToZone("Feed the Swarm", ai, ZoneType.Hand);
        SpellAbility sa = spellOf(spell);
        sa.getTargets().add(wurm);
        castAndResolve(game, sa, ai);
        AssertJUnit.assertTrue(game.getCardState(wurm).isInZone(ZoneType.Graveyard));
        AssertJUnit.assertEquals(14, ai.getLife());
    }

    @Test
    public void bolasCitadelCastsTopCardPayingLife() {
        Game game = initAndCreateGame();
        Player ai = game.getPlayers().get(1);
        addCard("Bolas's Citadel", ai);
        fillLibrary(ai, 3);
        Card giant = addCardToZone("Hill Giant", ai, ZoneType.Library);
        putOnTop(giant, ai);
        game.getAction().checkStateEffects(true);
        SpellAbility sa = playableFrom(giant, ai, false);
        AssertJUnit.assertNotNull("top card castable", sa);
        castAndResolve(game, sa, ai);
        AssertJUnit.assertTrue(game.getCardState(giant).isInZone(ZoneType.Battlefield));
        AssertJUnit.assertEquals(16, ai.getLife());
    }

    // ================================================================== batch 2

    @Test
    public void laeliaGrowsWhenProsperExilesFromLibrary() {
        Game game = initAndCreateGame();
        Player ai = game.getPlayers().get(1);
        ready("Prosper, Tome-Bound", ai);
        Card laelia = ready("Laelia, the Blade Reforged", ai);
        fillLibrary(ai, 3);
        game.getPhaseHandler().devModeSet(PhaseType.MAIN2, ai);
        playUntilPhase(game, PhaseType.END_OF_TURN);
        playUntilStackClear(game);
        AssertJUnit.assertEquals(1, ai.getCardsIn(ZoneType.Exile).size());
        AssertJUnit.assertEquals(1, game.getCardState(laelia).getCounters(CounterEnumType.P1P1));
    }

    @Test
    public void ubaMaskDrawIsExiledPlayableAndProsperPaysTreasure() {
        Game game = initAndCreateGame();
        Player ai = game.getPlayers().get(1);
        ready("Prosper, Tome-Bound", ai);
        addCard("Uba Mask", ai);
        addCards("Swamp", 1, ai);
        fillLibrary(ai, 3);
        Card ritual = addCardToZone("Dark Ritual", ai, ZoneType.Library);
        putOnTop(ritual, ai);
        sync(game);
        ai.drawCards(1);
        Card ex = game.getCardState(ritual);
        AssertJUnit.assertTrue("Uba Mask: drawn card is exiled instead: " + ex.getZone(), ex.isInZone(ZoneType.Exile));
        AssertJUnit.assertEquals(0, ai.getCardsIn(ZoneType.Hand).size());
        sync(game);
        SpellAbility sa = playableFrom(ex, ai, false);
        AssertJUnit.assertNotNull("Uba Mask: the card exiled this turn is castable", sa);
        castAndResolve(game, sa, ai);
        AssertJUnit.assertEquals(1, countType(ai, "Treasure"));
    }

    @Test
    public void theaterOfHorrorsNeedsAnOpponentToHaveLostLife() {
        Game game = initAndCreateGame();
        Player ai = game.getPlayers().get(1);
        Player opp = game.getPlayers().get(0);
        addCard("Theater of Horrors", ai);
        fillLibrary(ai, 3);
        Card land = addCardToZone("Mountain", ai, ZoneType.Library);
        putOnTop(land, ai);
        game.getPhaseHandler().devModeSet(PhaseType.UNTAP, ai);
        playUntilPhase(game, PhaseType.UPKEEP);
        playUntilStackClear(game);
        Card ex = game.getCardState(land);
        AssertJUnit.assertTrue(ex.isInZone(ZoneType.Exile));
        game.getPhaseHandler().devModeSet(PhaseType.MAIN1, ai);
        sync(game);
        AssertJUnit.assertNull("no opponent lost life: not playable", playableFrom(ex, ai, true));
        opp.loseLife(1, false, false, null);
        sync(game);
        AssertJUnit.assertNotNull("an opponent lost life: playable", playableFrom(ex, ai, true));
    }

    @Test
    public void hurlThroughHellLetsYouCastTheExiledCreature() {
        Game game = initAndCreateGame();
        Player ai = game.getPlayers().get(1);
        Player opp = game.getPlayers().get(0);
        ready("Prosper, Tome-Bound", ai);
        addCards("Swamp", 4, ai);
        addCards("Mountain", 4, ai);
        Card giant = addCard("Hill Giant", opp);
        Card spell = addCardToZone("Hurl Through Hell", ai, ZoneType.Hand);
        SpellAbility sa = spellOf(spell);
        sa.getTargets().add(giant);
        castAndResolve(game, sa, ai);
        Card ex = game.getCardState(giant);
        AssertJUnit.assertTrue(ex.isInZone(ZoneType.Exile));
        SpellAbility cast = playableFrom(ex, ai, false);
        AssertJUnit.assertNotNull("may cast the exiled creature", cast);
        castAndResolve(game, cast, ai);
        Card g = game.getCardState(giant);
        AssertJUnit.assertTrue(g.isInZone(ZoneType.Battlefield));
        AssertJUnit.assertEquals(ai, g.getController());
        AssertJUnit.assertEquals("Pact Boon on casting from exile", 1, countType(ai, "Treasure"));
    }

    @Test
    public void dauthiVoidwalkerExilesAndPlaysForFreeWithProsper() {
        Game game = initAndCreateGame();
        Player ai = game.getPlayers().get(1);
        Player opp = game.getPlayers().get(0);
        ready("Prosper, Tome-Bound", ai);
        Card dauthi = ready("Dauthi Voidwalker", ai);
        addCards("Swamp", 2, ai);
        Card giant = addCard("Hill Giant", opp);
        Card spell = addCardToZone("Go for the Throat", ai, ZoneType.Hand);
        SpellAbility sa = spellOf(spell);
        sa.getTargets().add(giant);
        castAndResolve(game, sa, ai);
        Card ex = game.getCardState(giant);
        AssertJUnit.assertTrue(ex.isInZone(ZoneType.Exile));
        AssertJUnit.assertEquals(1, ex.getCounters(forge.game.card.CounterType.getType("VOID")));
        SpellAbility act = dauthi.getSpellAbilities().stream().filter(x -> x.getApi() == forge.game.ability.ApiType.ChooseCard).findFirst().orElse(null);
        AssertJUnit.assertNotNull(act);
        castAndResolve(game, act, ai);
        ex = game.getCardState(giant);
        SpellAbility cast = playableFrom(ex, ai, false);
        AssertJUnit.assertNotNull("may play the chosen card", cast);
        castAndResolve(game, cast, ai);
        AssertJUnit.assertTrue(game.getCardState(giant).isInZone(ZoneType.Battlefield));
        AssertJUnit.assertEquals("Pact Boon for the free Hill Giant", 1, countType(ai, "Treasure"));
    }

    @Test
    public void marionetteMasterAndMayhemDevilOnTreasureSacrifice() {
        Game game = initAndCreateGame();
        Player ai = game.getPlayers().get(1);
        Player opp = game.getPlayers().get(0);
        Card mm = ready("Marionette Master", ai);
        mm.setCounters(CounterEnumType.P1P1, 3);
        ready("Mayhem Devil", ai);
        Card t = addToken("c_a_treasure_sac", ai);
        sync(game);
        AssertJUnit.assertEquals(4, mm.getNetPower());
        SpellAbility mana = t.getManaAbilities().get(0);
        mana.setActivatingPlayer(ai);
        ComputerUtil.playNoStack(ai, mana, game, false);
        ai.getManaPool().clearPool(false);
        playUntilStackClear(game);
        AssertJUnit.assertEquals("Marionette 4 + Mayhem Devil 1: " + gameStateToString(game), 15, opp.getLife());
    }

    @Test
    public void vancesBlastingCannonsTransformsOnThirdSpell() {
        Game game = initAndCreateGame();
        Player ai = game.getPlayers().get(1);
        Card vance = addCard("Vance's Blasting Cannons", ai);
        addCards("Swamp", 3, ai);
        for (int i = 0; i < 3; i++) {
            Card r = addCardToZone("Dark Ritual", ai, ZoneType.Hand);
            castAndResolve(game, spellOf(r), ai);
            ai.getManaPool().clearPool(false);
        }
        AssertJUnit.assertEquals("Spitfire Bastion", game.getCardState(vance).getName());
    }

    @Test
    public void lightUpTheStageCardsPlayableAndProsper() {
        Game game = initAndCreateGame();
        Player ai = game.getPlayers().get(1);
        ready("Prosper, Tome-Bound", ai);
        addCards("Mountain", 3, ai);
        addCards("Swamp", 1, ai);
        fillLibrary(ai, 3);
        Card ritual = addCardToZone("Dark Ritual", ai, ZoneType.Library);
        putOnTop(ritual, ai);
        Card land = addCardToZone("Swamp", ai, ZoneType.Library);
        putOnTop(land, ai);
        Card spell = addCardToZone("Light Up the Stage", ai, ZoneType.Hand);
        castAndResolve(game, spellOf(spell), ai);
        playLand(game.getCardState(land), ai);
        SpellAbility sa = playableFrom(game.getCardState(ritual), ai, false);
        AssertJUnit.assertNotNull(sa);
        castAndResolve(game, sa, ai);
        AssertJUnit.assertEquals("land + spell from exile: two Treasures", 2, countType(ai, "Treasure"));
    }

    @Test
    public void defileWithUrborgCountsAllLands() {
        Game game = initAndCreateGame();
        Player ai = game.getPlayers().get(1);
        Player opp = game.getPlayers().get(0);
        addCard("Urborg, Tomb of Yawgmoth", ai);
        addCards("Forest", 2, ai);
        Card wurm = addCard("Craw Wurm", opp);
        Card spell = addCardToZone("Defile", ai, ZoneType.Hand);
        SpellAbility sa = spellOf(spell);
        sa.getTargets().add(wurm);
        castAndResolve(game, sa, ai);
        Card w = game.getCardState(wurm);
        AssertJUnit.assertEquals("Urborg makes all 3 lands Swamps: -3/-3", 3, w.getNetPower());
        AssertJUnit.assertEquals(1, w.getNetToughness());
    }

    @Test
    public void cabalStrongholdCountsOnlyBasicSwamps() {
        Game game = initAndCreateGame();
        Player ai = game.getPlayers().get(1);
        Card cs = addCard("Cabal Stronghold", ai);
        addCard("Urborg, Tomb of Yawgmoth", ai);
        addCards("Swamp", 2, ai);
        addCards("Forest", 3, ai);
        sync(game);
        SpellAbility mana = null;
        for (SpellAbility m : cs.getManaAbilities()) {
            if (m.getPayCosts().getTotalMana().getCMC() == 3) {
                mana = m;
            }
        }
        AssertJUnit.assertNotNull(mana);
        mana.setActivatingPlayer(ai);
        int x = forge.game.ability.AbilityUtils.calculateAmount(cs, "X", mana);
        AssertJUnit.assertEquals("basic lands with subtype Swamp: 2 Swamps + 3 Forests made Swamps by Urborg; Urborg itself is not basic", 5, x);
    }

    @Test
    public void tendrilsOfAgonyStorm() {
        Game game = initAndCreateGame();
        Player ai = game.getPlayers().get(1);
        Player opp = game.getPlayers().get(0);
        addCards("Swamp", 2, ai);
        for (int i = 0; i < 2; i++) {
            Card r = addCardToZone("Dark Ritual", ai, ZoneType.Hand);
            castAndResolve(game, spellOf(r), ai);
        }
        Card t = addCardToZone("Tendrils of Agony", ai, ZoneType.Hand);
        SpellAbility sa = spellOf(t);
        sa.getTargets().add(opp);
        castAndResolve(game, sa, ai);
        AssertJUnit.assertEquals("storm count 2: three instances", 14, opp.getLife());
        AssertJUnit.assertEquals(26, ai.getLife());
    }

    @Test
    public void bontusMonumentDrainsEachOpponentAndReduces() {
        Game game = initAndCreateThreePlayerGame();
        Player ai = game.getPlayers().get(1);
        addCard("Bontu's Monument", ai);
        addCards("Swamp", 2, ai);
        Card c = addCardToZone("Diregraf Colossus", ai, ZoneType.Hand); // {2}{B}; {1}{B} with the Monument
        castAndResolve(game, spellOf(c), ai);
        AssertJUnit.assertTrue(game.getCardState(c).isInZone(ZoneType.Battlefield));
        AssertJUnit.assertEquals(38, oppLife(ai));
        AssertJUnit.assertEquals(21, ai.getLife());
    }

    @Test
    public void noxiousGhoulShrinksNonZombies() {
        Game game = initAndCreateGame();
        Player ai = game.getPlayers().get(1);
        Player opp = game.getPlayers().get(0);
        Card bear = addCard("Runeclaw Bear", opp);
        Card own = addCard("Hill Giant", ai);
        addCard("Noxious Ghoul", ai);
        Card z = addCardToZone("Gravecrawler", ai, ZoneType.Hand);
        enter(game, z);
        playUntilStackClear(game);
        AssertJUnit.assertEquals(1, game.getCardState(bear).getNetPower());
        AssertJUnit.assertEquals(2, game.getCardState(own).getNetPower());
        AssertJUnit.assertEquals("Gravecrawler is a Zombie: unaffected", 2, game.getCardState(z).getNetPower());
    }

    @Test
    public void gravecrawlerCastFromGraveyardWithZombie() {
        Game game = initAndCreateGame();
        Player ai = game.getPlayers().get(1);
        addCard("Champion of the Perished", ai);
        addCards("Swamp", 1, ai);
        Card g = addCardToZone("Gravecrawler", ai, ZoneType.Graveyard);
        sync(game);
        SpellAbility sa = playableFrom(g, ai, false);
        AssertJUnit.assertNotNull(sa);
        castAndResolve(game, sa, ai);
        AssertJUnit.assertTrue(game.getCardState(g).isInZone(ZoneType.Battlefield));
    }

    @Test
    public void accursedMarauderEachPlayerSacrificesInFourPlayer() {
        Game game = fourPlayerGame();
        Player ai = game.getPlayers().get(1);
        for (Player p : game.getPlayers()) {
            addCard("Runeclaw Bear", p);
        }
        Card m = addCardToZone("Accursed Marauder", ai, ZoneType.Hand);
        enter(game, m);
        playUntilStackClear(game);
        for (Player p : game.getPlayers()) {
            if (p == ai) {
                // the AI may legally sacrifice the Marauder itself instead of the Bear
                AssertJUnit.assertEquals(1, p.getCreaturesInPlay().size());
            } else {
                AssertJUnit.assertEquals(p + " sacrificed its Bear", 0, countNamed(p, "Runeclaw Bear", ZoneType.Battlefield));
            }
        }
    }

    @Test
    public void deathBaronAndUndeadWarchief() {
        Game game = initAndCreateGame();
        Player ai = game.getPlayers().get(1);
        addCard("Death Baron", ai);
        addCard("Undead Warchief", ai);
        Card g = addCard("Gravecrawler", ai); // 2/1 Zombie
        sync(game);
        AssertJUnit.assertEquals(5, g.getNetPower());
        AssertJUnit.assertEquals(3, g.getNetToughness());
        AssertJUnit.assertTrue(g.hasKeyword(Keyword.DEATHTOUCH));
    }

    @Test
    public void blasphemousEdictAlternativeCost() {
        Game game = initAndCreateGame();
        Player ai = game.getPlayers().get(1);
        Player opp = game.getPlayers().get(0);
        addCards("Runeclaw Bear", 7, ai);
        addCards("Runeclaw Bear", 6, opp);
        addCards("Swamp", 1, ai);
        Card e = addCardToZone("Blasphemous Edict", ai, ZoneType.Hand);
        sync(game);
        SpellAbility alt = null;
        for (SpellAbility sa : e.getAllPossibleAbilities(ai, true)) {
            if (sa.isSpell() && sa.getPayCosts().getTotalMana().getCMC() == 1) {
                alt = sa;
            }
        }
        AssertJUnit.assertNotNull("13 creatures: {B} alternative cost available", alt);
        castAndResolve(game, alt, ai);
        AssertJUnit.assertEquals(0, game.getCardsIn(ZoneType.Battlefield).stream().filter(Card::isCreature).count());
    }

    @Test
    public void witchsCottageUntappedWithThreeSwamps() {
        Game game = initAndCreateGame();
        Player ai = game.getPlayers().get(1);
        addCards("Swamp", 3, ai);
        Card dead = addCardToZone("Hill Giant", ai, ZoneType.Graveyard);
        Card cot = addCardToZone("Witch's Cottage", ai, ZoneType.Hand);
        playLand(cot, ai);
        AssertJUnit.assertFalse(game.getCardState(cot).isTapped());
        AssertJUnit.assertTrue("the creature card goes on top of the library", game.getCardState(dead).isInZone(ZoneType.Library));
    }

    @Test
    public void avengerOfZendikarPlantsAndLandfallCounters() {
        Game game = initAndCreateGame();
        Player ai = game.getPlayers().get(1);
        addCards("Forest", 5, ai);
        Card av = addCardToZone("Avenger of Zendikar", ai, ZoneType.Hand);
        enter(game, av);
        playUntilStackClear(game);
        AssertJUnit.assertEquals(5, countType(ai, "Plant"));
        Card f = addCardToZone("Forest", ai, ZoneType.Hand);
        playLand(f, ai);
        for (Card c : ai.getCardsIn(ZoneType.Battlefield)) {
            if (c.getType().hasCreatureType("Plant")) {
                AssertJUnit.assertEquals(1, c.getNetPower());
            }
        }
    }

    @Test
    public void azusaAndMinaAndDennLandPlays() {
        Game game = initAndCreateGame();
        Player ai = game.getPlayers().get(1);
        addCard("Azusa, Lost but Seeking", ai);
        addCard("Mina and Denn, Wildborn", ai);
        sync(game);
        AssertJUnit.assertEquals(4, ai.getMaxLandPlays());
    }

    @Test
    public void valakutExplorationWithGreenwardenEndStepDamage() {
        Game game = initAndCreateThreePlayerGame();
        Player ai = game.getPlayers().get(1);
        addCard("Valakut Exploration", ai);
        addCard("Ancient Greenwarden", ai); // summoning sick: must not attack
        fillLibrary(ai, 5);
        Card f = addCardToZone("Forest", ai, ZoneType.Hand);
        playLand(f, ai);
        AssertJUnit.assertEquals("Greenwarden: landfall twice, two cards exiled", 2, ai.getCardsIn(ZoneType.Exile).size());
        playUntilPhase(game, PhaseType.END_OF_TURN);
        playUntilStackClear(game);
        AssertJUnit.assertEquals(0, ai.getCardsIn(ZoneType.Exile).size());
        AssertJUnit.assertEquals("2 damage to each opponent", 36, oppLife(ai));
    }

    @Test
    public void omnathElementalDeathDealsThree() {
        Game game = initAndCreateGame();
        Player ai = game.getPlayers().get(1);
        Player opp = game.getPlayers().get(0);
        ready("Omnath, Locus of Rage", ai);
        Card f = addCardToZone("Forest", ai, ZoneType.Hand);
        playLand(f, ai);
        Card tok = null;
        for (Card c : ai.getCardsIn(ZoneType.Battlefield)) {
            if (c.isToken() && c.getType().hasCreatureType("Elemental")) {
                tok = c;
            }
        }
        AssertJUnit.assertNotNull(tok);
        Card gft = addCardToZone("Go for the Throat", ai, ZoneType.Hand);
        addCards("Swamp", 2, ai);
        SpellAbility kill = spellOf(gft);
        kill.getTargets().add(tok);
        castAndResolve(game, kill, ai);
        playUntilStackClear(game);
        AssertJUnit.assertEquals("3 damage (AI target: opponent): " + gameStateToString(game), 17, opp.getLife());
    }

    @Test
    public void rampageOfTheClansTokensGoToEachController() {
        Game game = initAndCreateThreePlayerGame();
        Player ai = game.getPlayers().get(1);
        Player opp = game.getPlayers().get(0);
        Player opp2 = game.getPlayers().get(2);
        addCard("Sol Ring", opp);
        addCard("Sol Ring", opp);
        addCard("Sol Ring", opp2);
        addCard("Sol Ring", ai);
        addCards("Forest", 4, ai);
        Card r = addCardToZone("Rampage of the Clans", ai, ZoneType.Hand);
        castAndResolve(game, spellOf(r), ai);
        AssertJUnit.assertEquals(2, countType(opp, "Centaur"));
        AssertJUnit.assertEquals(1, countType(opp2, "Centaur"));
        AssertJUnit.assertEquals(1, countType(ai, "Centaur"));
    }

    @Test
    public void evolutionSageProliferatesPoison() {
        Game game = initAndCreateGame();
        Player ai = game.getPlayers().get(1);
        Player opp = game.getPlayers().get(0);
        addCard("Evolution Sage", ai);
        opp.setPoisonCounters(2, ai);
        Card f = addCardToZone("Forest", ai, ZoneType.Hand);
        playLand(f, ai);
        AssertJUnit.assertEquals(3, opp.getPoisonCounters());
    }

    @Test
    public void tributeToTheWorldTreeBranches() {
        Game game = initAndCreateGame();
        Player ai = game.getPlayers().get(1);
        addCard("Tribute to the World Tree", ai);
        fillLibrary(ai, 3);
        Card bear = addCardToZone("Runeclaw Bear", ai, ZoneType.Hand);
        Card giant = addCardToZone("Hill Giant", ai, ZoneType.Hand);
        enter(game, bear);
        playUntilStackClear(game);
        AssertJUnit.assertEquals(2, game.getCardState(bear).getCounters(CounterEnumType.P1P1));
        enter(game, giant);
        playUntilStackClear(game);
        AssertJUnit.assertEquals(0, game.getCardState(giant).getCounters(CounterEnumType.P1P1));
        AssertJUnit.assertEquals(1, ai.getCardsIn(ZoneType.Hand).size());
    }

    @Test
    public void guardianProjectDrawsOnlyForUniqueNames() {
        Game game = initAndCreateGame();
        Player ai = game.getPlayers().get(1);
        addCard("Guardian Project", ai);
        fillLibrary(ai, 3);
        addCardToZone("Hill Giant", ai, ZoneType.Graveyard);
        Card giant = addCardToZone("Hill Giant", ai, ZoneType.Hand);
        Card bear = addCardToZone("Runeclaw Bear", ai, ZoneType.Hand);
        enter(game, giant);
        playUntilStackClear(game);
        AssertJUnit.assertEquals("same name as a card in graveyard: no draw", 1, ai.getCardsIn(ZoneType.Hand).size());
        enter(game, bear);
        playUntilStackClear(game);
        AssertJUnit.assertEquals("unique name: draw", 1, ai.getCardsIn(ZoneType.Hand).size());
    }

    @Test
    public void oakhameAdversaryCostReduction() {
        Game game = initAndCreateThreePlayerGame();
        Player ai = game.getPlayers().get(1);
        Player opp2 = game.getPlayers().get(2);
        addCards("Forest", 2, ai);
        addCard("Runeclaw Bear", opp2);
        Card o = addCardToZone("Oakhame Adversary", ai, ZoneType.Hand);
        castAndResolve(game, spellOf(o), ai);
        AssertJUnit.assertTrue(game.getCardState(o).isInZone(ZoneType.Battlefield));
    }

    @Test
    public void goldspanTreasureMakesTwoMana() {
        Game game = initAndCreateGame();
        Player ai = game.getPlayers().get(1);
        addCard("Goldspan Dragon", ai);
        Card t = addToken("c_a_treasure_sac", ai);
        sync(game);
        SpellAbility two = null;
        for (SpellAbility m : t.getManaAbilities()) {
            if (m.getDescription().contains("two")) {
                two = m;
            }
        }
        AssertJUnit.assertNotNull(two);
        two.setActivatingPlayer(ai);
        ComputerUtil.playNoStack(ai, two, game, false);
        AssertJUnit.assertEquals(2, ai.getManaPool().totalMana());
    }

    // ================================================================== batch 3

    @Test
    public void sibsigCeremonyAndAcererakBothTriggersDoTheirJob() {
        Game game = initAndCreateGame();
        Player ai = game.getPlayers().get(1);
        addCard("The Sibsig Ceremony", ai);
        addCards("Swamp", 1, ai);
        Card acer = addCardToZone("Acererak the Archlich", ai, ZoneType.Hand); // {2}{B} -> {B}
        castAndResolve(game, spellOf(acer), ai);
        AssertJUnit.assertEquals("venture happens whatever the order", 1, ai.getVenturedThisTurn());
        AssertJUnit.assertEquals("the Zombie Druid is created whatever the order", 1, countType(ai, "Druid"));
        AssertJUnit.assertFalse(game.getCardState(acer).isInZone(ZoneType.Battlefield));
    }

    @Test
    public void greenwardenDoublesTirelessTracker() {
        Game game = initAndCreateGame();
        Player ai = game.getPlayers().get(1);
        addCard("Ancient Greenwarden", ai);
        addCard("Tireless Tracker", ai);
        Card f = addCardToZone("Forest", ai, ZoneType.Hand);
        playLand(f, ai);
        AssertJUnit.assertEquals(2, countType(ai, "Clue"));
    }

    @Test
    public void toggoRockThrowDealsTwo() {
        Game game = initAndCreateGame();
        Player ai = game.getPlayers().get(1);
        Player opp = game.getPlayers().get(0);
        Card bear = ready("Runeclaw Bear", ai);
        addCard("Toggo, Goblin Weaponsmith", ai);
        addCards("Mountain", 1, ai);
        Card f = addCardToZone("Mountain", ai, ZoneType.Hand);
        playLand(f, ai);
        Card rock = null;
        for (Card c : ai.getCardsIn(ZoneType.Battlefield)) {
            if (c.getName().equals("Rock")) {
                rock = c;
            }
        }
        AssertJUnit.assertNotNull("Toggo landfall: a Rock", rock);
        rock.attachToEntity(bear, null);
        sync(game);
        SpellAbility thr = null;
        for (SpellAbility sa : bear.getSpellAbilities()) {
            if (sa.getApi() == forge.game.ability.ApiType.DealDamage) {
                thr = sa;
            }
        }
        AssertJUnit.assertNotNull("equipped creature has the Rock ability", thr);
        thr.getTargets().add(opp);
        castAndResolve(game, thr, ai);
        AssertJUnit.assertEquals(18, opp.getLife());
        AssertJUnit.assertEquals("Rock sacrificed", 0, countNamed(ai, "Rock", ZoneType.Battlefield));
        AssertJUnit.assertTrue(bear.isTapped());
    }

    @Test
    public void ragavanTreasureExileAndCastWithProsper() {
        Game game = initAndCreateGame();
        Player ai = game.getPlayers().get(1);
        Player opp = game.getPlayers().get(0);
        ready("Ragavan, Nimble Pilferer", ai);
        addCard("Prosper, Tome-Bound", ai); // summoning sick
        addCards("Swamp", 1, ai);
        addCards("Forest", 1, ai); // Ragavan grants no "any color" mana: the Bear needs real green
        for (int i = 0; i < 3; i++) {
            addCardToZone("Runeclaw Bear", opp, ZoneType.Library);
        }
        playUntilPhase(game, PhaseType.MAIN2);
        AssertJUnit.assertEquals("Ragavan hit: " + gameStateToString(game), 18, opp.getLife());
        AssertJUnit.assertEquals(1, countType(ai, "Treasure"));
        for (Card c : Lists.newArrayList(ai.getCardsIn(ZoneType.Battlefield))) {
            if (c.getType().hasSubtype("Treasure")) {
                game.getAction().exile(c, null, null); // set the Ragavan Treasure aside so it cannot pay
            }
        }
        Card ex = null;
        for (Card c : opp.getCardsIn(ZoneType.Exile)) {
            ex = c;
        }
        AssertJUnit.assertNotNull(ex);
        SpellAbility sa = playableFrom(ex, ai, false);
        AssertJUnit.assertNotNull("may cast the opponent's exiled card", sa);
        castAndResolve(game, sa, ai);
        AssertJUnit.assertTrue(game.getCardState(ex).isInZone(ZoneType.Battlefield));
        AssertJUnit.assertEquals("Pact Boon treasure (the Ragavan one was set aside)", 1, countType(ai, "Treasure"));
    }

    @Test
    public void stolenStrategyExilesFromEachOpponent() {
        Game game = initAndCreateThreePlayerGame();
        Player ai = game.getPlayers().get(1);
        addCard("Stolen Strategy", ai);
        fillLibrary(ai, 3);
        for (Player o : ai.getOpponents()) {
            addCardToZone("Runeclaw Bear", o, ZoneType.Library);
            addCardToZone("Runeclaw Bear", o, ZoneType.Library);
        }
        addCards("Swamp", 2, ai);
        game.getPhaseHandler().devModeSet(PhaseType.UNTAP, ai);
        playUntilPhase(game, PhaseType.UPKEEP);
        playUntilStackClear(game);
        int exiled = 0;
        Card one = null;
        for (Player o : ai.getOpponents()) {
            exiled += o.getCardsIn(ZoneType.Exile).size();
            if (!o.getCardsIn(ZoneType.Exile).isEmpty()) {
                one = o.getCardsIn(ZoneType.Exile).get(0);
            }
        }
        AssertJUnit.assertEquals("top card of each opponent", 2, exiled);
        game.getPhaseHandler().devModeSet(PhaseType.MAIN1, ai);
        SpellAbility sa = playableFrom(one, ai, false);
        AssertJUnit.assertNotNull("castable with black mana (any color)", sa);
        castAndResolve(game, sa, ai);
        AssertJUnit.assertTrue(game.getCardState(one).isInZone(ZoneType.Battlefield));
    }

    @Test
    public void oppositionAgentStealsTheSearchedCard() {
        Game game = initAndCreateGame();
        Player ai = game.getPlayers().get(1);
        Player opp = game.getPlayers().get(0);
        addCard("Opposition Agent", ai);
        Card land = addCardToZone("Forest", opp, ZoneType.Library);
        addCardToZone("Runeclaw Bear", opp, ZoneType.Library);
        addCards("Forest", 2, opp);
        Card rg = addCardToZone("Rampant Growth", opp, ZoneType.Hand);
        castAndResolve(game, spellOf(rg), opp);
        Card l = game.getCardState(land);
        AssertJUnit.assertTrue("the found card is exiled: " + l.getZone(), l.isInZone(ZoneType.Exile));
        game.getPhaseHandler().devModeSet(PhaseType.MAIN1, ai);
        SpellAbility play = playableFrom(l, ai, true);
        AssertJUnit.assertNotNull("Agent's controller may play it", play);
    }

    @Test
    public void praetorsGraspPlaysTheExiledCard() {
        Game game = initAndCreateGame();
        Player ai = game.getPlayers().get(1);
        Player opp = game.getPlayers().get(0);
        addCards("Swamp", 5, ai);
        addCardToZone("Hill Giant", opp, ZoneType.Library);
        Card g = addCardToZone("Praetor's Grasp", ai, ZoneType.Hand);
        SpellAbility sa = spellOf(g);
        sa.getTargets().add(opp);
        castAndResolve(game, sa, ai);
        AssertJUnit.assertEquals(1, opp.getCardsIn(ZoneType.Exile).size());
        Card ex = opp.getCardsIn(ZoneType.Exile).get(0);
        AssertJUnit.assertNotNull("may play it (mana must match normally; here 2 Swamps can't pay {3}{R})", ex);
        SpellAbility cast = null;
        for (SpellAbility s : ex.getAllPossibleAbilities(ai, false)) {
            if (s.isSpell()) {
                cast = s;
            }
        }
        AssertJUnit.assertNotNull("a cast option exists for the exiled card", cast);
    }

    @Test
    public void treasureVaultMakesXTreasures() {
        Game game = initAndCreateGame();
        Player ai = game.getPlayers().get(1);
        Card v = addCard("Treasure Vault", ai);
        addCards("Swamp", 4, ai);
        sync(game);
        SpellAbility sa = null;
        for (SpellAbility s : v.getSpellAbilities()) {
            if (s.getApi() == forge.game.ability.ApiType.Token) {
                sa = s;
            }
        }
        AssertJUnit.assertNotNull(sa);
        sa.setActivatingPlayer(ai);
        sa.setXManaCostPaid(2);
        castAndResolve(game, sa, ai);
        AssertJUnit.assertEquals(2, countType(ai, "Treasure"));
    }

    @Test
    public void heartlessSummoningCostAndShrink() {
        Game game = initAndCreateGame();
        Player ai = game.getPlayers().get(1);
        addCard("Heartless Summoning", ai);
        addCards("Swamp", 1, ai);
        Card c = addCardToZone("Diregraf Colossus", ai, ZoneType.Hand);
        castAndResolve(game, spellOf(c), ai);
        Card col = game.getCardState(c);
        AssertJUnit.assertTrue(col.isInZone(ZoneType.Battlefield));
        AssertJUnit.assertEquals(1, col.getNetPower());
    }

    @Test
    public void jhoirasFamiliarAndCabalPaladinWithLegendary() {
        Game game = initAndCreateThreePlayerGame();
        Player ai = game.getPlayers().get(1);
        addCard("Jhoira's Familiar", ai);
        addCard("Cabal Paladin", ai);
        addCards("Swamp", 2, ai); // Acererak {2}{B} -> {1}{B}
        Card acer = addCardToZone("Acererak the Archlich", ai, ZoneType.Hand);
        castAndResolve(game, spellOf(acer), ai);
        AssertJUnit.assertEquals("Paladin: 2 to each of 2 opponents (+ Tomb room may cost 1 each)", true, oppLife(ai) <= 36);
        AssertJUnit.assertEquals(1, ai.getVenturedThisTurn());
    }

    @Test
    public void fynnInkmothWithOhran() {
        Game game = initAndCreateGame();
        Player ai = game.getPlayers().get(1);
        addCard("Fynn, the Fangbearer", ai); // sick
        addCard("Ohran Frostfang", ai); // sick
        Card ink = ready("Inkmoth Nexus", ai);
        addCards("Forest", 1, ai);
        fillLibrary(ai, 3);
        SpellAbility anim = null;
        for (SpellAbility s : ink.getSpellAbilities()) {
            if (s.getApi() == forge.game.ability.ApiType.Animate) {
                anim = s;
            }
        }
        castAndResolve(game, anim, ai);
        AssertJUnit.assertTrue(game.getCardState(ink).isCreature());
        playUntilPhase(game, PhaseType.MAIN2);
        Player opp = game.getPlayers().get(0);
        AssertJUnit.assertEquals("infect 1 + Fynn 2: " + gameStateToString(game), 3, opp.getPoisonCounters());
        AssertJUnit.assertEquals(20, opp.getLife());
    }

    @Test
    public void kodamaAndToggoArePartnerCommanders() {
        initAndCreateGame();
        forge.deck.Deck deck = new forge.deck.Deck();
        deck.getOrCreate(forge.deck.DeckSection.Commander).add("Kodama of the East Tree", 1);
        deck.getOrCreate(forge.deck.DeckSection.Commander).add("Toggo, Goblin Weaponsmith", 1);
        List<RegisteredPlayer> players = Lists.newArrayList(
                RegisteredPlayer.forCommander(deck).setPlayer(new LobbyPlayerAi("p2", null)),
                RegisteredPlayer.forCommander(deck).setPlayer(new LobbyPlayerAi("p1", null)));
        GameRules rules = new GameRules(GameType.Commander);
        Game game = new Game(players, rules, new Match(rules, players, "Test"));
        for (Player p : game.getPlayers()) {
            p.initVariantsZones(p.getRegisteredPlayer());
        }
        game.setAge(GameStage.Play);
        Player ai = game.getPlayers().get(1);
        game.getPhaseHandler().devModeSet(PhaseType.MAIN1, ai);
        game.getPhaseHandler().onStackResolved();
        AssertJUnit.assertEquals(2, ai.getCommanders().size());
        AssertJUnit.assertEquals(2, ai.getCardsIn(ZoneType.Command).stream().filter(Card::isCommander).count());
        addCards("Mountain", 3, ai);
        Card toggo = null;
        for (Card c : ai.getCommanders()) {
            if (c.getName().startsWith("Toggo")) {
                toggo = c;
            }
        }
        sync(game);
        SpellAbility sa = playableFrom(toggo, ai, false);
        AssertJUnit.assertNotNull("Toggo castable from the command zone", sa);
        castAndResolve(game, sa, ai);
        AssertJUnit.assertTrue(game.getCardState(toggo).isInZone(ZoneType.Battlefield));
        AssertJUnit.assertEquals(1, ai.getCommanderCast(toggo));
        for (Card c : ai.getCommanders()) {
            if (c.getName().startsWith("Kodama")) {
                AssertJUnit.assertEquals("partner tax is separate", 0, ai.getCommanderCast(c));
            }
        }
    }

    // ================================================================== batch 4

    @Test
    public void shareTheSpoilsOnePlayPerTurnAndProsper() {
        Game game = initAndCreateThreePlayerGame();
        Player ai = game.getPlayers().get(1);
        addCard("Prosper, Tome-Bound", ai);
        fillLibrary(ai, 3);
        Card mountain = addCardToZone("Mountain", ai, ZoneType.Library);
        putOnTop(mountain, ai);
        for (Player o : ai.getOpponents()) {
            addCardToZone("Runeclaw Bear", o, ZoneType.Library);
            addCardToZone("Runeclaw Bear", o, ZoneType.Library);
        }
        addCards("Forest", 2, ai);
        Card sts = addCardToZone("Share the Spoils", ai, ZoneType.Hand);
        enter(game, sts);
        playUntilStackClear(game);
        AssertJUnit.assertEquals("top card of each player's library", 3, game.getCardsIn(ZoneType.Exile).size());
        playLand(game.getCardState(mountain), ai);
        AssertJUnit.assertTrue(game.getCardState(mountain).isInZone(ZoneType.Battlefield));
        AssertJUnit.assertEquals("when they do, exile the top card of their library", 1, ai.getCardsIn(ZoneType.Exile).size());
        AssertJUnit.assertEquals("Pact Boon", 1, countType(ai, "Treasure"));
        Card bear = null;
        for (Player o : ai.getOpponents()) {
            bear = o.getCardsIn(ZoneType.Exile).get(0);
        }
        sync(game);
        AssertJUnit.assertNull("only one card per turn from Share the Spoils", playableFrom(bear, ai, false));
    }

    @Test
    public void chandraFireArtisanRedirectsRemovedLoyalty() {
        Game game = initAndCreateGame();
        Player ai = game.getPlayers().get(1);
        Player opp = game.getPlayers().get(0);
        Card ch = addCard("Chandra, Fire Artisan", ai);
        ch.setCounters(CounterEnumType.LOYALTY, 2);
        addCards("Mountain", 1, ai);
        Card bolt = addCardToZone("Lightning Bolt", ai, ZoneType.Hand);
        SpellAbility sa = spellOf(bolt);
        sa.getTargets().add(ch);
        castAndResolve(game, sa, ai);
        AssertJUnit.assertTrue("Chandra dies", game.getCardState(ch).isInZone(ZoneType.Graveyard));
        AssertJUnit.assertEquals("only the 2 counters actually removed are dealt: " + gameStateToString(game), 18, opp.getLife());
    }

    @Test
    public void zulAshurLetsYouCastAZombieFromGraveyard() {
        Game game = initAndCreateGame();
        Player ai = game.getPlayers().get(1);
        Card zul = ready("Zul Ashur, Lich Lord", ai);
        addCards("Swamp", 3, ai);
        Card col = addCardToZone("Diregraf Colossus", ai, ZoneType.Graveyard);
        SpellAbility act = null;
        for (SpellAbility s : zul.getSpellAbilities()) {
            if (s.getApi() == forge.game.ability.ApiType.Effect) {
                act = s;
            }
        }
        act.getTargets().add(col);
        castAndResolve(game, act, ai);
        SpellAbility cast = playableFrom(game.getCardState(col), ai, false);
        AssertJUnit.assertNotNull("castable from graveyard this turn", cast);
        castAndResolve(game, cast, ai);
        AssertJUnit.assertTrue(game.getCardState(col).isInZone(ZoneType.Battlefield));
    }

    @Test
    public void bolasCitadelPlaysLandFromTop() {
        Game game = initAndCreateGame();
        Player ai = game.getPlayers().get(1);
        addCard("Bolas's Citadel", ai);
        fillLibrary(ai, 3);
        Card f = addCardToZone("Swamp", ai, ZoneType.Library);
        putOnTop(f, ai);
        playLand(f, ai);
        AssertJUnit.assertTrue(game.getCardState(f).isInZone(ZoneType.Battlefield));
        AssertJUnit.assertEquals(20, ai.getLife());
    }

    @Test
    public void prosperMysticArcanumLastsUntilEndOfYourNextTurn() {
        Game game = initAndCreateGame();
        Player ai = game.getPlayers().get(1);
        Player opp = game.getPlayers().get(0);
        ready("Prosper, Tome-Bound", ai);
        fillLibrary(ai, 6);
        fillLibrary(opp, 6);
        Card giant = addCardToZone("Hill Giant", ai, ZoneType.Library); // no lands: nobody can cast it
        putOnTop(giant, ai);
        game.getPhaseHandler().devModeSet(PhaseType.MAIN2, ai);
        playUntilPhase(game, PhaseType.END_OF_TURN);
        playUntilStackClear(game);
        Card ex = game.getCardState(giant);
        AssertJUnit.assertTrue(ex.isInZone(ZoneType.Exile));
        playUntilNextTurn(game); // to the opponent's turn
        AssertJUnit.assertEquals(opp, game.getPhaseHandler().getPlayerTurn());
        playUntilNextTurn(game); // back to the AI's next turn
        AssertJUnit.assertEquals(ai, game.getPhaseHandler().getPlayerTurn());
        playUntilPhase(game, PhaseType.MAIN1);
        sync(game);
        AssertJUnit.assertFalse("still playable during your next turn", game.getCardState(giant).mayPlay(ai).isEmpty());
        // the new Mystic Arcanum card exiled at this end step is a different card; run past the end of this turn
        playUntilNextTurn(game);
        sync(game);
        AssertJUnit.assertTrue("no longer playable after your next turn", game.getCardState(giant).mayPlay(ai).isEmpty());
    }
}
