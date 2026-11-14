package forge.cards;

import java.util.ArrayList;
import java.util.List;

import com.google.common.collect.Lists;

import forge.ai.AITest;
import forge.ai.ComputerUtil;
import forge.ai.LobbyPlayerAi;
import forge.deck.Deck;
import forge.deck.DeckSection;
import forge.game.Game;
import forge.game.GameEntity;
import forge.game.GameObject;
import forge.game.GameRules;
import forge.game.GameStage;
import forge.game.GameType;
import forge.game.Match;
import forge.game.card.Card;
import forge.game.card.CounterEnumType;
import forge.game.combat.Combat;
import forge.game.keyword.Keyword;
import forge.game.phase.PhaseType;
import forge.game.player.Player;
import forge.game.player.RegisteredPlayer;
import forge.game.spellability.SpellAbility;
import forge.game.zone.ZoneType;
import org.testng.AssertJUnit;
import org.testng.annotations.Test;

/** Group g1 (Kaalia, Henzie, Henzie Goon, Teysa decks): rules checks of the cards these decks play. */
public class G1DeckCardsTest extends AITest {
    protected static final long T = 120000;

    protected Game game;
    protected Player me;
    protected List<Player> opps;

    protected Game newGame(final int n) {
        final List<RegisteredPlayer> players = Lists.newArrayList();
        for (int i = 0; i < n; i++) {
            players.add(new RegisteredPlayer(new Deck()).setPlayer(new LobbyPlayerAi("p" + i, null)));
        }
        final GameRules rules = new GameRules(GameType.Constructed);
        game = new Game(players, rules, new Match(rules, players, "Test"));
        me = game.getPlayers().get(0);
        opps = new ArrayList<>(game.getPlayers().subList(1, n));
        game.setAge(GameStage.Play);
        game.getPhaseHandler().devModeSet(PhaseType.MAIN1, me);
        game.getPhaseHandler().onStackResolved();
        fillLibraries();
        return game;
    }

    protected void fillLibraries() {
        for (final Player p : game.getPlayers()) {
            for (int i = 0; i < 15; i++) {
                addCardToZone("Island", p, ZoneType.Library);
            }
        }
    }

    protected Card bf(final String name, final Player p) {
        final Card c = addCard(name, p);
        c.setSickness(false);
        return c;
    }

    protected Card hand(final String name, final Player p) {
        return addCardToZone(name, p, ZoneType.Hand);
    }

    /** Casts a spell for free: moved to the stack (a real cast, cast triggers run), targets given here. */
    protected Card cast(final Player owner, final String name, final GameObject... targets) {
        final Card c = hand(name, owner);
        final SpellAbility sa = c.getFirstSpellAbility();
        sa.setActivatingPlayer(owner);
        for (final GameObject t : targets) {
            sa.getTargets().add(t);
        }
        sa.setHostCard(game.getAction().moveToStack(c, sa));
        game.getStack().add(sa);
        resolveAll();
        return c;
    }

    protected void resolveAll() {
        for (int i = 0; i < 80; i++) {
            game.getAction().checkStateEffects(true);
            game.getStack().addAllTriggeredAbilitiesToStack();
            if (game.getStack().isEmpty()) {
                return;
            }
            game.getStack().resolveStack();
        }
    }

    protected Player killer() {
        return opps.get(opps.size() - 1);
    }

    protected void murder(final Card c) {
        cast(killer(), "Murder", c);
    }

    /** Plays the game until the given phase of the current turn is reached with an empty stack (bounded). */
    protected void playTo(final PhaseType phase) {
        final Player turn = game.getPhaseHandler().getPlayerTurn();
        for (int i = 0; i < 500 && !game.isGameOver(); i++) {
            game.getPhaseHandler().mainLoopStep();
            if (game.getPhaseHandler().is(phase) && game.getStack().isEmpty()) {
                return;
            }
            if (!game.getPhaseHandler().isPlayerTurn(turn)) {
                return;
            }
        }
    }

    protected int countTokens(final Player p, final String type) {
        int n = 0;
        for (final Card c : p.getCardsIn(ZoneType.Battlefield)) {
            if (c.isToken() && c.getType().hasStringType(type)) {
                n++;
            }
        }
        return n;
    }

    // ---------------------------------------------------------------- Kaalia

    @Test(timeOut = T)
    public void kaaliaPutsAngelOntoBattlefieldTappedAndAttackingTheSameOpponent() {
        newGame(4);
        final Card kaalia = bf("Kaalia of the Vast", me);
        hand("Avacyn, Angel of Hope", me);
        playTo(PhaseType.COMBAT_DECLARE_BLOCKERS);
        final Combat combat = game.getCombat();
        AssertJUnit.assertNotNull("setup: the AI attacked", combat);
        AssertJUnit.assertTrue("setup: Kaalia attacks", combat.isAttacking(kaalia));
        final Card avacyn = findCardWithName(game, "Avacyn, Angel of Hope");
        AssertJUnit.assertNotNull("Avacyn put onto the battlefield", avacyn);
        AssertJUnit.assertTrue("tapped", avacyn.isTapped());
        AssertJUnit.assertTrue("attacking", combat.isAttacking(avacyn));
        AssertJUnit.assertEquals("attacking Kaalia's opponent", combat.getDefenderByAttacker(kaalia), combat.getDefenderByAttacker(avacyn));
    }

    @Test(timeOut = T)
    public void kaaliaWithIsshinTriggersTwice() {
        newGame(4);
        final Card kaalia = bf("Kaalia of the Vast", me);
        addCard("Isshin, Two Heavens as One", me); // summoning sick: does not attack
        hand("Avacyn, Angel of Hope", me);
        hand("Serra Angel", me);
        playTo(PhaseType.COMBAT_DECLARE_BLOCKERS);
        final Combat combat = game.getCombat();
        AssertJUnit.assertNotNull("setup: the AI attacked", combat);
        AssertJUnit.assertTrue("setup: Kaalia attacks", combat.isAttacking(kaalia));
        AssertJUnit.assertEquals("both angels put in by the doubled trigger", 0, me.getCardsIn(ZoneType.Hand).size());
        AssertJUnit.assertTrue(combat.isAttacking(findCardWithName(game, "Serra Angel")));
        AssertJUnit.assertTrue(combat.isAttacking(findCardWithName(game, "Avacyn, Angel of Hope")));
    }

    @Test(timeOut = T)
    public void bloodletterDoublesLifeLossOnlyDuringYourTurn() {
        newGame(3);
        addCard("Bloodletter of Aclazotz", me);
        final Player o = opps.get(0);
        cast(me, "Lightning Bolt", o);
        AssertJUnit.assertEquals("my turn: 3 damage -> 6 life lost", 14, o.getLife());
        game.getPhaseHandler().devModeSet(PhaseType.MAIN1, o);
        cast(me, "Lightning Bolt", o);
        AssertJUnit.assertEquals("their turn: not doubled", 11, o.getLife());
    }

    @Test(timeOut = T)
    public void bloodletterAndArchfiendOfDespairStack() {
        newGame(3);
        addCard("Bloodletter of Aclazotz", me);
        addCard("Archfiend of Despair", me);
        final Player o = opps.get(0);
        cast(me, "Lightning Bolt", o);
        AssertJUnit.assertEquals(14, o.getLife());
        playTo(PhaseType.CLEANUP);
        // end step: loses life equal to life lost this turn (6), doubled by Bloodletter (12)
        AssertJUnit.assertEquals(2, o.getLife());
    }

    @Test(timeOut = T)
    public void twinflameAndGiselaQuadrupleDamageToOpponent() {
        newGame(3);
        addCard("Twinflame Tyrant", me);
        addCard("Gisela, Blade of Goldnight", me);
        final Player o = opps.get(0);
        cast(me, "Lightning Bolt", o);
        AssertJUnit.assertEquals(20 - 12, o.getLife());
    }

    @Test(timeOut = T)
    public void twinflameDoesNotDoubleDamageToMeOrMyCreatures() {
        newGame(3);
        addCard("Twinflame Tyrant", me);
        final Card mine = addCard("Hill Giant", me); // 3/3
        cast(me, "Shock", me);
        AssertJUnit.assertEquals(18, me.getLife());
        cast(me, "Shock", mine);
        AssertJUnit.assertEquals(2, mine.getDamage());
    }

    @Test(timeOut = T)
    public void giselaPreventsHalfOfDamageToYouRoundedUp() {
        newGame(3);
        addCard("Gisela, Blade of Goldnight", me);
        cast(opps.get(0), "Lightning Bolt", me);
        AssertJUnit.assertEquals("3 damage, 2 prevented", 19, me.getLife());
    }

    @Test(timeOut = T)
    public void liesaExilesOpponentCreatureAndReturnsMineAtEndStep() {
        newGame(3);
        addCard("Liesa, Forgotten Archangel", me);
        final Card theirs = addCard("Grizzly Bears", opps.get(0));
        final Card mine = addCard("Grizzly Bears", me);
        murder(theirs);
        AssertJUnit.assertTrue("opponent's creature exiled", opps.get(0).getCardsIn(ZoneType.Exile).anyMatch(c -> c.getName().equals("Grizzly Bears")));
        murder(mine);
        AssertJUnit.assertEquals(1, me.getCardsIn(ZoneType.Graveyard).size());
        playTo(PhaseType.CLEANUP);
        AssertJUnit.assertTrue("my Grizzly Bears back in hand at end step", me.getCardsIn(ZoneType.Hand).anyMatch(c -> c.getName().equals("Grizzly Bears")));
    }

    @Test(timeOut = T)
    public void archfiendOfDepravityLeavesTwoCreaturesAtOpponentsEndStep() {
        newGame(3);
        addCard("Archfiend of Depravity", me);
        final Player o = opps.get(0);
        addCards("Grizzly Bears", 4, o);
        final Player o2 = opps.get(1);
        addCards("Grizzly Bears", 1, o2);
        game.getPhaseHandler().devModeSet(PhaseType.MAIN2, o);
        playTo(PhaseType.CLEANUP);
        AssertJUnit.assertEquals("the active opponent keeps two", 2, o.getCreaturesInPlay().size());
        AssertJUnit.assertEquals("the other opponent is untouched", 1, o2.getCreaturesInPlay().size());
    }

    // ---------------------------------------------------------------- Teysa

    @Test(timeOut = T)
    public void teysaKarlovDoublesZulaportCutthroatInFourPlayer() {
        newGame(4);
        addCard("Teysa Karlov", me);
        addCard("Zulaport Cutthroat", me);
        final Card bears = addCard("Grizzly Bears", me);
        murder(bears);
        for (final Player o : opps) {
            AssertJUnit.assertEquals(o + " loses 2", 18, o.getLife());
        }
        AssertJUnit.assertEquals("gain 1 per trigger", 22, me.getLife());
    }

    @Test(timeOut = T)
    public void teysaKarlovDoublesAfterlifeAndTokensGetLifelinkVigilance() {
        newGame(3);
        addCard("Teysa Karlov", me);
        final Card spirit = addCard("Indebted Spirit", me);
        murder(spirit);
        AssertJUnit.assertEquals(2, countTokens(me, "Spirit"));
        for (final Card c : me.getCreaturesInPlay()) {
            if (c.isToken()) {
                AssertJUnit.assertTrue(c.hasKeyword(Keyword.LIFELINK));
                AssertJUnit.assertTrue(c.hasKeyword(Keyword.VIGILANCE));
            }
        }
    }

    @Test(timeOut = T)
    public void teysaKarlovDoublesSkullclamp() {
        newGame(3);
        addCard("Teysa Karlov", me);
        final Card bears = addCard("Grizzly Bears", me);
        final Card clamp = addCard("Skullclamp", me);
        clamp.attachToEntity(bears, null);
        game.getAction().checkStateEffects(true);
        final int hand = me.getCardsIn(ZoneType.Hand).size();
        murder(bears);
        AssertJUnit.assertEquals("Skullclamp triggers twice", hand + 4, me.getCardsIn(ZoneType.Hand).size());
    }

    @Test(timeOut = T)
    public void delneyDoublesDiesTriggerOfSmallCreature() {
        newGame(3);
        addCard("Delney, Streetwise Lookout", me);
        final Card grub = addCard("Wriggling Grub", me);
        murder(grub);
        AssertJUnit.assertEquals("Wriggling Grub (power 1) dies trigger doubled", 4, countTokens(me, "Worm"));
    }

    @Test(timeOut = T)
    public void delneyTeysaKarlovMondrakStack() {
        newGame(3);
        addCard("Delney, Streetwise Lookout", me);
        addCard("Teysa Karlov", me);
        addCard("Mondrak, Glory Dominus", me);
        final Card grub = addCard("Wriggling Grub", me);
        murder(grub);
        // 3 triggers (base + Teysa + Delney) x 2 tokens x 2 (Mondrak)
        AssertJUnit.assertEquals(12, countTokens(me, "Worm"));
    }

    @Test(timeOut = T)
    public void teysaOrzhovScionMakesSpiritWhenBlackCreatureDies() {
        newGame(3);
        addCard("Teysa, Orzhov Scion", me);
        final Card black = addCard("Carrion Feeder", me);
        final Card white = addCard("Savannah Lions", me);
        murder(black);
        AssertJUnit.assertEquals(1, countTokens(me, "Spirit"));
        murder(white);
        AssertJUnit.assertEquals("white creature: no spirit", 1, countTokens(me, "Spirit"));
    }

    @Test(timeOut = T)
    public void teysaOrzhovScionSacrificesThreeWhiteToExile() {
        newGame(3);
        final Card teysa = bf("Teysa, Orzhov Scion", me);
        addCards("Savannah Lions", 3, me);
        final Card target = addCard("Grizzly Bears", opps.get(0));
        final SpellAbility ab = findSAWithPrefix(teysa, "Sacrifice three");
        AssertJUnit.assertNotNull(ab);
        ab.setActivatingPlayer(me);
        ab.getTargets().add(target);
        AssertJUnit.assertTrue("activated", ComputerUtil.playStack(ab, me, game));
        final String st = game.getStack().toString();
        resolveAll();
        AssertJUnit.assertTrue("stack was " + st + "\n" + gameStateToString(game), opps.get(0).getCardsIn(ZoneType.Exile).anyMatch(c -> c.getName().equals("Grizzly Bears")));
        AssertJUnit.assertEquals("three white creatures sacrificed", 3, me.getCardsIn(ZoneType.Graveyard).size());
    }

    @Test(timeOut = T)
    public void kambalCopiesOpponentTokensAndDrainsOnMyTokens() {
        newGame(4);
        addCard("Kambal, Profiteering Mayor", me);
        cast(opps.get(0), "Raise the Alarm");
        AssertJUnit.assertEquals("opponent got 2 soldiers", 2, countTokens(opps.get(0), "Soldier"));
        AssertJUnit.assertEquals("I got 2 copies", 2, countTokens(me, "Soldier"));
        for (final Card c : me.getCreaturesInPlay()) {
            if (c.isToken()) {
                AssertJUnit.assertTrue("copies are tapped", c.isTapped());
            }
        }
        // my tokens entering (one event): each opponent loses 1, I gain 1
        for (final Player o : opps) {
            AssertJUnit.assertEquals(19, o.getLife());
        }
        AssertJUnit.assertEquals(21, me.getLife());
    }

    @Test(timeOut = T)
    public void endlessFootAssaultMakesANinjaAttackingEachOpponent() {
        newGame(4);
        addCard("Endless Foot Assault", me);
        bf("Serra Angel", me);
        playTo(PhaseType.COMBAT_DECLARE_BLOCKERS);
        final Combat combat = game.getCombat();
        AssertJUnit.assertNotNull("setup: the AI attacked", combat);
        AssertJUnit.assertEquals(3, countTokens(me, "Ninja"));
        final List<GameEntity> defenders = new ArrayList<>();
        for (final Card c : me.getCreaturesInPlay()) {
            if (c.isToken()) {
                AssertJUnit.assertTrue(c.isTapped());
                AssertJUnit.assertTrue("ninja attacking", combat.isAttacking(c));
                defenders.add(combat.getDefenderByAttacker(c));
            }
        }
        AssertJUnit.assertTrue("one ninja per opponent: " + defenders, defenders.containsAll(opps));
    }

    // ---------------------------------------------------------------- Henzie / shared

    @Test(timeOut = T)
    public void massacreWurmEachOpponentLosesTwoPerCreature() {
        newGame(4);
        for (final Player o : opps) {
            addCard("Grizzly Bears", o);
        }
        addCards("Grizzly Bears", 1, opps.get(0));
        cast(me, "Massacre Wurm");
        AssertJUnit.assertEquals(16, opps.get(0).getLife());
        AssertJUnit.assertEquals(18, opps.get(1).getLife());
        AssertJUnit.assertEquals(18, opps.get(2).getLife());
    }

    @Test(timeOut = T)
    public void kokushoDrainsEachOpponentFive() {
        newGame(4);
        final Card k = addCard("Kokusho, the Evening Star", me);
        murder(k);
        for (final Player o : opps) {
            AssertJUnit.assertEquals(15, o.getLife());
        }
        AssertJUnit.assertEquals(35, me.getLife());
    }

    @Test(timeOut = T)
    public void vaultbornTyrantReturnsAsArtifactTokenCopyAndTriggers() {
        newGame(3);
        final Card v = addCard("Vaultborn Tyrant", me);
        final int hand = me.getCardsIn(ZoneType.Hand).size();
        murder(v);
        final Card tok = findCardWithName(game, "Vaultborn Tyrant");
        AssertJUnit.assertNotNull(tok);
        AssertJUnit.assertTrue(tok.isToken());
        AssertJUnit.assertTrue(tok.isArtifact());
        AssertJUnit.assertTrue(tok.isCreature());
        AssertJUnit.assertEquals("token's own ETB: gain 3", 23, me.getLife());
        AssertJUnit.assertEquals("token's own ETB: draw 1", hand + 1, me.getCardsIn(ZoneType.Hand).size());
        murder(tok);
        AssertJUnit.assertNull("a token does not copy itself again", findCardWithName(game, "Vaultborn Tyrant"));
    }

    @Test(timeOut = T)
    public void mikaeusGivesUndyingToNonHumans() {
        newGame(3);
        addCard("Mikaeus, the Unhallowed", me);
        final Card bears = addCard("Grizzly Bears", me);
        murder(bears);
        final Card back = findCardWithName(game, "Grizzly Bears");
        AssertJUnit.assertNotNull("returned by undying", back);
        AssertJUnit.assertEquals(1, back.getCounters(CounterEnumType.P1P1));
        AssertJUnit.assertEquals(4, back.getNetPower());
        murder(back);
        AssertJUnit.assertNull("not again with a +1/+1 counter", findCardWithName(game, "Grizzly Bears"));
    }

    @Test(timeOut = T)
    public void valgavothExilesOpponentsCardsGoingToTheirGraveyard() {
        newGame(3);
        addCard("Valgavoth, Terror Eater", me);
        final Card theirs = addCard("Grizzly Bears", opps.get(0));
        murder(theirs);
        AssertJUnit.assertFalse(opps.get(0).getCardsIn(ZoneType.Graveyard).anyMatch(c -> c.getName().equals("Grizzly Bears")));
        AssertJUnit.assertTrue(opps.get(0).getCardsIn(ZoneType.Exile).anyMatch(c -> c.getName().equals("Grizzly Bears")));
    }

    @Test(timeOut = T)
    public void vilisDrawsForLifeLost() {
        newGame(3);
        addCard("Vilis, Broker of Blood", me);
        final int hand = me.getCardsIn(ZoneType.Hand).size();
        cast(opps.get(0), "Lightning Bolt", me);
        AssertJUnit.assertEquals(hand + 3, me.getCardsIn(ZoneType.Hand).size());
    }

    // ---------------------------------------------------------------- batch 2

    protected Game newCommanderGame(final int n, final String myCommander) {
        final List<RegisteredPlayer> players = Lists.newArrayList();
        for (int i = 0; i < n; i++) {
            final Deck deck = new Deck();
            deck.getOrCreate(DeckSection.Commander).add(i == 0 ? myCommander : "Isamaru, Hound of Konda", 1);
            players.add(RegisteredPlayer.forCommander(deck).setPlayer(new LobbyPlayerAi("p" + i, null)));
        }
        final GameRules rules = new GameRules(GameType.Commander);
        game = new Game(players, rules, new Match(rules, players, "Test"));
        for (final Player p : game.getPlayers()) {
            p.initVariantsZones(p.getRegisteredPlayer());
        }
        me = game.getPlayers().get(0);
        opps = new ArrayList<>(game.getPlayers().subList(1, n));
        game.setAge(GameStage.Play);
        game.getPhaseHandler().devModeSet(PhaseType.MAIN1, me);
        game.getPhaseHandler().onStackResolved();
        fillLibraries();
        return game;
    }

    protected Card commanderToBattlefield() {
        final Card cmd = me.getCommanders().get(0);
        final Card moved = game.getAction().moveTo(ZoneType.Battlefield, cmd, null, null);
        moved.setSickness(false);
        game.getAction().checkStateEffects(true);
        return moved;
    }

    @Test(timeOut = T)
    public void henzieGrantsBlitzReducedByCommanderCasts() {
        newCommanderGame(4, "Henzie \"Toolbox\" Torre");
        final Card henzie = commanderToBattlefield();
        me.incCommanderCast(henzie);
        me.incCommanderCast(henzie);
        addCards("Swamp", 4, me);
        final Card kokusho = hand("Kokusho, the Evening Star", me);
        SpellAbility blitz = null;
        final StringBuilder all = new StringBuilder();
        for (final SpellAbility sa : kokusho.getAllPossibleAbilities(me, true)) {
            all.append(sa).append(" | ");
            if (sa.isBlitz()) {
                blitz = sa;
            }
        }
        AssertJUnit.assertNotNull("Kokusho has blitz from Henzie: " + all, blitz);
        blitz.setActivatingPlayer(me);
        AssertJUnit.assertTrue("blitz {4}{B}{B} - 2 payable with 4 Swamps", ComputerUtil.playStack(blitz, me, game));
        resolveAll();
        final Card k = findCardWithName(game, "Kokusho, the Evening Star");
        AssertJUnit.assertNotNull(k);
        AssertJUnit.assertTrue("blitz: haste", k.hasKeyword(Keyword.HASTE));
        playTo(PhaseType.MAIN2); // the AI may attack with the hasty Kokusho
        AssertJUnit.assertNotNull("still there in main 2", findCardWithName(game, "Kokusho, the Evening Star"));
        final int[] before = new int[opps.size()];
        for (int i = 0; i < opps.size(); i++) {
            before[i] = opps.get(i).getLife();
        }
        final int myLife = me.getLife();
        final int hand = me.getCardsIn(ZoneType.Hand).size();
        playTo(PhaseType.CLEANUP);
        AssertJUnit.assertNull("sacrificed at end step", findCardWithName(game, "Kokusho, the Evening Star"));
        for (int i = 0; i < opps.size(); i++) {
            AssertJUnit.assertEquals(before[i] - 5, opps.get(i).getLife());
        }
        AssertJUnit.assertEquals(myLife + 15, me.getLife());
        AssertJUnit.assertEquals("blitz: draw a card", hand + 1, me.getCardsIn(ZoneType.Hand).size());
    }

    @Test(timeOut = T)
    public void henzieBlitzNotOfferedForSmallCreatures() {
        newCommanderGame(2, "Henzie \"Toolbox\" Torre");
        commanderToBattlefield();
        addCards("Swamp", 4, me);
        final Card bears = hand("Grizzly Bears", me);
        for (final SpellAbility sa : bears.getAllPossibleAbilities(me, true)) {
            AssertJUnit.assertFalse("MV 2: blitz offered but must be illegal", sa.isBlitz() && sa.isLegalAfterStack());
        }
    }

    @Test(timeOut = T)
    public void grayMerchantWithBloodletterGainsDoubledLoss() {
        newGame(4);
        addCard("Bloodletter of Aclazotz", me);
        cast(me, "Gray Merchant of Asphodel");
        // devotion 5 (BB + BBB), doubled on my turn
        for (final Player o : opps) {
            AssertJUnit.assertEquals(10, o.getLife());
        }
        AssertJUnit.assertEquals("gain the life lost this way", 50, me.getLife());
    }

    @Test(timeOut = T)
    public void archonOfCrueltyEntersAgainstOneOpponent() {
        newGame(4);
        for (final Player o : opps) {
            addCard("Grizzly Bears", o);
            hand("Island", o);
        }
        final int hand = me.getCardsIn(ZoneType.Hand).size();
        cast(me, "Archon of Cruelty");
        int hit = 0;
        for (final Player o : opps) {
            if (o.getLife() == 17) {
                hit++;
                AssertJUnit.assertEquals(0, o.getCreaturesInPlay().size());
                AssertJUnit.assertEquals(0, o.getCardsIn(ZoneType.Hand).size());
            } else {
                AssertJUnit.assertEquals(20, o.getLife());
            }
        }
        AssertJUnit.assertEquals(1, hit);
        AssertJUnit.assertEquals(23, me.getLife());
        AssertJUnit.assertEquals(hand + 1, me.getCardsIn(ZoneType.Hand).size());
    }

    @Test(timeOut = T)
    public void myojinEntersWithDivinityCounterOnlyWhenCastFromHand() {
        newGame(3);
        addCards("Swamp", 8, me);
        final Card m = hand("Myojin of Night's Reach", me);
        final SpellAbility sa = m.getFirstSpellAbility();
        sa.setActivatingPlayer(me);
        AssertJUnit.assertTrue(ComputerUtil.playStack(sa, me, game));
        resolveAll();
        final Card onBf = findCardWithName(game, "Myojin of Night's Reach");
        AssertJUnit.assertEquals(1, onBf.getCounters(CounterEnumType.DIVINITY));
        AssertJUnit.assertTrue(onBf.hasKeyword(Keyword.INDESTRUCTIBLE));
    }

    @Test(timeOut = T)
    public void chainerGivesHasteToReanimatedCreature() {
        newGame(3);
        addCard("Chainer, Nightmare Adept", me);
        final Card bears = addCardToZone("Grizzly Bears", me, ZoneType.Graveyard);
        cast(me, "Reanimate", bears);
        final Card back = findCardWithName(game, "Grizzly Bears");
        AssertJUnit.assertNotNull(back);
        AssertJUnit.assertTrue(back.hasKeyword(Keyword.HASTE));
        AssertJUnit.assertEquals("Reanimate: lose MV", 18, me.getLife());
        cast(me, "Llanowar Elves");
        AssertJUnit.assertFalse("cast from hand: no haste", findCardWithName(game, "Llanowar Elves").hasKeyword(Keyword.HASTE));
    }

    @Test(timeOut = T)
    public void enduringCourageBuffsEnteringCreatureAndReturnsAsEnchantment() {
        newGame(3);
        final Card dog = addCard("Enduring Courage", me);
        cast(me, "Grizzly Bears");
        final Card bears = findCardWithName(game, "Grizzly Bears");
        AssertJUnit.assertEquals(4, bears.getNetPower());
        AssertJUnit.assertTrue(bears.hasKeyword(Keyword.HASTE));
        murder(dog);
        final Card back = findCardWithName(game, "Enduring Courage");
        AssertJUnit.assertNotNull("returned", back);
        AssertJUnit.assertTrue(back.isEnchantment());
        AssertJUnit.assertFalse("not a creature", back.isCreature());
    }

    @Test(timeOut = T)
    public void notaryHobbitsMakeTwoNonLegendaryCopies() {
        newGame(3);
        cast(me, "The Notary Hobbits");
        int tokens = 0;
        int all = 0;
        for (final Card c : me.getCardsIn(ZoneType.Battlefield)) {
            if (c.getName().equals("The Notary Hobbits")) {
                all++;
                if (c.isToken()) {
                    tokens++;
                    AssertJUnit.assertFalse("token not legendary", c.getType().isLegendary());
                }
            }
        }
        AssertJUnit.assertEquals(2, tokens);
        AssertJUnit.assertEquals("legend rule does not kill tokens", 3, all);
    }

    @Test(timeOut = T)
    public void rampantRejuvenatorFetchesLandsEqualToPower() {
        newGame(3);
        cast(me, "Rampant Rejuvenator");
        final Card r = findCardWithName(game, "Rampant Rejuvenator");
        AssertJUnit.assertEquals(2, r.getNetPower());
        murder(r);
        AssertJUnit.assertEquals(2, me.getLandsInPlay().size());
    }

    @Test(timeOut = T)
    public void nineLivesFamiliarReturnsWithOneFewerCounter() {
        newGame(3);
        addCards("Swamp", 3, me);
        final Card cat = hand("Nine-Lives Familiar", me);
        final SpellAbility sa = cat.getFirstSpellAbility();
        sa.setActivatingPlayer(me);
        AssertJUnit.assertTrue(ComputerUtil.playStack(sa, me, game));
        resolveAll();
        final Card c = findCardWithName(game, "Nine-Lives Familiar");
        AssertJUnit.assertEquals(8, c.getCounters(CounterEnumType.REVIVAL));
        murder(c);
        playTo(PhaseType.CLEANUP);
        final Card back = findCardWithName(game, "Nine-Lives Familiar");
        AssertJUnit.assertNotNull("returned at end step", back);
        AssertJUnit.assertEquals(7, back.getCounters(CounterEnumType.REVIVAL));
    }

    /** The engine side: with one target per opponent chosen, each gets X -1/-1 counters. */
    @Test(timeOut = T)
    public void hapatraTriggerWithChosenTargetsKillsOneCreaturePerOpponent() {
        newGame(4);
        addCardToZone("Kokusho, the Evening Star", me, ZoneType.Graveyard); // MV 6
        final List<Card> angels = new ArrayList<>();
        for (final Player o : opps) {
            angels.add(addCard("Serra Angel", o)); // 4/4
        }
        final Card hapatra = addCard("Hapatra, the Desert Fang", me);
        final SpellAbility trig = hapatra.getTriggers().get(0).ensureAbility().copy(hapatra, me, false);
        trig.setActivatingPlayer(me);
        for (final Card a : angels) {
            trig.getTargets().add(a);
        }
        AssertJUnit.assertTrue("one target per opponent is legal", trig.isTargetNumberValid());
        forge.game.ability.AbilityUtils.resolve(trig);
        game.getAction().checkStateEffects(true);
        for (final Player o : opps) {
            AssertJUnit.assertEquals(0, o.getCreaturesInPlay().size());
        }
    }

    /** The AI side: the AI casting Hapatra chooses no target (script lacks IsCurse). */
    @Test(timeOut = T)
    public void hapatraPutsCountersOnOneCreaturePerOpponent() {
        newGame(4);
        addCardToZone("Kokusho, the Evening Star", me, ZoneType.Graveyard); // MV 6
        for (final Player o : opps) {
            addCard("Serra Angel", o); // 4/4
        }
        cast(me, "Hapatra, the Desert Fang");
        for (final Player o : opps) {
            AssertJUnit.assertEquals(o + " creature killed " + gameStateToString(game) + game.getGameLog().getLogEntries(null), 0, o.getCreaturesInPlay().size());
        }
    }

    @Test(timeOut = T)
    public void lizardTurnsCreatureIntoVanillaGreenLizard() {
        newGame(3);
        final Card angel = addCard("Serra Angel", opps.get(0));
        cast(me, "Lizard, Connors's Curse");
        AssertJUnit.assertFalse("lost flying", angel.hasKeyword(Keyword.FLYING));
        AssertJUnit.assertEquals(4, angel.getNetPower());
        AssertJUnit.assertEquals(4, angel.getNetToughness());
        AssertJUnit.assertTrue(angel.getType().hasCreatureType("Lizard"));
        AssertJUnit.assertFalse(angel.getType().hasCreatureType("Angel"));
        AssertJUnit.assertTrue(angel.getColor().isMonoColor() && angel.getColor().hasGreen());
    }

    @Test(timeOut = T)
    public void avacynAngelOfHorrorReturnsCreatureAtEndStep() {
        newGame(3);
        addCard("Avacyn, Angel of Horror", me);
        final Card bears = addCard("Grizzly Bears", me);
        murder(bears);
        playTo(PhaseType.CLEANUP);
        AssertJUnit.assertNotNull(findCardWithName(game, "Grizzly Bears"));
    }

    @Test(timeOut = T)
    public void rottenmouthViperEachOpponentLosesFourWithoutPermanents() {
        newGame(4);
        cast(me, "Rottenmouth Viper");
        final Card v = findCardWithName(game, "Rottenmouth Viper");
        AssertJUnit.assertEquals(1, v.getCounters(CounterEnumType.BLIGHT));
        for (final Player o : opps) {
            AssertJUnit.assertEquals(16, o.getLife());
        }
    }

    @Test(timeOut = T)
    public void elasIlKorDrainsOnDeathAndGainsOnEnter() {
        newGame(4);
        addCard("Elas il-Kor, Sadistic Pilgrim", me);
        cast(me, "Grizzly Bears");
        AssertJUnit.assertEquals(21, me.getLife());
        murder(findCardWithName(game, "Grizzly Bears"));
        for (final Player o : opps) {
            AssertJUnit.assertEquals(19, o.getLife());
        }
    }

    @Test(timeOut = T)
    public void marionetteApprenticeTriggersOnTreasureSacrifice() {
        newGame(4);
        addCard("Marionette Apprentice", me);
        final Card t = addToken("c_a_treasure_sac", me);
        AssertJUnit.assertNotNull(t);
        final SpellAbility mana = t.getManaAbilities().get(0);
        mana.setActivatingPlayer(me);
        AssertJUnit.assertTrue(ComputerUtil.playNoStack(me, mana, game, false));
        resolveAll();
        for (final Player o : opps) {
            AssertJUnit.assertEquals("treasure put into graveyard", 19, o.getLife());
        }
    }

    @Test(timeOut = T)
    public void lothoTriggersOnAnyPlayersSecondSpell() {
        newGame(3);
        addCard("Lotho, Corrupt Shirriff", me);
        cast(opps.get(0), "Shock", opps.get(1));
        AssertJUnit.assertEquals(20, me.getLife());
        cast(opps.get(0), "Shock", opps.get(1));
        AssertJUnit.assertEquals(19, me.getLife());
        AssertJUnit.assertEquals(1, countTokens(me, "Treasure"));
        cast(opps.get(0), "Shock", opps.get(1));
        AssertJUnit.assertEquals("third spell: no trigger", 1, countTokens(me, "Treasure"));
    }

    @Test(timeOut = T)
    public void jadarMakesDecayedZombieOnlyWithoutDecayed() {
        newGame(3);
        addCard("Jadar, Ghoulcaller of Nephalia", me);
        playTo(PhaseType.CLEANUP);
        AssertJUnit.assertEquals(1, countTokens(me, "Zombie"));
        game.getPhaseHandler().devModeSet(PhaseType.MAIN2, me);
        playTo(PhaseType.CLEANUP);
        AssertJUnit.assertEquals("already controls a decayed creature", 1, countTokens(me, "Zombie"));
    }

    // ---------------------------------------------------------------- batch 3

    @Test(timeOut = T)
    public void kardurForcesOpponentsToAttackSomeoneElse() {
        newGame(3);
        cast(me, "Kardur, Doomscourge");
        final Player o = opps.get(0);
        final Card bears = bf("Grizzly Bears", o);
        game.getPhaseHandler().devModeSet(PhaseType.MAIN1, o);
        playTo(PhaseType.COMBAT_DECLARE_BLOCKERS);
        final Combat combat = game.getCombat();
        AssertJUnit.assertNotNull("the opponent's creature had to attack", combat);
        AssertJUnit.assertTrue(combat.isAttacking(bears));
        AssertJUnit.assertEquals("attacks a player other than Kardur's controller", opps.get(1), combat.getDefenderByAttacker(bears));
    }

    @Test(timeOut = T)
    public void blastFurnaceHellkiteGivesDoubleStrikeToAttackers() {
        newGame(3);
        addCard("Blast-Furnace Hellkite", me);
        final Card kaalia = bf("Kaalia of the Vast", me);
        playTo(PhaseType.COMBAT_DECLARE_BLOCKERS);
        AssertJUnit.assertNotNull(game.getCombat());
        AssertJUnit.assertTrue(game.getCombat().isAttacking(kaalia));
        AssertJUnit.assertTrue(kaalia.hasKeyword(Keyword.DOUBLE_STRIKE));
        final Player defender = (Player) game.getCombat().getDefenderByAttacker(kaalia);
        playTo(PhaseType.MAIN2);
        AssertJUnit.assertEquals("2 power, double strike", 16, defender.getLife());
    }

    @Test(timeOut = T)
    public void sneakAttackPutsCreatureWithHasteAndSacrificesIt() {
        newGame(3);
        final Card sneak = addCard("Sneak Attack", me);
        addCard("Mountain", me);
        hand("Serra Angel", me);
        final SpellAbility ab = sneak.getSpellAbilities().get(0);
        ab.setActivatingPlayer(me);
        game.getStack().add(ab); // cost not paid: the effect is what is checked
        resolveAll();
        final Card angel = findCardWithName(game, "Serra Angel");
        AssertJUnit.assertNotNull(gameStateToString(game) + game.getGameLog().getLogEntries(null), angel);
        AssertJUnit.assertTrue(angel.hasKeyword(Keyword.HASTE));
        playTo(PhaseType.CLEANUP);
        AssertJUnit.assertNull("sacrificed at end step", findCardWithName(game, "Serra Angel"));
        AssertJUnit.assertTrue(me.getCardsIn(ZoneType.Graveyard).anyMatch(c -> c.getName().equals("Serra Angel")));
    }

    @Test(timeOut = T)
    public void ilhargPutsCreatureAttackingAndReturnsItAtEndStep() {
        newGame(3);
        final Card boar = bf("Ilharg, the Raze-Boar", me);
        hand("Vaultborn Tyrant", me);
        playTo(PhaseType.COMBAT_DECLARE_BLOCKERS);
        AssertJUnit.assertNotNull(game.getCombat());
        AssertJUnit.assertTrue(game.getCombat().isAttacking(boar));
        final Card v = findCardWithName(game, "Vaultborn Tyrant");
        AssertJUnit.assertNotNull("put onto the battlefield", v);
        AssertJUnit.assertTrue(game.getCombat().isAttacking(v));
        playTo(PhaseType.CLEANUP);
        AssertJUnit.assertTrue("returned to hand", me.getCardsIn(ZoneType.Hand).anyMatch(c -> c.getName().equals("Vaultborn Tyrant")));
    }

    @Test(timeOut = T)
    public void aureliaGivesAnAdditionalCombat() {
        newGame(3);
        bf("Aurelia, the Warleader", me);
        final Player turn = me;
        int combats = 0;
        PhaseType last = null;
        for (int i = 0; i < 500 && !game.isGameOver() && game.getPhaseHandler().isPlayerTurn(turn); i++) {
            game.getPhaseHandler().mainLoopStep();
            final PhaseType ph = game.getPhaseHandler().getPhase();
            if (ph == PhaseType.COMBAT_BEGIN && last != PhaseType.COMBAT_BEGIN) {
                combats++;
            }
            last = ph;
            if (ph == PhaseType.CLEANUP) {
                break;
            }
        }
        AssertJUnit.assertEquals(2, combats);
        int lost = 0;
        for (final Player o : opps) {
            lost += 20 - o.getLife();
        }
        AssertJUnit.assertEquals("attacked twice with a 3/4", 6, lost);
    }

    @Test(timeOut = T)
    public void dragonTempestDealsDamageEqualToDragonCount() {
        newGame(3);
        addCard("Dragon Tempest", me);
        addCard("Twinflame Tyrant", me); // a Dragon, and doubles
        cast(me, "Hellkite Tyrant");
        final Card h = findCardWithName(game, "Hellkite Tyrant");
        AssertJUnit.assertTrue("flying: haste", h.hasKeyword(Keyword.HASTE));
        int lost = 0;
        for (final Player o : opps) {
            lost += 20 - o.getLife();
        }
        AssertJUnit.assertEquals("2 Dragons -> 2 damage, doubled by Twinflame", 4, lost);
    }

    @Test(timeOut = T)
    public void terrorOfThePeaksDealsPowerDamage() {
        newGame(3);
        addCard("Terror of the Peaks", me);
        cast(me, "Vaultborn Tyrant");
        int lost = 0;
        for (final Player o : opps) {
            lost += 20 - o.getLife();
        }
        AssertJUnit.assertEquals(6, lost);
    }

    @Test(timeOut = T)
    public void mondrakDoublesEndlessFootAssaultNinjas() {
        newGame(4);
        addCard("Endless Foot Assault", me);
        addCard("Mondrak, Glory Dominus", me);
        bf("Serra Angel", me);
        playTo(PhaseType.COMBAT_DECLARE_BLOCKERS);
        final Combat combat = game.getCombat();
        AssertJUnit.assertNotNull(combat);
        AssertJUnit.assertEquals(6, countTokens(me, "Ninja"));
        for (final Player o : opps) {
            int n = 0;
            for (final Card c : me.getCreaturesInPlay()) {
                if (c.isToken() && combat.isAttacking(c) && o.equals(combat.getDefenderByAttacker(c))) {
                    n++;
                }
            }
            AssertJUnit.assertEquals("two ninjas attacking " + o, 2, n);
        }
    }

    @Test(timeOut = T)
    public void kambalWithMondrakCopiesTwiceAsMany() {
        newGame(3);
        addCard("Kambal, Profiteering Mayor", me);
        addCard("Mondrak, Glory Dominus", me);
        cast(opps.get(0), "Raise the Alarm");
        AssertJUnit.assertEquals(4, countTokens(me, "Soldier"));
    }

    @Test(timeOut = T)
    public void welcomingVampireDrawsOncePerTurn() {
        newGame(3);
        addCard("Welcoming Vampire", me);
        final int hand = me.getCardsIn(ZoneType.Hand).size();
        cast(me, "Raise the Alarm");
        AssertJUnit.assertEquals(hand + 1, me.getCardsIn(ZoneType.Hand).size());
        cast(me, "Grizzly Bears");
        AssertJUnit.assertEquals("once each turn", hand + 1, me.getCardsIn(ZoneType.Hand).size());
    }

    @Test(timeOut = T)
    public void shadowgrangeArchfiendEachOpponentSacrificesGreatestPower() {
        newGame(4);
        addCard("Grizzly Bears", opps.get(0));
        addCard("Serra Angel", opps.get(0));
        addCard("Hill Giant", opps.get(1));
        addCard("Llanowar Elves", opps.get(2));
        cast(me, "Shadowgrange Archfiend");
        AssertJUnit.assertNotNull("bears kept", opps.get(0).getCreaturesInPlay().anyMatch(c -> c.getName().equals("Grizzly Bears")) ? "ok" : null);
        AssertJUnit.assertEquals(1, opps.get(0).getCreaturesInPlay().size());
        AssertJUnit.assertEquals(0, opps.get(1).getCreaturesInPlay().size());
        AssertJUnit.assertEquals(0, opps.get(2).getCreaturesInPlay().size());
        AssertJUnit.assertEquals("gain the greatest power sacrificed (4)", 24, me.getLife());
    }

    @Test(timeOut = T)
    public void notDeadAfterAllReturnsWithWickedRole() {
        newGame(3);
        final Card bears = addCard("Grizzly Bears", me);
        cast(me, "Not Dead After All", bears);
        murder(bears);
        final Card back = findCardWithName(game, "Grizzly Bears");
        AssertJUnit.assertNotNull(back);
        AssertJUnit.assertTrue(back.isTapped());
        AssertJUnit.assertEquals("Wicked Role +1/+1", 3, back.getNetPower());
        murder(back);
        for (final Player o : opps) {
            AssertJUnit.assertEquals("role to graveyard: each opponent loses 1", 19, o.getLife());
        }
    }

    @Test(timeOut = T)
    public void bloodghastHasHasteWhenAnyOpponentIsAtTenOrLess() {
        newGame(4);
        final Card g = addCard("Bloodghast", me);
        game.getAction().checkStateEffects(true);
        AssertJUnit.assertFalse(g.hasKeyword(Keyword.HASTE));
        opps.get(2).setLife(10, null);
        game.getAction().checkStateEffects(true);
        AssertJUnit.assertTrue(g.hasKeyword(Keyword.HASTE));
    }

    @Test(timeOut = T)
    public void archfiendOfDespairStopsOpponentLifeGain() {
        newGame(3);
        addCard("Archfiend of Despair", me);
        cast(opps.get(0), "Healing Salve", opps.get(0));
        AssertJUnit.assertEquals(20, opps.get(0).getLife());
    }

    @Test(timeOut = T)
    public void tombstoneStairwellMakesTombspawnForEachPlayer() {
        newGame(3);
        addCard("Tombstone Stairwell", me);
        addCards("Swamp", 4, me);
        addCardToZone("Grizzly Bears", me, ZoneType.Graveyard);
        addCardToZone("Grizzly Bears", me, ZoneType.Graveyard);
        addCardToZone("Grizzly Bears", opps.get(0), ZoneType.Graveyard);
        game.getPhaseHandler().devModeSet(PhaseType.UNTAP, opps.get(1));
        playTo(PhaseType.DRAW);
        AssertJUnit.assertEquals(2, countTokens(me, "Zombie"));
        AssertJUnit.assertEquals(1, countTokens(opps.get(0), "Zombie"));
        playTo(PhaseType.CLEANUP);
        AssertJUnit.assertEquals("destroyed at end step", 0, countTokens(me, "Zombie"));
    }

    @Test(timeOut = T)
    public void oldOneEyeMakesTyranidAndGivesTrample() {
        newGame(3);
        cast(me, "Old One Eye");
        AssertJUnit.assertEquals(1, countTokens(me, "Tyranid"));
        for (final Card c : me.getCreaturesInPlay()) {
            AssertJUnit.assertTrue(c + " trample", c.hasKeyword(Keyword.TRAMPLE));
        }
    }

    @Test(timeOut = T)
    public void metamorphosisFanaticReturnsCreatureWithLifelinkCounter() {
        newGame(3);
        addCardToZone("Serra Angel", me, ZoneType.Graveyard);
        cast(me, "Metamorphosis Fanatic");
        final Card a = findCardWithName(game, "Serra Angel");
        AssertJUnit.assertNotNull(a);
        AssertJUnit.assertTrue("has a counter: " + a.getCounters(), a.hasCounters());
        AssertJUnit.assertTrue(a.hasKeyword(Keyword.LIFELINK));
    }

    @Test(timeOut = T)
    public void livingDeathSwapsGraveyardAndBattlefield() {
        newGame(3);
        addCard("Grizzly Bears", me);
        addCardToZone("Serra Angel", me, ZoneType.Graveyard);
        addCard("Hill Giant", opps.get(0));
        addCardToZone("Llanowar Elves", opps.get(0), ZoneType.Graveyard);
        cast(me, "Living Death");
        AssertJUnit.assertNotNull(findCardWithName(game, "Serra Angel"));
        AssertJUnit.assertNotNull(findCardWithName(game, "Llanowar Elves"));
        AssertJUnit.assertNull(findCardWithName(game, "Grizzly Bears"));
        AssertJUnit.assertNull(findCardWithName(game, "Hill Giant"));
        AssertJUnit.assertTrue(me.getCardsIn(ZoneType.Graveyard).anyMatch(c -> c.getName().equals("Grizzly Bears")));
    }

    @Test(timeOut = T)
    public void bringerOfTheLastGiftSwapsWhenCast() {
        newGame(3);
        addCard("Grizzly Bears", me);
        addCardToZone("Serra Angel", me, ZoneType.Graveyard);
        addCard("Hill Giant", opps.get(0));
        addCardToZone("Llanowar Elves", opps.get(0), ZoneType.Graveyard);
        cast(me, "Bringer of the Last Gift");
        AssertJUnit.assertNotNull(findCardWithName(game, "Bringer of the Last Gift"));
        AssertJUnit.assertNotNull(findCardWithName(game, "Serra Angel"));
        AssertJUnit.assertNotNull(findCardWithName(game, "Llanowar Elves"));
        AssertJUnit.assertNull("sacrificed and not returned", findCardWithName(game, "Grizzly Bears"));
        AssertJUnit.assertNull(findCardWithName(game, "Hill Giant"));
    }

    // ---------------------------------------------------------------- batch 4

    @Test(timeOut = T)
    public void avacynAngelOfHopeMakesMyPermanentsIndestructible() {
        newGame(3);
        addCard("Avacyn, Angel of Hope", me);
        final Card bears = addCard("Grizzly Bears", me);
        game.getAction().checkStateEffects(true);
        murder(bears);
        AssertJUnit.assertNotNull(findCardWithName(game, "Grizzly Bears"));
    }

    @Test(timeOut = T)
    public void serrasEmissaryChosenInstantProtectsMeAndMyCreatures() {
        newGame(3);
        cast(me, "Serra's Emissary");
        final Card e = findCardWithName(game, "Serra's Emissary");
        AssertJUnit.assertNotNull(e.getChosenType());
        e.setChosenType("Instant");
        game.getAction().checkStateEffects(true);
        final Card bears = addCard("Grizzly Bears", me);
        game.getAction().checkStateEffects(true);
        cast(opps.get(0), "Lightning Bolt", me);
        cast(opps.get(0), "Lightning Bolt", bears);
        AssertJUnit.assertEquals(20, me.getLife());
        AssertJUnit.assertNotNull(findCardWithName(game, "Grizzly Bears"));
    }

    @Test(timeOut = T)
    public void grandAbolisherStopsOpponentSpellsOnMyTurnOnly() {
        newGame(3);
        addCard("Grand Abolisher", me);
        game.getAction().checkStateEffects(true);
        final Card bolt = hand("Lightning Bolt", opps.get(0));
        final SpellAbility sa = bolt.getFirstSpellAbility();
        sa.setActivatingPlayer(opps.get(0));
        AssertJUnit.assertFalse("my turn", sa.checkRestrictions(opps.get(0)));
        game.getPhaseHandler().devModeSet(PhaseType.MAIN1, opps.get(1));
        sa.setActivatingPlayer(opps.get(0));
        AssertJUnit.assertTrue("another players turn", sa.checkRestrictions(opps.get(0)));
    }

    @Test(timeOut = T)
    public void teferisProtectionLifeCantChangeAndPermanentsPhaseOut() {
        newGame(4);
        final Card bears = addCard("Grizzly Bears", me);
        cast(me, "Teferi's Protection");
        AssertJUnit.assertTrue(bears.isPhasedOut());
        game.getPhaseHandler().devModeSet(PhaseType.MAIN1, opps.get(0));
        cast(opps.get(0), "Lightning Bolt", me);
        AssertJUnit.assertEquals(20, me.getLife());
        cast(opps.get(1), "Healing Salve", me);
        AssertJUnit.assertEquals(20, me.getLife());
        AssertJUnit.assertTrue(me.getCardsIn(ZoneType.Exile).anyMatch(c -> c.getName().equals("Teferi's Protection")));
    }

    @Test(timeOut = T)
    public void hellkiteTyrantStealsArtifactsOnCombatDamage() {
        newGame(3);
        final Card h = bf("Hellkite Tyrant", me);
        addCard("Sol Ring", opps.get(0));
        addCard("Sol Ring", opps.get(1));
        playTo(PhaseType.MAIN2);
        AssertJUnit.assertTrue("setup: attacked", h.getDamageHistory().getCreatureAttackedThisCombat() > 0 || h.isTapped());
        int mine = 0;
        for (final Card c : me.getCardsIn(ZoneType.Battlefield)) {
            if (c.getName().equals("Sol Ring")) {
                mine++;
            }
        }
        AssertJUnit.assertEquals("took the damaged player's artifact only", 1, mine);
    }

    @Test(timeOut = T)
    public void balefireDragonDamagesEachCreatureOfDamagedPlayer() {
        newGame(2);
        final Card d = bf("Balefire Dragon", me);
        addCard("Hill Giant", opps.get(0));
        addCard("Craw Wurm", opps.get(0)); // 6/4
        playTo(PhaseType.MAIN2);
        AssertJUnit.assertTrue("setup: attacked", d.getDamageHistory().getCreatureAttackedThisCombat() > 0 || d.isTapped());
        AssertJUnit.assertEquals(14, opps.get(0).getLife());
        AssertJUnit.assertEquals(0, opps.get(0).getCreaturesInPlay().size());
    }

    @Test(timeOut = T)
    public void orcishBowmastersPunishesExtraDraws() {
        newGame(3);
        cast(me, "Orcish Bowmasters");
        cast(opps.get(0), "Divination");
        Card army = null;
        for (final Card c : me.getCreaturesInPlay()) {
            if (c.getType().hasCreatureType("Army")) {
                army = c;
            }
        }
        AssertJUnit.assertNotNull(army);
        AssertJUnit.assertEquals("ETB + 2 extra draws", 3, army.getCounters(CounterEnumType.P1P1));
    }

    @Test(timeOut = T)
    public void pitilessPlundererWithTeysaKarlovMakesTwoTreasures() {
        newGame(3);
        addCard("Teysa Karlov", me);
        addCard("Pitiless Plunderer", me);
        murder(addCard("Grizzly Bears", me));
        AssertJUnit.assertEquals(2, countTokens(me, "Treasure"));
    }

    @Test(timeOut = T)
    public void delneyDoublesElasIlKor() {
        newGame(3);
        addCard("Delney, Streetwise Lookout", me);
        addCard("Elas il-Kor, Sadistic Pilgrim", me);
        cast(me, "Grizzly Bears");
        AssertJUnit.assertEquals("Elas (power 2) triggers twice", 22, me.getLife());
    }

    @Test(timeOut = T)
    public void ophiomancerTriggersOnEachUpkeep() {
        newGame(4);
        addCard("Ophiomancer", me);
        game.getPhaseHandler().devModeSet(PhaseType.UNTAP, opps.get(0));
        playTo(PhaseType.DRAW);
        AssertJUnit.assertEquals("opponent's upkeep", 1, countTokens(me, "Snake"));
    }

    @Test(timeOut = T)
    public void daemogothSacrificedAtUpkeepTriggersItself() {
        newGame(4);
        addCard("Daemogoth Woe-Eater", me);
        for (final Player o : opps) {
            hand("Island", o);
        }
        final int hand = me.getCardsIn(ZoneType.Hand).size();
        game.getPhaseHandler().devModeSet(PhaseType.UNTAP, me);
        playTo(PhaseType.DRAW);
        AssertJUnit.assertNull(findCardWithName(game, "Daemogoth Woe-Eater"));
        for (final Player o : opps) {
            AssertJUnit.assertEquals(0, o.getCardsIn(ZoneType.Hand).size());
        }
        AssertJUnit.assertEquals(22, me.getLife());
        AssertJUnit.assertTrue(me.getCardsIn(ZoneType.Hand).size() >= hand + 1);
    }

    @Test(timeOut = T)
    public void duskManglerHitsEachOpponent() {
        newGame(4);
        for (final Player o : opps) {
            addCard("Grizzly Bears", o);
            hand("Island", o);
        }
        cast(me, "Dusk Mangler");
        for (final Player o : opps) {
            AssertJUnit.assertEquals(16, o.getLife());
            AssertJUnit.assertEquals(0, o.getCreaturesInPlay().size());
            AssertJUnit.assertEquals(0, o.getCardsIn(ZoneType.Hand).size());
        }
    }

    @Test(timeOut = T)
    public void wastelandRaiderEachPlayerSacrifices() {
        newGame(4);
        for (final Player o : opps) {
            addCard("Grizzly Bears", o);
        }
        addCard("Llanowar Elves", me);
        cast(me, "Wasteland Raider");
        for (final Player o : opps) {
            AssertJUnit.assertEquals(0, o.getCreaturesInPlay().size());
        }
        AssertJUnit.assertEquals("I sacrifice one of mine too", 1, me.getCreaturesInPlay().size());
    }

    @Test(timeOut = T)
    public void sheoldredEachOpponentSacrificesNontoken() {
        newGame(4);
        for (final Player o : opps) {
            addCard("Grizzly Bears", o);
        }
        cast(me, "Sheoldred");
        for (final Player o : opps) {
            AssertJUnit.assertEquals(0, o.getCreaturesInPlay().size());
        }
    }

    @Test(timeOut = T)
    public void etaliCastsTheExiledSpellsOfEveryPlayer() {
        newGame(4);
        for (final Player p : game.getPlayers()) {
            addCardToZone("Grizzly Bears", p, ZoneType.Library); // added last = top? check below
        }
        cast(me, "Etali, Primal Conqueror");
        int bears = 0;
        for (final Card c : me.getCreaturesInPlay()) {
            if (c.getName().equals("Grizzly Bears")) {
                bears++;
            }
        }
        AssertJUnit.assertEquals(gameStateToString(game), 4, bears);
    }

    @Test(timeOut = T)
    public void graveVenerationsMonarchAndDrain() {
        newGame(4);
        cast(me, "Grave Venerations");
        AssertJUnit.assertTrue(me.isMonarch());
        murder(addCard("Grizzly Bears", me));
        for (final Player o : opps) {
            AssertJUnit.assertEquals(19, o.getLife());
        }
        playTo(PhaseType.CLEANUP);
        AssertJUnit.assertTrue("returned at end step", me.getCardsIn(ZoneType.Hand).anyMatch(c -> c.getName().equals("Grizzly Bears")));
    }

    @Test(timeOut = T)
    public void meathookMassacreDrainsBothWays() {
        newGame(3);
        addCard("The Meathook Massacre", me);
        murder(addCard("Grizzly Bears", me));
        for (final Player o : opps) {
            AssertJUnit.assertEquals(19, o.getLife());
        }
        murder(addCard("Grizzly Bears", opps.get(0)));
        AssertJUnit.assertEquals(21, me.getLife());
    }

    // ---------------------------------------------------------------- batch 5

    @Test(timeOut = T)
    public void ojerKaslemReturnsAsTappedLand() {
        newGame(3);
        final Card o = addCard("Ojer Kaslem, Deepest Growth", me);
        murder(o);
        final Card back = me.getCardsIn(ZoneType.Battlefield).isEmpty() ? null : me.getCardsIn(ZoneType.Battlefield).get(0);
        AssertJUnit.assertNotNull(back);
        AssertJUnit.assertTrue(back.isLand());
        AssertJUnit.assertFalse(back.isCreature());
        AssertJUnit.assertTrue(back.isTapped());
    }

    @Test(timeOut = T)
    public void vaevictisMakesEachPlayerSacrificeAndReveal() {
        newGame(4);
        final Card v = bf("Vaevictis Asmadi, the Dire", me);
        addCard("Swamp", me);
        for (final Player o : opps) {
            addCard("Sol Ring", o);
        }
        for (final Player p : game.getPlayers()) {
            addCardToZone("Grizzly Bears", p, ZoneType.Library);
        }
        playTo(PhaseType.COMBAT_DECLARE_BLOCKERS);
        AssertJUnit.assertNotNull("setup: attacked", game.getCombat());
        AssertJUnit.assertTrue(game.getCombat().isAttacking(v));
        for (final Player o : opps) {
            AssertJUnit.assertFalse(o + " sacrificed Sol Ring", o.getCardsIn(ZoneType.Battlefield).anyMatch(c -> c.getName().equals("Sol Ring")));
            AssertJUnit.assertTrue(o + " got its top permanent card (an Island) " + gameStateToString(game), o.getCardsIn(ZoneType.Battlefield).anyMatch(c -> c.getName().equals("Island")));
        }
    }

    @Test(timeOut = T)
    public void junjiDiesAndAModeHappens() {
        newGame(4);
        final Card j = addCard("Junji, the Midnight Sky", me);
        addCardToZone("Serra Angel", opps.get(0), ZoneType.Graveyard);
        for (final Player o : opps) {
            hand("Island", o);
            hand("Island", o);
        }
        murder(j);
        final boolean discardMode = opps.stream().allMatch(o -> o.getLife() == 18 && o.getCardsIn(ZoneType.Hand).isEmpty());
        final Card angel = findCardWithName(game, "Serra Angel");
        final boolean reviveMode = angel != null && angel.getController() == me && me.getLife() == 18;
        AssertJUnit.assertTrue(gameStateToString(game), discardMode || reviveMode);
    }

    @Test(timeOut = T)
    public void necronDeathmarkDestroysAndMills() {
        newGame(3);
        final Card target = addCard("Serra Angel", opps.get(0));
        cast(me, "Necron Deathmark");
        AssertJUnit.assertNull("destroyed (AI picked the only opposing creature)", findCardWithName(game, "Serra Angel"));
        int milled = 0;
        for (final Player p : game.getPlayers()) {
            milled += p.getCardsIn(ZoneType.Graveyard).size() - (p.getCardsIn(ZoneType.Graveyard).anyMatch(c -> c.getName().equals("Serra Angel")) ? 1 : 0);
        }
        AssertJUnit.assertEquals(3, milled);
    }

    @Test(timeOut = T)
    public void aeridKonstrariMakesHeartwoodOnEnterAndDeath() {
        newGame(3);
        cast(me, "Aerid Konstrari");
        AssertJUnit.assertEquals(1, countTokens(me, "Artifact"));
        murder(findCardWithName(game, "Aerid Konstrari"));
        AssertJUnit.assertEquals(2, countTokens(me, "Artifact"));
    }

    @Test(timeOut = T)
    public void kograFightsOnEnter() {
        newGame(3);
        addCard("Hill Giant", opps.get(0));
        cast(me, "Kogla, the Titan Ape");
        AssertJUnit.assertEquals(0, opps.get(0).getCreaturesInPlay().size());
    }

    @Test(timeOut = T)
    public void woeStriderMakesGoat() {
        newGame(3);
        cast(me, "Woe Strider");
        AssertJUnit.assertEquals(1, countTokens(me, "Goat"));
    }

    /** Henzie + Chainer (both in the Henzie deck): a creature cast from the graveyard can be cast for its blitz cost. */
    @Test(timeOut = T)
    public void henzieBlitzFromGraveyardWithChainer() {
        newCommanderGame(2, "Henzie \"Toolbox\" Torre");
        commanderToBattlefield();
        final Card chainer = bf("Chainer, Nightmare Adept", me);
        hand("Island", me); // discard fodder
        addCards("Swamp", 6, me);
        final Card kokusho = addCardToZone("Kokusho, the Evening Star", me, ZoneType.Graveyard);
        final SpellAbility ab = chainer.getSpellAbilities().stream().filter(SpellAbility::isActivatedAbility).findFirst().get();
        ab.setActivatingPlayer(me);
        game.getStack().add(ab); // discard cost not paid: the effect is what matters
        resolveAll();
        SpellAbility blitz = null;
        SpellAbility normal = null;
        final StringBuilder all = new StringBuilder();
        for (final SpellAbility sa : kokusho.getAllPossibleAbilities(me, true)) {
            all.append(sa).append(" | ");
            if (sa.isBlitz()) {
                blitz = sa;
            } else if (sa.isSpell()) {
                normal = sa;
            }
        }
        AssertJUnit.assertNotNull("setup: Chainer lets Kokusho be cast from the graveyard: " + all + " cmd=" + game.getCardsIn(ZoneType.Command) + " mayplay=" + kokusho.getMayPlay() + " zone=" + kokusho.getZone() + " log=" + game.getGameLog().getLogEntries(null), normal);
        AssertJUnit.assertNotNull("blitz offered from the graveyard: " + all, blitz);
        blitz.setActivatingPlayer(me);
        AssertJUnit.assertTrue(ComputerUtil.playStack(blitz, me, game));
        resolveAll();
        final Card k = findCardWithName(game, "Kokusho, the Evening Star");
        AssertJUnit.assertNotNull(k);
        AssertJUnit.assertTrue(k.hasKeyword(Keyword.HASTE));
    }
}
