package forge.ai.g2;

import java.util.List;

import com.google.common.collect.Lists;

import forge.ai.AITest;
import forge.ai.ComputerUtil;
import forge.ai.LobbyPlayerAi;
import forge.deck.Deck;
import forge.game.Game;
import forge.game.GameRules;
import forge.game.GameStage;
import forge.game.GameType;
import forge.game.Match;
import forge.game.ability.AbilityUtils;
import forge.game.card.Card;
import forge.game.card.CounterEnumType;
import forge.game.phase.PhaseType;
import forge.game.player.Player;
import forge.game.player.RegisteredPlayer;
import forge.game.spellability.SpellAbility;
import forge.game.zone.ZoneType;
import org.testng.AssertJUnit;
import org.testng.annotations.Test;

/**
 * Group g2 card-rules checks (Norn, Veyran, Jodah, Zhulodok decks) against upstream Forge.
 */
public class G2CardRulesTest extends AITest {

    protected Game fourPlayerGame() {
        initAndCreateGame();
        List<RegisteredPlayer> players = Lists.newArrayList();
        Deck d1 = new Deck();
        players.add(new RegisteredPlayer(d1).setPlayer(new LobbyPlayerAi("opp1", null)));
        players.add(new RegisteredPlayer(d1).setPlayer(new LobbyPlayerAi("hugo", null)));
        players.add(new RegisteredPlayer(d1).setPlayer(new LobbyPlayerAi("opp2", null)));
        players.add(new RegisteredPlayer(d1).setPlayer(new LobbyPlayerAi("opp3", null)));
        GameRules rules = new GameRules(GameType.Constructed);
        Match match = new Match(rules, players, "Test");
        Game game = new Game(players, rules, match);
        int team = 0;
        for (Player p : game.getPlayers()) {
            p.setTeam(team++);
        }
        Player hugo = game.getPlayers().get(1);
        game.setAge(GameStage.Play);
        game.getPhaseHandler().devModeSet(PhaseType.MAIN1, hugo);
        game.getPhaseHandler().onStackResolved();
        for (Player p : game.getPlayers()) {
            fillLibrary(p, 20);
        }
        return game;
    }

    protected Player hugo(Game game) {
        return game.getPlayers().get(1);
    }

    protected List<Player> opps(Game game) {
        List<Player> res = Lists.newArrayList();
        for (Player p : game.getPlayers()) {
            if (p != hugo(game)) {
                res.add(p);
            }
        }
        return res;
    }

    protected void cast(Game game, Card c, Player p) {
        SpellAbility sa = c.getFirstSpellAbility();
        sa.setActivatingPlayer(p);
        game.getAction().checkStateEffects(true);
        AssertJUnit.assertTrue("could not cast " + c, ComputerUtil.playStack(sa, p, game));
        resolveAll(game);
    }

    /** Resolve the stack, including triggers that are only put on the stack once it is empty. */
    protected void resolveAll(Game game) {
        for (int i = 0; i < 30 && !game.isGameOver(); i++) {
            if (!game.getStack().isEmpty()) {
                playUntilStackClear(game);
            }
            game.getAction().checkStateEffects(true);
            game.getTriggerHandler().runWaitingTriggers();
            game.getStack().addAllTriggeredAbilitiesToStack();
            if (game.getStack().isEmpty()) {
                break;
            }
        }
    }

    protected int count(Game game, String name, Player controller) {
        int i = 0;
        for (Card c : game.getCardsIn(ZoneType.Battlefield)) {
            if (c.getName().equals(name) && c.getController() == controller) {
                i++;
            }
        }
        return i;
    }

    protected void stackLibrary(Player p, String... topToBottom) {
        p.getZone(ZoneType.Library).removeAllCards(true);
        for (String name : topToBottom) {
            addCardToZone(name, p, ZoneType.Library);
        }
    }


    protected void castTargeting(Game game, Card c, Player p, forge.game.GameObject... targets) {
        SpellAbility sa = c.getFirstSpellAbility();
        sa.setActivatingPlayer(p);
        sa.resetTargets();
        for (forge.game.GameObject t : targets) {
            sa.getTargets().add(t);
        }
        game.getAction().checkStateEffects(true);
        AssertJUnit.assertTrue("could not cast " + c, ComputerUtil.playStack(sa, p, game));
        resolveAll(game);
    }

    protected int countIn(Player p, String name, ZoneType zone) {
        int i = 0;
        for (Card c : p.getCardsIn(zone)) {
            if (c.getName().equals(name)) {
                i++;
            }
        }
        return i;
    }

    protected String dump(Game game) {
        return gameStateToString(game) + "\nLOG: " + game.getGameLog().getLogEntries(null);
    }

    // ---------------- Elesh Norn, Mother of Machines ----------------

    @Test
    public void nornDoublesOwnEtbObserverAndSilencesOpponents() {
        Game game = fourPlayerGame();
        Player hugo = hugo(game);
        Player opp = opps(game).get(0);
        addCard("Elesh Norn, Mother of Machines", hugo);
        addCard("Soul Warden", hugo);
        addCard("Soul Warden", opp);
        addCards("Forest", 2, hugo);
        Card bears = addCardToZone("Grizzly Bears", hugo, ZoneType.Hand);
        cast(game, bears, hugo);
        AssertJUnit.assertEquals("bears on battlefield", 1, count(game, "Grizzly Bears", hugo));
        AssertJUnit.assertEquals("own Soul Warden triggers twice", 22, hugo.getLife());
        AssertJUnit.assertEquals("opponent Soul Warden does not trigger", 20, opp.getLife());
    }

    @Test
    public void nornOpponentPermanentEnteringStillDoublesMineAndSilencesItsOwnEtb() {
        Game game = fourPlayerGame();
        Player hugo = hugo(game);
        Player opp = opps(game).get(0);
        addCard("Elesh Norn, Mother of Machines", hugo);
        addCard("Soul Warden", hugo);
        addCards("Plains", 2, opp);
        game.getPhaseHandler().devModeSet(PhaseType.MAIN1, opp);
        Card wall = addCardToZone("Wall of Omens", opp, ZoneType.Hand);
        int oppHand = opp.getCardsIn(ZoneType.Hand).size();
        cast(game, wall, opp);
        AssertJUnit.assertEquals("wall resolved", 1, count(game, "Wall of Omens", opp));
        AssertJUnit.assertEquals("own Soul Warden triggers twice for an opponent's creature", 22, hugo.getLife());
        AssertJUnit.assertEquals("opponent's Wall of Omens ETB must not trigger", oppHand - 1, opp.getCardsIn(ZoneType.Hand).size());
    }

    @Test
    public void nornPlusPanharmoniconTriplesWallOfOmens() {
        Game game = fourPlayerGame();
        Player hugo = hugo(game);
        addCard("Elesh Norn, Mother of Machines", hugo);
        addCard("Panharmonicon", hugo);
        addCards("Plains", 2, hugo);
        Card wall = addCardToZone("Wall of Omens", hugo, ZoneType.Hand);
        cast(game, wall, hugo);
        AssertJUnit.assertEquals("Wall of Omens draws 3 (base + Norn + Panharmonicon)", 3, hugo.getCardsIn(ZoneType.Hand).size());
    }

    @Test
    public void nornDoublesCatharsCrusade() {
        Game game = fourPlayerGame();
        Player hugo = hugo(game);
        Card norn = addCard("Elesh Norn, Mother of Machines", hugo);
        addCard("Cathars' Crusade", hugo);
        addCards("Forest", 2, hugo);
        Card bears = addCardToZone("Grizzly Bears", hugo, ZoneType.Hand);
        cast(game, bears, hugo);
        Card b = findCardWithName(game, "Grizzly Bears");
        AssertJUnit.assertEquals("Cathars' Crusade triggers twice -> 2 counters on Norn", 2, norn.getCounters(CounterEnumType.P1P1));
        AssertJUnit.assertEquals("2 counters on Bears", 2, b.getCounters(CounterEnumType.P1P1));
    }

    // ---------------- Veyran, Voice of Duality ----------------

    @Test
    public void veyranDoublesGuttersnipeAndOwnMagecraft() {
        Game game = fourPlayerGame();
        Player hugo = hugo(game);
        Card veyran = addCard("Veyran, Voice of Duality", hugo);
        addCard("Guttersnipe", hugo);
        addCards("Island", 1, hugo);
        Card opt = addCardToZone("Opt", hugo, ZoneType.Hand);
        cast(game, opt, hugo);
        for (Player o : opps(game)) {
            AssertJUnit.assertEquals("Guttersnipe triggers twice for " + o, 16, o.getLife());
        }
        AssertJUnit.assertEquals("Veyran magecraft triggers twice", 4, veyran.getNetPower());
    }

    @Test
    public void veyranDoesNotDoubleNonInstantSorceryCasts() {
        Game game = fourPlayerGame();
        Player hugo = hugo(game);
        addCard("Veyran, Voice of Duality", hugo);
        addCard("Firebrand Archer", hugo);
        addCards("Island", 2, hugo);
        Card stone = addCardToZone("Mind Stone", hugo, ZoneType.Hand);
        cast(game, stone, hugo);
        for (Player o : opps(game)) {
            AssertJUnit.assertEquals("Firebrand Archer not doubled for an artifact spell " + o, 19, o.getLife());
        }
    }

    @Test
    public void veyranNivMizzetOnlyDoublesOwnCasts() {
        Game game = fourPlayerGame();
        Player hugo = hugo(game);
        Player opp = opps(game).get(0);
        addCard("Veyran, Voice of Duality", hugo);
        addCard("Niv-Mizzet, Parun", hugo);
        addCards("Island", 1, opp);
        Card opt = addCardToZone("Opt", opp, ZoneType.Hand);
        int before = hugo.getCardsIn(ZoneType.Hand).size();
        cast(game, opt, opp);
        AssertJUnit.assertEquals("opponent's instant: Niv draws exactly 1", before + 1, hugo.getCardsIn(ZoneType.Hand).size());

        addCards("Island", 1, hugo);
        Card opt2 = addCardToZone("Opt", hugo, ZoneType.Hand);
        before = hugo.getCardsIn(ZoneType.Hand).size();
        cast(game, opt2, hugo);
        // -1 Opt cast, +1 Opt draw, +2 Niv (doubled)
        AssertJUnit.assertEquals("own instant: Niv draws 2 + Opt draws 1", before - 1 + 3, hugo.getCardsIn(ZoneType.Hand).size());
    }

    // ---------------- Zhulodok, Void Gorger ----------------

    @Test
    public void zhulodokGivesTwoCascades() {
        Game game = fourPlayerGame();
        Player hugo = hugo(game);
        addCard("Zhulodok, Void Gorger", hugo);
        addCards("Wastes", 7, hugo);
        stackLibrary(hugo, "Grizzly Bears", "Grizzly Bears", "Wastes", "Wastes", "Wastes", "Wastes", "Wastes", "Wastes");
        Card sire = addCardToZone("Sire of Seven Deaths", hugo, ZoneType.Hand);
        cast(game, sire, hugo);
        AssertJUnit.assertEquals("Sire resolved", 1, count(game, "Sire of Seven Deaths", hugo));
        AssertJUnit.assertEquals("two cascades -> two free Bears", 2, count(game, "Grizzly Bears", hugo));
    }

    @Test
    public void zhulodokEchoesOfEternityDoublesBothCascades() {
        Game game = fourPlayerGame();
        Player hugo = hugo(game);
        addCard("Zhulodok, Void Gorger", hugo);
        addCard("Echoes of Eternity", hugo);
        addCards("Wastes", 7, hugo);
        stackLibrary(hugo, "Grizzly Bears", "Grizzly Bears", "Grizzly Bears", "Grizzly Bears",
                "Wastes", "Wastes", "Wastes", "Wastes", "Wastes", "Wastes", "Wastes", "Wastes");
        Card sire = addCardToZone("Sire of Seven Deaths", hugo, ZoneType.Hand);
        cast(game, sire, hugo);
        AssertJUnit.assertEquals("Sire + Echoes copy (token)", 2, count(game, "Sire of Seven Deaths", hugo));
        AssertJUnit.assertEquals("four cascades (2 x Echoes) -> four free Bears", 4, count(game, "Grizzly Bears", hugo));
    }

    // ---------------- Jodah, the Unifier ----------------

    @Test
    public void jodahPumpAndLegendaryCascade() {
        Game game = fourPlayerGame();
        Player hugo = hugo(game);
        Card jodah = addCard("Jodah, the Unifier", hugo);
        Card kenrith = addCard("Kenrith, the Returned King", hugo);
        game.getAction().checkStateEffects(true);
        AssertJUnit.assertEquals("Jodah 5/5 +2", 7, jodah.getNetPower());
        AssertJUnit.assertEquals("Kenrith 5/5 +2", 7, kenrith.getNetPower());

        addCards("Plains", 2, hugo);
        addCards("Swamp", 2, hugo);
        // Bears (nonlegendary), Sheoldred (legendary, same MV 4: not lesser), Skrelv (legendary MV 1)
        stackLibrary(hugo, "Grizzly Bears", "Sheoldred, the Apocalypse", "Skrelv, Defector Mite",
                "Plains", "Plains", "Plains", "Plains", "Plains", "Plains", "Plains", "Plains", "Plains", "Plains");
        Card sheoldred = addCardToZone("Sheoldred, the Apocalypse", hugo, ZoneType.Hand);
        cast(game, sheoldred, hugo);
        AssertJUnit.assertEquals("Skrelv cast for free", 1, count(game, "Skrelv, Defector Mite", hugo));
        AssertJUnit.assertEquals("Jodah now +4 (Jodah, Kenrith, Sheoldred, Skrelv)", 9, jodah.getNetPower());
        AssertJUnit.assertEquals("library keeps Bears + library Sheoldred + 10 Plains", 12, hugo.getCardsIn(ZoneType.Library).size());
        AssertJUnit.assertEquals("nothing left in exile", 0, hugo.getCardsIn(ZoneType.Exile).size());
    }

    // ---------------- Tron + Planar Nexus ----------------

    @Test
    public void planarNexusCountsAsMineAndPowerPlant() {
        Game game = fourPlayerGame();
        Player hugo = hugo(game);
        Card tower = addCard("Urza's Tower", hugo);
        addCard("Planar Nexus", hugo);
        game.getAction().checkStateEffects(true);
        AssertJUnit.assertTrue("Planar Nexus + Tower = Tron", hugo.hasUrzaLands());
        SpellAbility mana = tower.getManaAbilities().get(0);
        mana.setActivatingPlayer(hugo);
        int amt = AbilityUtils.calculateAmount(tower, "UrzaAmount", mana);
        AssertJUnit.assertEquals("Tower makes 3", 3, amt);
    }

    // ---------------- Vorinclex, Monstrous Raider ----------------

    @Test
    public void vorinclexDoublesOwnPlaneswalkerLoyaltyCast() {
        Game game = fourPlayerGame();
        Player hugo = hugo(game);
        addCard("Vorinclex, Monstrous Raider", hugo);
        addCards("Forest", 5, hugo);
        Card wrenn = addCardToZone("Wrenn and Seven", hugo, ZoneType.Hand);
        cast(game, wrenn, hugo);
        Card w = findCardWithName(game, "Wrenn and Seven");
        AssertJUnit.assertNotNull(w);
        AssertJUnit.assertEquals("Wrenn and Seven (5) enters with 10 loyalty", 10, w.getCounters(CounterEnumType.LOYALTY));
    }

    @Test
    public void vorinclexHalvesOpponentPlaneswalkerLoyaltyCast() {
        Game game = fourPlayerGame();
        Player hugo = hugo(game);
        Player opp = opps(game).get(0);
        addCard("Vorinclex, Monstrous Raider", hugo);
        addCards("Mountain", 2, opp);
        addCards("Island", 2, opp);
        Card ral = addCardToZone("Ral, Crackling Wit", opp, ZoneType.Hand);
        game.getPhaseHandler().devModeSet(PhaseType.MAIN1, opp);
        cast(game, ral, opp);
        Card r = findCardWithName(game, "Ral, Crackling Wit");
        AssertJUnit.assertNotNull(r);
        AssertJUnit.assertEquals("opponent's Ral (4) enters with 2 loyalty", 2, r.getCounters(CounterEnumType.LOYALTY));
    }

    // ================= batch 2 =================

    /** CR 607.2a: both creatures exiled by a doubled Fiend Hunter ETB are "the exiled card" for its linked LTB ability. */
    @Test
    public void fiendHunterDoubledByNornReturnsBothCreatures() {
        Game game = fourPlayerGame();
        Player hugo = hugo(game);
        Player opp = opps(game).get(0);
        addCard("Elesh Norn, Mother of Machines", hugo);
        addCard("Grizzly Bears", opp);
        addCard("Hill Giant", opp);
        addCards("Plains", 3, hugo);
        addCards("Mountain", 1, hugo);
        Card fh = addCardToZone("Fiend Hunter", hugo, ZoneType.Hand);
        cast(game, fh, hugo);
        Card fhBf = findCardWithName(game, "Fiend Hunter");
        AssertJUnit.assertNotNull(fhBf);
        AssertJUnit.assertEquals("both opposing creatures exiled by the two ETB triggers: " + dump(game), 2,
                countIn(opp, "Grizzly Bears", ZoneType.Exile) + countIn(opp, "Hill Giant", ZoneType.Exile));
        Card bolt = addCardToZone("Lightning Bolt", hugo, ZoneType.Hand);
        castTargeting(game, bolt, hugo, fhBf);
        AssertJUnit.assertEquals("Fiend Hunter died", 1, countIn(hugo, "Fiend Hunter", ZoneType.Graveyard));
        AssertJUnit.assertEquals("Bears returned: " + dump(game), 1, count(game, "Grizzly Bears", opp));
        AssertJUnit.assertEquals("Hill Giant returned: " + dump(game), 1, count(game, "Hill Giant", opp));
    }

    /** Same linked-ability question for Skyclave Apparition (Norn deck). Each exiled card's owner should get an X/X. */
    @Test
    public void skyclaveApparitionDoubledByNorn() {
        Game game = fourPlayerGame();
        Player hugo = hugo(game);
        Player opp1 = opps(game).get(0);
        Player opp2 = opps(game).get(1);
        addCard("Elesh Norn, Mother of Machines", hugo);
        addCard("Grizzly Bears", opp1);
        addCard("Hill Giant", opp2);
        addCards("Plains", 3, hugo);
        addCards("Mountain", 1, hugo);
        Card sky = addCardToZone("Skyclave Apparition", hugo, ZoneType.Hand);
        cast(game, sky, hugo);
        Card skyBf = findCardWithName(game, "Skyclave Apparition");
        AssertJUnit.assertEquals("two exiles: " + dump(game), 2,
                countIn(opp1, "Grizzly Bears", ZoneType.Exile) + countIn(opp2, "Hill Giant", ZoneType.Exile));
        Card bolt = addCardToZone("Lightning Bolt", hugo, ZoneType.Hand);
        castTargeting(game, bolt, hugo, skyBf);
        int opp1Tokens = 0, opp2Tokens = 0, opp1P = -1, opp2P = -1;
        for (Card c : game.getCardsIn(ZoneType.Battlefield)) {
            if (c.isToken() && c.getType().hasCreatureType("Illusion")) {
                if (c.getController() == opp1) { opp1Tokens++; opp1P = c.getNetPower(); }
                if (c.getController() == opp2) { opp2Tokens++; opp2P = c.getNetPower(); }
            }
        }
        String st = "opp1Tokens=" + opp1Tokens + " opp1P=" + opp1P + " opp2Tokens=" + opp2Tokens + " opp2P=" + opp2P;
        System.out.println("DEBUG skyclave " + st);
        AssertJUnit.assertEquals("opp1 gets one Illusion: " + st, 1, opp1Tokens);
        AssertJUnit.assertEquals("opp1 Illusion is 2/2: " + st, 2, opp1P);
        AssertJUnit.assertEquals("opp2 gets one Illusion: " + st, 1, opp2Tokens);
        AssertJUnit.assertEquals("opp2 Illusion is 4/4: " + st, 4, opp2P);
    }

    @Test
    public void annieJoinsUpDoublesJodahTrigger() {
        Game game = fourPlayerGame();
        Player hugo = hugo(game);
        addCard("Jodah, the Unifier", hugo);
        addCard("Annie Joins Up", hugo);
        addCards("Plains", 2, hugo);
        addCards("Swamp", 2, hugo);
        stackLibrary(hugo, "Skrelv, Defector Mite", "Grizzly Bears", "Kenrith, the Returned King", "Glissa Sunslayer",
                "Plains", "Plains", "Plains", "Plains", "Plains", "Plains", "Plains", "Plains");
        Card sheoldred = addCardToZone("Sheoldred, the Apocalypse", hugo, ZoneType.Hand);
        cast(game, sheoldred, hugo);
        String st = dump(game);
        AssertJUnit.assertEquals("Skrelv cast by first trigger: " + st, 1, count(game, "Skrelv, Defector Mite", hugo));
        AssertJUnit.assertEquals("Glissa cast by second trigger: " + st, 1, count(game, "Glissa Sunslayer", hugo));
        AssertJUnit.assertEquals("nothing stranded in exile: " + st, 0, hugo.getCardsIn(ZoneType.Exile).size());
    }

    @Test
    public void itThatBetraysStealsPortalSacrifices() {
        Game game = fourPlayerGame();
        Player hugo = hugo(game);
        addCard("It That Betrays", hugo);
        addCards("Wastes", 9, hugo);
        for (Player o : opps(game)) {
            addCards("Grizzly Bears", 3, o);
        }
        Card portal = addCardToZone("Portal to Phyrexia", hugo, ZoneType.Hand);
        cast(game, portal, hugo);
        String st = dump(game);
        AssertJUnit.assertEquals("hugo controls the 9 sacrificed Bears: " + st, 9, count(game, "Grizzly Bears", hugo));
        for (Player o : opps(game)) {
            AssertJUnit.assertEquals("no bears left in graveyard of " + o, 0, countIn(o, "Grizzly Bears", ZoneType.Graveyard));
        }
    }

    @Test
    public void voidWinnowerZeroIsEven() {
        Game game = fourPlayerGame();
        Player hugo = hugo(game);
        Player opp = opps(game).get(0);
        addCard("Void Winnower", hugo);
        addCards("Island", 2, opp);
        game.getPhaseHandler().devModeSet(PhaseType.MAIN1, opp);
        Card thopter = addCardToZone("Ornithopter", opp, ZoneType.Hand);
        Card opt = addCardToZone("Opt", opp, ZoneType.Hand);
        Card bears = addCardToZone("Grizzly Bears", opp, ZoneType.Hand);
        game.getAction().checkStateEffects(true);
        SpellAbility saT = thopter.getFirstSpellAbility(); saT.setActivatingPlayer(opp);
        SpellAbility saO = opt.getFirstSpellAbility(); saO.setActivatingPlayer(opp);
        SpellAbility saB = bears.getFirstSpellAbility(); saB.setActivatingPlayer(opp);
        // canPlay() does not consult CantBeCast; the cast path does (Spell.checkRestrictions)
        AssertJUnit.assertFalse("Ornithopter (MV 0) not castable", ComputerUtil.playStack(saT, opp, game));
        AssertJUnit.assertFalse("Bears (MV 2) not castable", ComputerUtil.playStack(saB, opp, game));
        AssertJUnit.assertTrue("Opt (MV 1) castable", ComputerUtil.playStack(saO, opp, game));
        AssertJUnit.assertEquals("Ornithopter back in hand", 1, countIn(opp, "Ornithopter", ZoneType.Hand));
    }

    @Test
    public void emrakulPromisedEndCostReduction() {
        Game game = fourPlayerGame();
        Player hugo = hugo(game);
        addCardToZone("Forest", hugo, ZoneType.Graveyard);
        addCardToZone("Grizzly Bears", hugo, ZoneType.Graveyard);
        addCardToZone("Mind Stone", hugo, ZoneType.Graveyard);
        addCardToZone("Opt", hugo, ZoneType.Graveyard);
        addCardToZone("Divination", hugo, ZoneType.Graveyard);
        addCardToZone("Ornithopter", hugo, ZoneType.Graveyard);
        addCards("Wastes", 8, hugo);
        Card emra = addCardToZone("Emrakul, the Promised End", hugo, ZoneType.Hand);
        SpellAbility sa = emra.getFirstSpellAbility();
        sa.setActivatingPlayer(hugo);
        game.getAction().checkStateEffects(true);
        AssertJUnit.assertTrue("Emrakul castable for 8 with 5 card types in graveyard", ComputerUtil.playStack(sa, hugo, game));
    }

    @Test
    public void veyranMagecraftOnCopyFromNarsetsReversal() {
        Game game = fourPlayerGame();
        Player hugo = hugo(game);
        Card veyran = addCard("Veyran, Voice of Duality", hugo);
        addCard("Storm-Kiln Artist", hugo);
        addCards("Island", 3, hugo);
        Card opt = addCardToZone("Opt", hugo, ZoneType.Hand);
        Card rev = addCardToZone("Narset's Reversal", hugo, ZoneType.Hand);
        SpellAbility optSa = opt.getFirstSpellAbility();
        optSa.setActivatingPlayer(hugo);
        AssertJUnit.assertTrue(ComputerUtil.playStack(optSa, hugo, game));
        SpellAbility optOnStack = game.getStack().peekAbility();
        SpellAbility revSa = rev.getFirstSpellAbility();
        revSa.setActivatingPlayer(hugo);
        revSa.resetTargets();
        revSa.getTargets().add(optOnStack);
        AssertJUnit.assertTrue(ComputerUtil.playStack(revSa, hugo, game));
        resolveAll(game);
        String st = dump(game);
        // magecraft: Opt cast, Reversal cast, Opt copy = 3 events, each doubled by Veyran
        AssertJUnit.assertEquals("Veyran +6/+6: " + st, 8, veyran.getNetPower());
        AssertJUnit.assertEquals("6 Treasures: " + st, 6, count(game, "Treasure Token", hugo));
        AssertJUnit.assertEquals("Opt returned to hand", 1, countIn(hugo, "Opt", ZoneType.Hand));
    }

    @Test
    public void eleshNornMomTaxesOpponentDamage() {
        Game game = fourPlayerGame();
        Player hugo = hugo(game);
        Player opp = opps(game).get(0);
        addCard("Elesh Norn", hugo);
        addCards("Mountain", 1, opp);
        game.getPhaseHandler().devModeSet(PhaseType.MAIN1, opp);
        Card bolt = addCardToZone("Lightning Bolt", opp, ZoneType.Hand);
        castTargeting(game, bolt, opp, hugo);
        AssertJUnit.assertEquals("hugo took 3", 17, hugo.getLife());
        AssertJUnit.assertEquals("opponent (no mana left) loses 2: " + dump(game), 18, opp.getLife());
    }

    // ================= batch 3 =================

    @Test
    public void fiendHunterControlWithoutNornReturnsCreature() {
        Game game = fourPlayerGame();
        Player hugo = hugo(game);
        Player opp = opps(game).get(0);
        addCard("Hill Giant", opp);
        addCards("Plains", 3, hugo);
        addCards("Mountain", 1, hugo);
        Card fh = addCardToZone("Fiend Hunter", hugo, ZoneType.Hand);
        cast(game, fh, hugo);
        AssertJUnit.assertEquals("Hill Giant exiled", 1, countIn(opp, "Hill Giant", ZoneType.Exile));
        Card bolt = addCardToZone("Lightning Bolt", hugo, ZoneType.Hand);
        castTargeting(game, bolt, hugo, findCardWithName(game, "Fiend Hunter"));
        AssertJUnit.assertEquals("Hill Giant returned", 1, count(game, "Hill Giant", opp));
    }

    @Test
    public void graspOfFateWithNornExilesAndReturnsSix() {
        Game game = fourPlayerGame();
        Player hugo = hugo(game);
        addCard("Elesh Norn, Mother of Machines", hugo);
        for (Player o : opps(game)) {
            addCards("Grizzly Bears", 2, o);
        }
        addCards("Plains", 5, hugo);
        Card grasp = addCardToZone("Grasp of Fate", hugo, ZoneType.Hand);
        cast(game, grasp, hugo);
        int exiled = 0;
        for (Player o : opps(game)) {
            exiled += countIn(o, "Grizzly Bears", ZoneType.Exile);
        }
        AssertJUnit.assertEquals("two triggers x one per opponent: " + dump(game), 6, exiled);
        Card dis = addCardToZone("Disenchant", hugo, ZoneType.Hand);
        castTargeting(game, dis, hugo, findCardWithName(game, "Grasp of Fate"));
        for (Player o : opps(game)) {
            AssertJUnit.assertEquals("all bears back for " + o + ": " + dump(game), 2, count(game, "Grizzly Bears", o));
        }
    }

    @Test
    public void kellanTriggersOnJodahFreeCast() {
        Game game = fourPlayerGame();
        Player hugo = hugo(game);
        addCard("Jodah, the Unifier", hugo);
        addCard("Kellan, the Kid", hugo);
        addCards("Plains", 2, hugo);
        addCards("Swamp", 2, hugo);
        stackLibrary(hugo, "Skrelv, Defector Mite", "Plains", "Plains", "Plains", "Plains", "Plains", "Plains");
        addCardToZone("Ornithopter", hugo, ZoneType.Hand);
        Card sheoldred = addCardToZone("Sheoldred, the Apocalypse", hugo, ZoneType.Hand);
        cast(game, sheoldred, hugo);
        String st = dump(game);
        AssertJUnit.assertEquals("Skrelv cast from exile by Jodah: " + st, 1, count(game, "Skrelv, Defector Mite", hugo));
        AssertJUnit.assertEquals("Kellan cast Ornithopter (MV 0 <= 1) from hand: " + st, 1, count(game, "Ornithopter", hugo));
    }

    @Test
    public void jinGitaxiasCountersOnlyFirstOpponentSpellEachTurn() {
        Game game = fourPlayerGame();
        Player hugo = hugo(game);
        Player opp1 = opps(game).get(0);
        Player opp2 = opps(game).get(1);
        addCard("Jin-Gitaxias, Progress Tyrant", hugo);
        addCards("Island", 1, opp1);
        addCards("Island", 1, opp2);
        Card opt1 = addCardToZone("Opt", opp1, ZoneType.Hand);
        Card opt2 = addCardToZone("Opt", opp2, ZoneType.Hand);
        cast(game, opt1, opp1);
        AssertJUnit.assertEquals("opp1 Opt countered (no draw)", 0, opp1.getCardsIn(ZoneType.Hand).size());
        cast(game, opt2, opp2);
        AssertJUnit.assertEquals("opp2 Opt resolves (draw 1): " + dump(game), 1, opp2.getCardsIn(ZoneType.Hand).size());
    }

    @Test
    public void kozilekGreatDistortionDrawsUpToSeven() {
        Game game = fourPlayerGame();
        Player hugo = hugo(game);
        addCards("Wastes", 10, hugo);
        addCardToZone("Plains", hugo, ZoneType.Hand);
        addCardToZone("Plains", hugo, ZoneType.Hand);
        Card koz = addCardToZone("Kozilek, the Great Distortion", hugo, ZoneType.Hand);
        cast(game, koz, hugo);
        AssertJUnit.assertEquals("Kozilek resolved", 1, count(game, "Kozilek, the Great Distortion", hugo));
        AssertJUnit.assertEquals("hand refilled to 7", 7, hugo.getCardsIn(ZoneType.Hand).size());
    }
}
