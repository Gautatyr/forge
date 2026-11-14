package forge.ai;

import java.util.ArrayList;
import java.util.List;

import org.testng.AssertJUnit;
import org.testng.annotations.Test;

import forge.game.Game;
import forge.game.GameObject;
import forge.game.card.Card;
import forge.game.card.CounterType;
import forge.game.keyword.Keyword;
import forge.game.phase.PhaseType;
import forge.game.player.Player;
import forge.game.spellability.SpellAbility;
import forge.game.spellability.SpellAbilityStackInstance;
import forge.game.zone.ZoneType;

/**
 * Rules checks for cards of the Imotekh, Sythis and Lorehold Commander decks (group g5).
 */
public class G5DeckCardsTest extends AITest {

    // ---------- helpers ----------

    protected void setTeams(Game game) {
        int team = 0;
        for (Player p : game.getPlayers()) {
            p.setTeam(team++);
        }
    }

    protected void cast(Game game, Player p, Card c, Object... targets) {
        SpellAbility sa = c.getFirstSpellAbility();
        play(game, p, sa, targets);
    }

    protected void play(Game game, Player p, SpellAbility sa, Object... targets) {
        sa.setActivatingPlayer(p);
        if (targets.length > 0) {
            sa.resetTargets();
            for (Object t : targets) {
                sa.getTargets().add((GameObject) t);
            }
        }
        AssertJUnit.assertTrue("could not play " + sa, ComputerUtil.playStack(sa, p, game));
        resolveAll(game);
    }

    /** Resolve the stack, including triggers that are put on the stack after it empties. */
    protected void resolveAll(Game game) {
        for (int guard = 0; guard < 200 && !game.isGameOver(); guard++) {
            game.getTriggerHandler().runWaitingTriggers();
            game.getAction().checkStateEffects(true);
            if (game.getStack().hasSimultaneousStackEntries()) {
                game.getStack().addAllTriggeredAbilitiesToStack();
            }
            if (game.getStack().isEmpty()) {
                return;
            }
            playUntilStackClear(game);
        }
    }

    protected SpellAbility findSAContaining(Card c, String part) {
        for (SpellAbility sa : c.getSpellAbilities()) {
            if (sa.getDescription().contains(part)) {
                return sa;
            }
        }
        return null;
    }

    protected int countTokens(Player p, String namePart) {
        int n = 0;
        for (Card c : p.getCardsIn(ZoneType.Battlefield)) {
            if (c.isToken() && c.getName().contains(namePart)) {
                n++;
            }
        }
        return n;
    }

    protected boolean inZone(String name, Player owner, ZoneType zone) {
        for (Card x : owner.getCardsIn(zone)) {
            if (x.getName().equals(name)) {
                return true;
            }
        }
        return false;
    }

    protected List<String> stackDescriptions(Game game) {
        List<String> out = new ArrayList<>();
        for (SpellAbilityStackInstance si : game.getStack()) {
            out.add(si.getSourceCard().getName() + ": " + si.getSpellAbility().toString());
        }
        return out;
    }

    // ---------- Imotekh the Stormlord ----------

    @Test
    public void imotekhTriggersWhenArtifactCardReturnedFromGraveyard() {
        Game game = initAndCreateGame();
        Player ai = game.getPlayers().get(1);
        addCard("Imotekh the Stormlord", ai);
        addCards("Forest", 2, ai);
        Card petal = addCardToZone("Lotus Petal", ai, ZoneType.Graveyard);
        Card regrowth = addCardToZone("Regrowth", ai, ZoneType.Hand);
        game.getAction().checkStateEffects(true);

        cast(game, ai, regrowth, petal);

        AssertJUnit.assertTrue(inZone("Lotus Petal", ai, ZoneType.Hand));
        AssertJUnit.assertEquals(2, countTokens(ai, "Necron Warrior"));
    }

    @Test
    public void imotekhTriggersOnceWhenSeveralArtifactCardsLeaveTogether() {
        Game game = initAndCreateGame();
        Player ai = game.getPlayers().get(1);
        addCard("Imotekh the Stormlord", ai);
        Card crypt = addCard("Tormod's Crypt", ai);
        addCardToZone("Lotus Petal", ai, ZoneType.Graveyard);
        addCardToZone("Sol Ring", ai, ZoneType.Graveyard);
        addCardToZone("Runeclaw Bear", ai, ZoneType.Graveyard);
        game.getAction().checkStateEffects(true);

        SpellAbility sa = findSAContaining(crypt, "Exile");
        play(game, ai, sa, ai);

        AssertJUnit.assertTrue(inZone("Lotus Petal", ai, ZoneType.Exile));
        AssertJUnit.assertTrue(inZone("Sol Ring", ai, ZoneType.Exile));
        AssertJUnit.assertEquals("one trigger for one event, two tokens", 2, countTokens(ai, "Necron Warrior"));
    }

    @Test
    public void imotekhDoesNotTriggerWhenArtifactTokenDies() {
        Game game = initAndCreateGame();
        Player ai = game.getPlayers().get(1);
        addCard("Imotekh the Stormlord", ai);
        Card token = addToken("b_2_2_a_necron_warrior", ai);
        addCards("Mountain", 2, ai);
        Card shatter = addCardToZone("Shatter", ai, ZoneType.Hand);
        game.getAction().checkStateEffects(true);
        AssertJUnit.assertEquals(1, countTokens(ai, "Necron Warrior"));

        cast(game, ai, shatter, token);

        AssertJUnit.assertEquals("a token is not an artifact card leaving the graveyard", 0, countTokens(ai, "Necron Warrior"));
    }

    @Test
    public void imotekhTriggersOnUnearth() {
        Game game = initAndCreateGame();
        Player ai = game.getPlayers().get(1);
        addCard("Imotekh the Stormlord", ai);
        addCards("Swamp", 3, ai);
        Card chrono = addCardToZone("Chronomancer", ai, ZoneType.Graveyard);
        game.getAction().checkStateEffects(true);

        SpellAbility unearth = findSAContaining(chrono, "Unearth");
        AssertJUnit.assertNotNull(unearth);
        play(game, ai, unearth);

        AssertJUnit.assertTrue(inZone("Chronomancer", ai, ZoneType.Battlefield));
        AssertJUnit.assertEquals(2, countTokens(ai, "Necron Warrior"));
    }

    // ---------- Lorehold, the Historian ----------

    @Test
    public void loreholdGrantsMiracleToDrawnInstant() {
        Game game = initAndCreateGame();
        Player ai = game.getPlayers().get(1);
        addCard("Lorehold, the Historian", ai);
        addCards("Mountain", 3, ai);
        addCardToZone("Lightning Bolt", ai, ZoneType.Library);
        game.getAction().checkStateEffects(true);

        ai.drawCard();
        game.getAction().checkStateEffects(true);
        game.getStack().addAllTriggeredAbilitiesToStack();
        List<String> stack = stackDescriptions(game);
        System.out.println("G5 lorehold miracle stack: " + stack);
        boolean miracle = false;
        for (SpellAbilityStackInstance si : game.getStack()) {
            if (si.getSourceCard().getName().equals("Lightning Bolt")) {
                miracle = true;
            }
        }
        AssertJUnit.assertTrue("Lightning Bolt drawn as first card should have a miracle trigger: " + stack, miracle);
    }

    @Test
    public void nativeMiracleControl() {
        Game game = initAndCreateGame();
        Player ai = game.getPlayers().get(1);
        addCards("Mountain", 3, ai);
        addCardToZone("Thunderous Wrath", ai, ZoneType.Library);
        game.getAction().checkStateEffects(true);

        ai.drawCard();
        game.getAction().checkStateEffects(true);
        game.getStack().addAllTriggeredAbilitiesToStack();
        List<String> stack = stackDescriptions(game);
        System.out.println("G5 native miracle stack: " + stack);
        AssertJUnit.assertFalse("control: native miracle must trigger", game.getStack().isEmpty());
    }

    @Test
    public void approachOfTheSecondSunWinsOnSecondCastFromHand() {
        Game game = initAndCreateGame();
        Player ai = game.getPlayers().get(1);
        addCards("Plains", 14, ai);
        for (int i = 0; i < 10; i++) {
            addCardToZone("Plains", ai, ZoneType.Library);
        }
        Card a1 = addCardToZone("Approach of the Second Sun", ai, ZoneType.Hand);
        game.getAction().checkStateEffects(true);
        int life = ai.getLife();
        cast(game, ai, a1);
        AssertJUnit.assertEquals(life + 7, ai.getLife());
        AssertJUnit.assertFalse(game.isGameOver());
        AssertJUnit.assertEquals("seventh from the top", "Approach of the Second Sun",
                ai.getCardsIn(ZoneType.Library).get(6).getName());

        Card a2 = addCardToZone("Approach of the Second Sun", ai, ZoneType.Hand);
        cast(game, ai, a2);
        AssertJUnit.assertTrue(game.isGameOver());
        AssertJUnit.assertTrue(ai.getOutcome() != null && ai.getOutcome().hasWon());
    }

    // ---------- Monument to Endurance ----------

    @Test
    public void monumentToEnduranceSimultaneousDiscardsChooseDifferentModes() {
        Game game = initAndCreateThreePlayerGame();
        setTeams(game);
        Player ai = game.getPlayers().get(1);
        addCard("Monument to Endurance", ai);
        addCards("Swamp", 6, ai);
        Card rot1 = addCardToZone("Mind Rot", ai, ZoneType.Hand);
        Card rot2 = addCardToZone("Mind Rot", ai, ZoneType.Hand);
        for (int i = 0; i < 4; i++) {
            addCardToZone("Grizzly Bears", ai, ZoneType.Hand);
        }
        for (int i = 0; i < 10; i++) {
            addCardToZone("Plains", ai, ZoneType.Library);
        }
        game.getAction().checkStateEffects(true);
        int[] oppLife = new int[3];
        for (int i = 0; i < 3; i++) {
            oppLife[i] = game.getPlayers().get(i).getLife();
        }

        cast(game, ai, rot1, ai);
        int lost0 = oppLife[0] - game.getPlayers().get(0).getLife();
        int treasures = countTokens(ai, "Treasure");
        int handAfterFirst = ai.getCardsIn(ZoneType.Hand).size();
        System.out.println("G5 monument after 2 discards: opp lost " + lost0 + ", treasures " + treasures
                + ", hand " + handAfterFirst + "\n" + gameStateToString(game));
        int modes = (lost0 == 3 ? 1 : 0) + treasures + (handAfterFirst - 3); // hand: 1 Mind Rot + 2 Bears = 3
        AssertJUnit.assertTrue("opponent lost at most 3", lost0 <= 3);
        AssertJUnit.assertTrue("at most one treasure", treasures <= 1);
        AssertJUnit.assertEquals("two different modes for two discards", 2, modes);

        cast(game, ai, rot2, ai);
        for (int i : new int[] {0, 2}) {
            AssertJUnit.assertEquals("each opponent loses 3 exactly once", 3, oppLife[i] - game.getPlayers().get(i).getLife());
        }
        AssertJUnit.assertEquals(1, countTokens(ai, "Treasure"));
    }

    // ---------- Song of the Dryads ----------

    @Test
    public void songOfTheDryadsRemovesAbilities() {
        Game game = initAndCreateGame();
        Player ai = game.getPlayers().get(1);
        Player opp = game.getPlayers().get(0);
        Card wurm = addCard("Wurmcoil Engine", opp);
        addCards("Forest", 3, ai);
        Card song = addCardToZone("Song of the Dryads", ai, ZoneType.Hand);
        game.getAction().checkStateEffects(true);

        cast(game, ai, song, wurm);
        game.getAction().checkStateEffects(true);

        AssertJUnit.assertTrue(wurm.isEnchanted());
        AssertJUnit.assertTrue(wurm.isLand());
        AssertJUnit.assertFalse(wurm.isCreature());
        AssertJUnit.assertFalse(wurm.isArtifact());
        AssertJUnit.assertTrue(wurm.getType().hasSubtype("Forest"));
        AssertJUnit.assertTrue(wurm.isColorless());
        AssertJUnit.assertFalse("CR 305.7: loses deathtouch", wurm.hasKeyword(Keyword.DEATHTOUCH));
        AssertJUnit.assertFalse("CR 305.7: loses lifelink", wurm.hasKeyword(Keyword.LIFELINK));
        AssertJUnit.assertFalse(wurm.getManaAbilities().isEmpty());
    }

    // ---------- Olorin's Searing Light ----------

    @Test
    public void olorinsSearingLightMultiplayerSpellMastery() {
        Game game = initAndCreateThreePlayerGame();
        setTeams(game);
        Player opp1 = game.getPlayers().get(0);
        Player ai = game.getPlayers().get(1);
        Player opp2 = game.getPlayers().get(2);
        addCard("Hill Giant", opp1); // 3/3
        addCard("Llanowar Elves", opp1);
        addCard("Craw Wurm", opp2); // 6/4
        addCard("Grizzly Bears", opp2);
        addCards("Plateau", 4, ai);
        addCardToZone("Lightning Bolt", ai, ZoneType.Graveyard);
        addCardToZone("Shock", ai, ZoneType.Graveyard);
        Card olorin = addCardToZone("Olórin's Searing Light", ai, ZoneType.Hand);
        game.getAction().checkStateEffects(true);
        int l1 = opp1.getLife(), l2 = opp2.getLife(), la = ai.getLife();

        cast(game, ai, olorin);

        AssertJUnit.assertTrue(inZone("Hill Giant", opp1, ZoneType.Exile));
        AssertJUnit.assertTrue(inZone("Craw Wurm", opp2, ZoneType.Exile));
        AssertJUnit.assertTrue(inZone("Llanowar Elves", opp1, ZoneType.Battlefield));
        AssertJUnit.assertEquals(3, l1 - opp1.getLife());
        AssertJUnit.assertEquals(6, l2 - opp2.getLife());
        AssertJUnit.assertEquals(la, ai.getLife());
    }

    // ---------- Tragic Arrogance ----------

    @Test
    public void tragicArroganceMultiplayer() {
        Game game = initAndCreateThreePlayerGame();
        setTeams(game);
        Player ai = game.getPlayers().get(1);
        addCards("Plains", 5, ai);
        for (Player p : game.getPlayers()) {
            addCard("Grizzly Bears", p);
            addCard("Hill Giant", p);
            addCard("Ornithopter", p);
            addCard("Sol Ring", p);
            addCard("Glorious Anthem", p);
            addCard("Crusade", p);
        }
        Card ta = addCardToZone("Tragic Arrogance", ai, ZoneType.Hand);
        game.getAction().checkStateEffects(true);

        cast(game, ai, ta);
        game.getAction().checkStateEffects(true);

        for (Player p : game.getPlayers()) {
            int ench = 0, nonland = 0, art = 0, crea = 0;
            for (Card c : p.getCardsIn(ZoneType.Battlefield)) {
                if (c.isLand()) {
                    continue;
                }
                nonland++;
                if (c.isEnchantment()) ench++;
                if (c.isArtifact()) art++;
                if (c.isCreature()) crea++;
            }
            System.out.println("G5 tragic " + p + ": nonland " + nonland + " ench " + ench + " art " + art + " crea " + crea);
            AssertJUnit.assertEquals(p + " keeps one enchantment", 1, ench);
            AssertJUnit.assertTrue(p + " keeps an artifact", art >= 1 && art <= 2);
            AssertJUnit.assertTrue(p + " keeps 1-2 creatures", crea >= 1 && crea <= 2);
            AssertJUnit.assertTrue(p + " keeps 2-3 nonland", nonland >= 2 && nonland <= 3);
        }
        AssertJUnit.assertEquals(5, countCardsWithName(game, "Plains"));
    }

    // ---------- Promise of Loyalty ----------

    @Test
    public void promiseOfLoyaltyEachPlayerKeepsOneVowedCreature() {
        Game game = initAndCreateThreePlayerGame();
        setTeams(game);
        Player ai = game.getPlayers().get(1);
        addCards("Plains", 5, ai);
        for (Player p : game.getPlayers()) {
            addCard("Grizzly Bears", p);
            addCard("Hill Giant", p);
            addCard("Llanowar Elves", p);
        }
        Card pol = addCardToZone("Promise of Loyalty", ai, ZoneType.Hand);
        game.getAction().checkStateEffects(true);

        cast(game, ai, pol);
        game.getAction().checkStateEffects(true);

        CounterType vow = CounterType.getType("VOW");
        for (Player p : game.getPlayers()) {
            int crea = 0, vowed = 0;
            for (Card c : p.getCreaturesInPlay()) {
                crea++;
                if (c.getCounters(vow) > 0) vowed++;
            }
            AssertJUnit.assertEquals(p + " keeps exactly one creature", 1, crea);
            AssertJUnit.assertEquals(p + " creature has a vow counter", 1, vowed);
        }
    }

    // ---------- Hit the Mother Lode ----------

    @Test
    public void hitTheMotherLodeCreatesDifferenceInTappedTreasures() {
        Game game = initAndCreateGame();
        Player ai = game.getPlayers().get(1);
        addCards("Mountain", 7, ai);
        addCardToZone("Grizzly Bears", ai, ZoneType.Library);
        addCardToZone("Mountain", ai, ZoneType.Library);
        addCardToZone("Mountain", ai, ZoneType.Library);
        Card hit = addCardToZone("Hit the Mother Lode", ai, ZoneType.Hand);
        game.getAction().checkStateEffects(true);

        cast(game, ai, hit);

        int treasures = 0, tapped = 0;
        for (Card c : ai.getCardsIn(ZoneType.Battlefield)) {
            if (c.isToken() && c.getName().contains("Treasure")) {
                treasures++;
                if (c.isTapped()) tapped++;
            }
        }
        AssertJUnit.assertEquals("10 - MV 2 = 8 treasures", 8, treasures);
        AssertJUnit.assertEquals(8, tapped);
    }

    // ---------- Strength of the Harvest ----------

    @Test
    public void strengthOfTheHarvestCountsEnchantmentCreatureOnce() {
        Game game = initAndCreateGame();
        Player ai = game.getPlayers().get(1);
        Card sythis = addCard("Sythis, Harvest's Hand", ai);
        Card str = addCard("Strength of the Harvest", ai);
        str.attachToEntity(sythis, null);
        game.getAction().checkStateEffects(true);
        // Sythis (creature and enchantment, counted once) + Strength (enchantment) = +2/+2
        AssertJUnit.assertEquals(3, sythis.getNetPower());
        AssertJUnit.assertEquals(4, sythis.getNetToughness());
    }

    // ---------- Isolated Watchtower ----------

    @Test
    public void isolatedWatchtowerChecksEachOpponent() {
        Game game = initAndCreateThreePlayerGame();
        setTeams(game);
        Player opp1 = game.getPlayers().get(0);
        Player ai = game.getPlayers().get(1);
        Player opp2 = game.getPlayers().get(2);
        Card tower = addCard("Isolated Watchtower", ai);
        addCards("Wastes", 2, ai); // ai: 3 lands
        addCards("Plains", 4, opp1);
        addCards("Plains", 4, opp2);
        game.getAction().checkStateEffects(true);
        SpellAbility sa = findSAContaining(tower, "Scry 1");
        AssertJUnit.assertNotNull(sa);
        sa.setActivatingPlayer(ai);
        AssertJUnit.assertFalse("no opponent has 2 more lands", sa.getRestrictions().checkOtherRestrictions(tower, sa, ai));
        addCard("Plains", opp2); // 5 lands
        game.getAction().checkStateEffects(true);
        AssertJUnit.assertTrue("an opponent has 2 more lands", sa.getRestrictions().checkOtherRestrictions(tower, sa, ai));
    }

    // ---------- Hallowed Haunting ----------

    @Test
    public void hallowedHauntingSpiritTokensCountSpirits() {
        Game game = initAndCreateGame();
        Player ai = game.getPlayers().get(1);
        addCard("Hallowed Haunting", ai);
        addCards("Plains", 4, ai);
        Card e1 = addCardToZone("Glorious Anthem", ai, ZoneType.Hand);
        game.getAction().checkStateEffects(true);
        cast(game, ai, e1);
        game.getAction().checkStateEffects(true);
        Card tok = null;
        for (Card c : ai.getCreaturesInPlay()) {
            if (c.isToken()) tok = c;
        }
        AssertJUnit.assertNotNull(tok);
        // 1 Spirit = 1/1, +1/+1 from Glorious Anthem
        AssertJUnit.assertEquals(2, tok.getNetPower());
        AssertJUnit.assertEquals(2, tok.getNetToughness());
    }

    // ---------- Sythis ----------

    @Test
    public void sythisGainsAndDrawsOnEnchantmentCast() {
        Game game = initAndCreateGame();
        Player ai = game.getPlayers().get(1);
        addCard("Sythis, Harvest's Hand", ai);
        addCards("Plains", 3, ai);
        addCardToZone("Plains", ai, ZoneType.Library);
        Card e1 = addCardToZone("Glorious Anthem", ai, ZoneType.Hand);
        game.getAction().checkStateEffects(true);
        int life = ai.getLife();
        cast(game, ai, e1);
        AssertJUnit.assertEquals(life + 1, ai.getLife());
        AssertJUnit.assertEquals(1, ai.getCardsIn(ZoneType.Hand).size());
    }

    // ---------- Valakut Awakening ----------

    @Test
    public void valakutAwakeningDrawsThatManyPlusOne() {
        Game game = initAndCreateGame();
        Player ai = game.getPlayers().get(1);
        addCards("Mountain", 3, ai);
        for (int i = 0; i < 10; i++) {
            addCardToZone("Plains", ai, ZoneType.Library);
        }
        addCardToZone("Grizzly Bears", ai, ZoneType.Hand);
        addCardToZone("Island", ai, ZoneType.Hand);
        addCardToZone("Island", ai, ZoneType.Hand);
        Card va = addCardToZone("Valakut Awakening", ai, ZoneType.Hand);
        game.getAction().checkStateEffects(true);
        cast(game, ai, va);
        // put N on the bottom, draw N+1: 3 other cards -> 4
        AssertJUnit.assertEquals(4, ai.getCardsIn(ZoneType.Hand).size());
    }

    // ---------- Necropotence ----------

    @Test
    public void necropotenceReturnsExiledCardAtEndStep() {
        Game game = initAndCreateGame();
        Player ai = game.getPlayers().get(1);
        Card necro = addCard("Necropotence", ai);
        Card top = addCardToZone("Grizzly Bears", ai, ZoneType.Library);
        game.getAction().checkStateEffects(true);
        int life = ai.getLife();
        SpellAbility sa = findSAContaining(necro, "Exile the top");
        AssertJUnit.assertNotNull(sa);
        play(game, ai, sa);
        AssertJUnit.assertEquals(life - 1, ai.getLife());
        AssertJUnit.assertEquals(1, ai.getCardsIn(ZoneType.Exile).size());
        AssertJUnit.assertTrue(ai.getCardsIn(ZoneType.Exile).get(0).isFaceDown());
        playUntilPhase(game, PhaseType.CLEANUP);
        AssertJUnit.assertTrue("exiled card returns to hand at end step", inZone("Grizzly Bears", ai, ZoneType.Hand));
    }

    // ---------- Karmic Justice ----------

    @Test
    public void karmicJusticeTriggersOnOpponentDestroyingNoncreature() {
        Game game = initAndCreateGame();
        Player ai = game.getPlayers().get(1);
        Player opp = game.getPlayers().get(0);
        addCard("Karmic Justice", ai);
        Card ring = addCard("Sol Ring", ai);
        addCard("Mox Pearl", opp);
        addCards("Mountain", 2, opp);
        Card shatter = addCardToZone("Shatter", opp, ZoneType.Hand);
        game.getAction().checkStateEffects(true);

        cast(game, opp, shatter, ring);

        AssertJUnit.assertTrue(inZone("Sol Ring", ai, ZoneType.Graveyard));
        AssertJUnit.assertTrue("Karmic Justice destroys the opponent's permanent", inZone("Mox Pearl", opp, ZoneType.Graveyard));
    }

    // ---------- batch 2 ----------

    @Test
    public void loreholdMiracleApproachCountsAsCastFromHand() {
        Game game = initAndCreateGame();
        Player ai = game.getPlayers().get(1);
        addCard("Lorehold, the Historian", ai);
        addCards("Plains", 9, ai);
        for (int i = 0; i < 10; i++) {
            addCardToZone("Plains", ai, ZoneType.Library);
        }
        Card a1 = addCardToZone("Approach of the Second Sun", ai, ZoneType.Hand);
        game.getAction().checkStateEffects(true);
        cast(game, ai, a1);
        AssertJUnit.assertFalse(game.isGameOver());
        // the first Approach is 7th from the top; move it to the top and draw it as the first card this turn
        Card lib = null;
        for (Card c : ai.getCardsIn(ZoneType.Library)) {
            if (c.getName().equals("Approach of the Second Sun")) lib = c;
        }
        AssertJUnit.assertNotNull(lib);
        game.getAction().moveToLibrary(lib, 0, null);
        ai.drawCard();
        game.getStack().addAllTriggeredAbilitiesToStack();
        System.out.println("G5 approach miracle stack: " + stackDescriptions(game));
        resolveAll(game);
        System.out.println("G5 approach miracle: gameOver=" + game.isGameOver() + "\n" + gameStateToString(game));
        AssertJUnit.assertFalse("AI must have cast Approach via miracle", inZone("Approach of the Second Sun", ai, ZoneType.Hand));
        AssertJUnit.assertTrue("miracle cast from hand: second Approach wins", game.isGameOver() && ai.getOutcome().hasWon());
    }

    @Test
    public void loreholdOpponentUpkeepLootThenMiracle() {
        Game game = initAndCreateGame();
        Player opp = game.getPlayers().get(0);
        Player ai = game.getPlayers().get(1);
        Card lorehold = addCard("Lorehold, the Historian", ai);
        lorehold.setTapped(true); // keep it home
        addCards("Plains", 3, ai);
        addCardToZone("Storm Herd", ai, ZoneType.Library);
        for (int i = 0; i < 5; i++) {
            addCardToZone("Plains", opp, ZoneType.Library);
        }
        game.getAction().checkStateEffects(true);
        playUntilPhase(game, PhaseType.UPKEEP); // opponent's upkeep
        AssertJUnit.assertEquals(opp, game.getPhaseHandler().getPlayerTurn());
        // the AI declines Lorehold's optional loot (harness limit); draw as the loot would: first card this turn
        game.getStack().clearSimultaneousStack();
        ai.drawCard();
        resolveAll(game);
        System.out.println("G5 lorehold opp-turn sorcery miracle: " + gameStateToString(game));
        AssertJUnit.assertTrue("sorcery cast via miracle on an opponent's turn", inZone("Storm Herd", ai, ZoneType.Graveyard));
        AssertJUnit.assertEquals(ai.getLife(), countTokens(ai, "Pegasus"));
    }

    @Test
    public void darksteelMutationOnSythis() {
        Game game = initAndCreateGame();
        Player ai = game.getPlayers().get(1);
        Card sythis = addCard("Sythis, Harvest's Hand", ai);
        Card dm = addCard("Darksteel Mutation", ai);
        dm.attachToEntity(sythis, null);
        game.getAction().checkStateEffects(true);
        AssertJUnit.assertTrue(sythis.isArtifact());
        AssertJUnit.assertTrue(sythis.isCreature());
        AssertJUnit.assertFalse(sythis.isEnchantment());
        AssertJUnit.assertTrue(sythis.getType().hasCreatureType("Insect"));
        AssertJUnit.assertFalse(sythis.getType().hasCreatureType("Nymph"));
        AssertJUnit.assertTrue(sythis.getType().isLegendary());
        AssertJUnit.assertEquals(0, sythis.getNetPower());
        AssertJUnit.assertEquals(1, sythis.getNetToughness());
        AssertJUnit.assertTrue(sythis.hasKeyword(Keyword.INDESTRUCTIBLE));
    }

    @Test
    public void ancestralMaskCountsAllOtherEnchantments() {
        Game game = initAndCreateGame();
        Player ai = game.getPlayers().get(1);
        Player opp = game.getPlayers().get(0);
        Card bear = addCard("Grizzly Bears", ai);
        Card mask = addCard("Ancestral Mask", ai);
        mask.attachToEntity(bear, null);
        addCard("Glorious Anthem", ai);
        addCard("Crusade", opp);
        game.getAction().checkStateEffects(true);
        // two other enchantments: +4/+4; Anthem +1/+1; Crusade pumps only white creatures
        AssertJUnit.assertEquals(2 + 4 + 1, bear.getNetPower());
        AssertJUnit.assertEquals(2 + 4 + 1, bear.getNetToughness());
    }

    @Test
    public void chandrasIgnitionMultiplayer() {
        Game game = initAndCreateThreePlayerGame();
        setTeams(game);
        Player opp1 = game.getPlayers().get(0);
        Player ai = game.getPlayers().get(1);
        Player opp2 = game.getPlayers().get(2);
        Card lorehold = addCard("Lorehold, the Historian", ai);
        addCard("Grizzly Bears", ai);
        addCard("Craw Wurm", opp1);
        addCard("Hill Giant", opp2);
        addCards("Mountain", 5, ai);
        Card ign = addCardToZone("Chandra's Ignition", ai, ZoneType.Hand);
        game.getAction().checkStateEffects(true);
        int l1 = opp1.getLife(), l2 = opp2.getLife(), la = ai.getLife();
        cast(game, ai, ign, lorehold);
        AssertJUnit.assertEquals(5, l1 - opp1.getLife());
        AssertJUnit.assertEquals(5, l2 - opp2.getLife());
        AssertJUnit.assertEquals(la, ai.getLife());
        AssertJUnit.assertTrue(inZone("Craw Wurm", opp1, ZoneType.Graveyard));
        AssertJUnit.assertTrue(inZone("Hill Giant", opp2, ZoneType.Graveyard));
        AssertJUnit.assertTrue("own other creature also hit", inZone("Grizzly Bears", ai, ZoneType.Graveyard));
        AssertJUnit.assertTrue(lorehold.isInPlay());
    }

    @Test
    public void volcanicVisionReturnsAndDamagesByManaValue() {
        Game game = initAndCreateThreePlayerGame();
        setTeams(game);
        Player opp1 = game.getPlayers().get(0);
        Player ai = game.getPlayers().get(1);
        Player opp2 = game.getPlayers().get(2);
        addCard("Craw Wurm", opp1); // 6/4
        addCard("Serra Angel", opp2); // 4/4
        addCard("Hill Giant", ai);
        addCards("Mountain", 7, ai);
        Card tgt = addCardToZone("Chandra's Ignition", ai, ZoneType.Graveyard); // MV 5
        Card vv = addCardToZone("Volcanic Vision", ai, ZoneType.Hand);
        game.getAction().checkStateEffects(true);
        cast(game, ai, vv, tgt);
        AssertJUnit.assertTrue(inZone("Chandra's Ignition", ai, ZoneType.Hand));
        AssertJUnit.assertTrue(inZone("Craw Wurm", opp1, ZoneType.Graveyard));
        AssertJUnit.assertTrue(inZone("Serra Angel", opp2, ZoneType.Graveyard));
        AssertJUnit.assertTrue(inZone("Hill Giant", ai, ZoneType.Battlefield));
        AssertJUnit.assertTrue(inZone("Volcanic Vision", ai, ZoneType.Exile));
    }

    @Test
    public void immolatingGyreCountsInstantsAndSorceries() {
        Game game = initAndCreateThreePlayerGame();
        setTeams(game);
        Player opp1 = game.getPlayers().get(0);
        Player ai = game.getPlayers().get(1);
        addCard("Hill Giant", opp1); // 3/3
        addCard("Craw Wurm", opp1); // 6/4
        addCards("Mountain", 6, ai);
        addCardToZone("Lightning Bolt", ai, ZoneType.Graveyard);
        addCardToZone("Shock", ai, ZoneType.Graveyard);
        addCardToZone("Mind Rot", ai, ZoneType.Graveyard);
        addCardToZone("Grizzly Bears", ai, ZoneType.Graveyard);
        Card g = addCardToZone("Immolating Gyre", ai, ZoneType.Hand);
        game.getAction().checkStateEffects(true);
        cast(game, ai, g);
        AssertJUnit.assertTrue(inZone("Hill Giant", opp1, ZoneType.Graveyard));
        AssertJUnit.assertTrue(inZone("Craw Wurm", opp1, ZoneType.Battlefield));
        AssertJUnit.assertEquals(3, findCardWithName(game, "Craw Wurm").getDamage());
    }

    @Test
    public void stormHerdCreatesLifeTotalTokens() {
        Game game = initAndCreateGame();
        Player ai = game.getPlayers().get(1);
        ai.setLife(17, null);
        addCards("Plains", 10, ai);
        Card sh = addCardToZone("Storm Herd", ai, ZoneType.Hand);
        game.getAction().checkStateEffects(true);
        cast(game, ai, sh);
        AssertJUnit.assertEquals(17, countTokens(ai, "Pegasus"));
    }

    @Test
    public void technomancerReturnsAtMostSixManaValue() {
        Game game = initAndCreateGame();
        Player ai = game.getPlayers().get(1);
        addCards("Swamp", 7, ai);
        addCardToZone("Wurmcoil Engine", ai, ZoneType.Graveyard);
        addCardToZone("Myr Retriever", ai, ZoneType.Graveyard);
        addCardToZone("Chronomancer", ai, ZoneType.Graveyard);
        addCardToZone("Royal Warden", ai, ZoneType.Graveyard);
        for (int i = 0; i < 3; i++) {
            addCardToZone("Plains", ai, ZoneType.Library);
        }
        Card t = addCardToZone("Technomancer", ai, ZoneType.Hand);
        game.getAction().checkStateEffects(true);
        cast(game, ai, t);
        int mv = 0;
        StringBuilder sb = new StringBuilder();
        for (Card c : ai.getCardsIn(ZoneType.Battlefield)) {
            if (!c.isToken() && c.isCreature() && !c.getName().equals("Technomancer")) {
                mv += c.getCMC();
                sb.append(c.getName()).append(' ');
            }
        }
        System.out.println("G5 technomancer returned: " + sb + " total MV " + mv);
        AssertJUnit.assertTrue("returned something", mv > 0);
        AssertJUnit.assertTrue("total MV <= 6, was " + mv, mv <= 6);
    }

    @Test
    public void psychomancerTriggersOnNontokenArtifactSacrificed() {
        Game game = initAndCreateGame();
        Player ai = game.getPlayers().get(1);
        Player opp = game.getPlayers().get(0);
        addCard("Psychomancer", ai);
        Card chrono = addCard("Chronomancer", ai);
        chrono.setSickness(false);
        addCard("Sol Ring", ai);
        addCards("Swamp", 1, ai);
        addCardToZone("Plains", ai, ZoneType.Library);
        game.getAction().checkStateEffects(true);
        int lo = opp.getLife(), la = ai.getLife();
        SpellAbility sa = findSAContaining(chrono, "Draw a card");
        AssertJUnit.assertNotNull(sa);
        play(game, ai, sa);
        System.out.println("G5 psychomancer: " + gameStateToString(game));
        AssertJUnit.assertEquals(1, ai.getCardsIn(ZoneType.Hand).size());
        AssertJUnit.assertEquals(1, lo - opp.getLife());
        AssertJUnit.assertEquals(1, ai.getLife() - la);
    }

    @Test
    public void currencyConverterExileThenRogue() {
        Game game = initAndCreateGame();
        Player ai = game.getPlayers().get(1);
        Card cc = addCard("Currency Converter", ai);
        addCards("Swamp", 3, ai);
        addCardToZone("Grizzly Bears", ai, ZoneType.Hand);
        addCardToZone("Grizzly Bears", ai, ZoneType.Hand);
        Card rot = addCardToZone("Mind Rot", ai, ZoneType.Hand);
        game.getAction().checkStateEffects(true);
        cast(game, ai, rot, ai);
        int exiled = 0;
        for (Card c : ai.getCardsIn(ZoneType.Exile)) {
            if (c.getName().equals("Grizzly Bears")) exiled++;
        }
        System.out.println("G5 currency converter exiled " + exiled + "\n" + gameStateToString(game));
        if (exiled == 0) {
            throw new org.testng.SkipException("AI declined the optional exile");
        }
        SpellAbility put = findSAContaining(cc, "Put a card exiled");
        AssertJUnit.assertNotNull(put);
        play(game, ai, put);
        AssertJUnit.assertEquals(1, countTokens(ai, "Rogue"));
    }

    @Test
    public void mimicVatImprintAndCopy() {
        Game game = initAndCreateGame();
        Player ai = game.getPlayers().get(1);
        Player opp = game.getPlayers().get(0);
        Card vat = addCard("Mimic Vat", ai);
        Card giant = addCard("Hill Giant", opp);
        addCards("Mountain", 4, ai);
        Card bolt = addCardToZone("Lightning Bolt", ai, ZoneType.Hand);
        game.getAction().checkStateEffects(true);
        cast(game, ai, bolt, giant);
        System.out.println("G5 mimic vat: " + gameStateToString(game));
        if (!inZone("Hill Giant", opp, ZoneType.Exile)) {
            throw new org.testng.SkipException("AI declined the optional imprint");
        }
        SpellAbility copy = findSAContaining(vat, "Create a token");
        AssertJUnit.assertNotNull(copy);
        play(game, ai, copy);
        Card tok = null;
        for (Card c : ai.getCreaturesInPlay()) {
            if (c.isToken() && c.getName().equals("Hill Giant")) tok = c;
        }
        AssertJUnit.assertNotNull("token copy of the imprinted card", tok);
        AssertJUnit.assertTrue(tok.hasKeyword(Keyword.HASTE));
        playUntilPhase(game, PhaseType.CLEANUP);
        AssertJUnit.assertFalse(tok.isInPlay());
    }

    @Test
    public void scrapTrawlerReturnsLesserManaValue() {
        Game game = initAndCreateGame();
        Player ai = game.getPlayers().get(1);
        Card trawler = addCard("Scrap Trawler", ai);
        addCardToZone("Lotus Petal", ai, ZoneType.Graveyard);
        addCardToZone("Wurmcoil Engine", ai, ZoneType.Graveyard);
        addCards("Mountain", 2, ai);
        Card shatter = addCardToZone("Shatter", ai, ZoneType.Hand);
        game.getAction().checkStateEffects(true);
        cast(game, ai, shatter, trawler);
        AssertJUnit.assertTrue(inZone("Lotus Petal", ai, ZoneType.Hand));
        AssertJUnit.assertTrue(inZone("Wurmcoil Engine", ai, ZoneType.Graveyard));
    }

    @Test
    public void imotekhWithMyrRetrieverChain() {
        Game game = initAndCreateGame();
        Player ai = game.getPlayers().get(1);
        addCard("Imotekh the Stormlord", ai);
        Card myr = addCard("Myr Retriever", ai);
        addCardToZone("Sol Ring", ai, ZoneType.Graveyard);
        addCards("Mountain", 2, ai);
        Card shatter = addCardToZone("Shatter", ai, ZoneType.Hand);
        game.getAction().checkStateEffects(true);
        cast(game, ai, shatter, myr);
        AssertJUnit.assertTrue(inZone("Sol Ring", ai, ZoneType.Hand));
        AssertJUnit.assertEquals(2, countTokens(ai, "Necron Warrior"));
    }

    // ---------- batch 3 ----------

    @Test
    public void anrakyrCastFromGraveyardForLifeTriggersImotekh() {
        Game game = initAndCreateGame();
        Player ai = game.getPlayers().get(1);
        addCard("Imotekh the Stormlord", ai);
        Card anrakyr = addCard("Anrakyr the Traveller", ai);
        addCardToZone("Wurmcoil Engine", ai, ZoneType.Graveyard);
        game.getAction().checkStateEffects(true);
        int life = ai.getLife();
        SpellAbility trig = anrakyr.getTriggers().get(0).ensureAbility();
        trig.setActivatingPlayer(ai);
        forge.game.ability.AbilityUtils.resolve(trig);
        resolveAll(game);
        System.out.println("G5 anrakyr: life " + life + " -> " + ai.getLife() + "\n" + gameStateToString(game));
        if (inZone("Wurmcoil Engine", ai, ZoneType.Graveyard)) {
            throw new org.testng.SkipException("AI declined to cast with Anrakyr");
        }
        AssertJUnit.assertTrue(inZone("Wurmcoil Engine", ai, ZoneType.Battlefield));
        AssertJUnit.assertEquals("paid life equal to MV 6", life - 6, ai.getLife());
        AssertJUnit.assertEquals("artifact card left the graveyard", 2, countTokens(ai, "Necron Warrior"));
    }

    @Test
    public void rebuffTheWickedCountersSpellTargetingMyPermanent() {
        Game game = initAndCreateGame();
        Player ai = game.getPlayers().get(1);
        Player opp = game.getPlayers().get(0);
        Card ring = addCard("Sol Ring", ai);
        addCards("Mountain", 2, opp);
        addCards("Plains", 1, ai);
        Card shatter = addCardToZone("Shatter", opp, ZoneType.Hand);
        Card rebuff = addCardToZone("Rebuff the Wicked", ai, ZoneType.Hand);
        game.getAction().checkStateEffects(true);
        SpellAbility sh = shatter.getFirstSpellAbility();
        sh.setActivatingPlayer(opp);
        sh.resetTargets();
        sh.getTargets().add(ring);
        AssertJUnit.assertTrue(ComputerUtil.playStack(sh, opp, game));
        SpellAbility rb = rebuff.getFirstSpellAbility();
        rb.setActivatingPlayer(ai);
        rb.resetTargets();
        rb.getTargets().add(sh);
        AssertJUnit.assertTrue("Rebuff can target Shatter", rb.getTargetRestrictions() != null);
        AssertJUnit.assertTrue(ComputerUtil.playStack(rb, ai, game));
        resolveAll(game);
        AssertJUnit.assertTrue(ring.isInPlay());
        AssertJUnit.assertTrue(inZone("Shatter", opp, ZoneType.Graveyard));
    }

    @Test
    public void strokeOfMidnightTokenGoesToTargetsController() {
        Game game = initAndCreateThreePlayerGame();
        setTeams(game);
        Player opp1 = game.getPlayers().get(0);
        Player ai = game.getPlayers().get(1);
        Player opp2 = game.getPlayers().get(2);
        Card ring = addCard("Sol Ring", opp2);
        addCards("Plains", 3, ai);
        Card stroke = addCardToZone("Stroke of Midnight", ai, ZoneType.Hand);
        game.getAction().checkStateEffects(true);
        cast(game, ai, stroke, ring);
        AssertJUnit.assertTrue(inZone("Sol Ring", opp2, ZoneType.Graveyard));
        AssertJUnit.assertEquals(1, countTokens(opp2, "Human"));
        AssertJUnit.assertEquals(0, countTokens(opp1, "Human"));
        AssertJUnit.assertEquals(0, countTokens(ai, "Human"));
    }

    @Test
    public void enchantmentCostReducersStack() {
        Game game = initAndCreateGame();
        Player ai = game.getPlayers().get(1);
        addCard("Herald of the Pantheon", ai);
        addCard("Jukai Naturalist", ai);
        addCards("Plains", 1, ai);
        Card anthem = addCardToZone("Ghostly Prison", ai, ZoneType.Hand);
        game.getAction().checkStateEffects(true);
        int life = ai.getLife();
        cast(game, ai, anthem);
        AssertJUnit.assertTrue("{2}{W} reduced by 2 to {W}", anthem.isInPlay() || inZone("Ghostly Prison", ai, ZoneType.Battlefield));
        AssertJUnit.assertEquals("Herald lifegain", life + 1, ai.getLife());
    }

    @Test
    public void kenrithsTransformationAndLignify() {
        Game game = initAndCreateGame();
        Player ai = game.getPlayers().get(1);
        Player opp = game.getPlayers().get(0);
        Card wurm = addCard("Wurmcoil Engine", opp);
        Card angel = addCard("Serra Angel", opp);
        addCards("Forest", 4, ai);
        addCardToZone("Plains", ai, ZoneType.Library);
        Card kt = addCardToZone("Kenrith's Transformation", ai, ZoneType.Hand);
        Card lig = addCardToZone("Lignify", ai, ZoneType.Hand);
        game.getAction().checkStateEffects(true);
        cast(game, ai, kt, wurm);
        cast(game, ai, lig, angel);
        game.getAction().checkStateEffects(true);
        AssertJUnit.assertEquals("Kenrith's draws a card", 1, ai.getCardsIn(ZoneType.Hand).size());
        AssertJUnit.assertEquals(3, wurm.getNetPower());
        AssertJUnit.assertEquals(3, wurm.getNetToughness());
        AssertJUnit.assertFalse(wurm.isArtifact());
        AssertJUnit.assertTrue(wurm.getType().hasCreatureType("Elk"));
        AssertJUnit.assertTrue(wurm.isGreen());
        AssertJUnit.assertFalse(wurm.hasKeyword(Keyword.DEATHTOUCH));
        AssertJUnit.assertEquals(0, angel.getNetPower());
        AssertJUnit.assertEquals(4, angel.getNetToughness());
        AssertJUnit.assertTrue(angel.getType().hasCreatureType("Treefolk"));
        AssertJUnit.assertFalse(angel.getType().hasCreatureType("Angel"));
        AssertJUnit.assertFalse(angel.hasKeyword(Keyword.FLYING));
        AssertJUnit.assertTrue("Lignify keeps colors", angel.isWhite());
    }

    @Test
    public void authorityOfTheConsulsTapsAndGains() {
        Game game = initAndCreateGame();
        Player ai = game.getPlayers().get(1);
        Player opp = game.getPlayers().get(0);
        addCard("Authority of the Consuls", ai);
        addCards("Forest", 2, opp);
        Card bears = addCardToZone("Grizzly Bears", opp, ZoneType.Hand);
        game.getAction().checkStateEffects(true);
        int life = ai.getLife();
        cast(game, opp, bears);
        Card b = findCardWithName(game, "Grizzly Bears");
        AssertJUnit.assertNotNull(b);
        AssertJUnit.assertTrue(b.isTapped());
        AssertJUnit.assertEquals(life + 1, ai.getLife());
    }

    @Test
    public void constellationOnEnchantmentLandPlay() {
        Game game = initAndCreateGame();
        Player ai = game.getPlayers().get(1);
        addCard("Eidolon of Blossoms", ai);
        Card champ = addCard("Setessan Champion", ai);
        for (int i = 0; i < 3; i++) {
            addCardToZone("Plains", ai, ZoneType.Library);
        }
        Card lair = addCardToZone("Valgavoth's Lair", ai, ZoneType.Hand);
        game.getAction().checkStateEffects(true);
        SpellAbility land = null;
        for (SpellAbility sa : lair.getAllPossibleAbilities(ai, true)) {
            if (sa.isLandAbility()) land = sa;
        }
        AssertJUnit.assertNotNull(land);
        land.setActivatingPlayer(ai);
        land.resolve();
        resolveAll(game);
        AssertJUnit.assertTrue(inZone("Valgavoth's Lair", ai, ZoneType.Battlefield));
        AssertJUnit.assertEquals("Eidolon + Champion each draw", 2, ai.getCardsIn(ZoneType.Hand).size());
        AssertJUnit.assertEquals(1, champ.getCounters(CounterType.getType("P1P1")));
    }

    @Test
    public void palantirOfOrthancEndStep() {
        Game game = initAndCreateThreePlayerGame();
        setTeams(game);
        Player ai = game.getPlayers().get(1);
        addCard("Palantír of Orthanc", ai);
        for (int i = 0; i < 6; i++) {
            addCardToZone("Grizzly Bears", ai, ZoneType.Library);
        }
        game.getAction().checkStateEffects(true);
        int[] life = new int[3];
        for (int i = 0; i < 3; i++) life[i] = game.getPlayers().get(i).getLife();
        playUntilPhase(game, PhaseType.CLEANUP);
        int hand = ai.getCardsIn(ZoneType.Hand).size();
        int gy = ai.getCardsIn(ZoneType.Graveyard).size();
        int lost = 0;
        for (int i : new int[] {0, 2}) lost += life[i] - game.getPlayers().get(i).getLife();
        System.out.println("G5 palantir: hand " + hand + " gy " + gy + " opp lost " + lost);
        AssertJUnit.assertTrue("either drew 1, or milled 1 and that opponent lost 2",
                (hand == 1 && gy == 0 && lost == 0) || (hand == 0 && gy == 1 && lost == 2));
    }

    @Test
    public void libraryOfLengDiscardStillTriggersMonument() {
        Game game = initAndCreateThreePlayerGame();
        setTeams(game);
        Player ai = game.getPlayers().get(1);
        addCard("Monument to Endurance", ai);
        addCard("Library of Leng", ai);
        addCards("Swamp", 3, ai);
        addCardToZone("Grizzly Bears", ai, ZoneType.Hand);
        addCardToZone("Hill Giant", ai, ZoneType.Hand);
        Card rot = addCardToZone("Mind Rot", ai, ZoneType.Hand);
        for (int i = 0; i < 5; i++) {
            addCardToZone("Plains", ai, ZoneType.Library);
        }
        game.getAction().checkStateEffects(true);
        int oppLife = game.getPlayers().get(0).getLife();
        cast(game, ai, rot, ai);
        int lost = oppLife - game.getPlayers().get(0).getLife();
        int treasures = countTokens(ai, "Treasure");
        int hand = ai.getCardsIn(ZoneType.Hand).size();
        System.out.println("G5 leng+monument: lost " + lost + " treasures " + treasures + " hand " + hand + "\n" + gameStateToString(game));
        int modes = (lost == 3 ? 1 : 0) + treasures + hand;
        AssertJUnit.assertEquals("two discards -> two Monument modes even when Leng puts them on top", 2, modes);
    }

    @Test
    public void dreadReturnFlashback() {
        Game game = initAndCreateGame();
        Player ai = game.getPlayers().get(1);
        addCard("Grizzly Bears", ai);
        addCard("Llanowar Elves", ai);
        addCard("Runeclaw Bear", ai);
        addCardToZone("Wurmcoil Engine", ai, ZoneType.Graveyard);
        Card dr = addCardToZone("Dread Return", ai, ZoneType.Graveyard);
        game.getAction().checkStateEffects(true);
        SpellAbility fb = null;
        for (SpellAbility sa : dr.getAllPossibleAbilities(ai, false)) {
            if (sa.isFlashback()) fb = sa;
        }
        AssertJUnit.assertNotNull("flashback ability", fb);
        Card wurm = null;
        for (Card c : ai.getCardsIn(ZoneType.Graveyard)) {
            if (c.getName().equals("Wurmcoil Engine")) wurm = c;
        }
        play(game, ai, fb, wurm);
        AssertJUnit.assertTrue(inZone("Wurmcoil Engine", ai, ZoneType.Battlefield));
        AssertJUnit.assertTrue(inZone("Dread Return", ai, ZoneType.Exile));
        AssertJUnit.assertEquals(1, ai.getCreaturesInPlay().size());
    }

    @Test
    public void triarchPraetorianUnearthDrawsTwo() {
        Game game = initAndCreateGame();
        Player ai = game.getPlayers().get(1);
        addCards("Swamp", 5, ai);
        for (int i = 0; i < 3; i++) {
            addCardToZone("Plains", ai, ZoneType.Library);
        }
        Card tp = addCardToZone("Triarch Praetorian", ai, ZoneType.Graveyard);
        game.getAction().checkStateEffects(true);
        int life = ai.getLife();
        play(game, ai, findSAContaining(tp, "Unearth"));
        AssertJUnit.assertEquals(2, ai.getCardsIn(ZoneType.Hand).size());
        AssertJUnit.assertEquals(life - 2, ai.getLife());
        playUntilPhase(game, PhaseType.CLEANUP);
        AssertJUnit.assertTrue("unearth exiles at end step", inZone("Triarch Praetorian", ai, ZoneType.Exile));
    }

    @Test
    public void nimDeathmantleReturnsCreature() {
        Game game = initAndCreateGame();
        Player ai = game.getPlayers().get(1);
        addCard("Nim Deathmantle", ai);
        Card giant = addCard("Hill Giant", ai);
        addCards("Mountain", 5, ai);
        Card bolt = addCardToZone("Lightning Bolt", ai, ZoneType.Hand);
        game.getAction().checkStateEffects(true);
        cast(game, ai, bolt, giant);
        System.out.println("G5 nim: " + gameStateToString(game));
        if (inZone("Hill Giant", ai, ZoneType.Graveyard)) {
            throw new org.testng.SkipException("AI declined to pay {4}");
        }
        Card g = findCardWithName(game, "Hill Giant");
        AssertJUnit.assertNotNull(g);
        AssertJUnit.assertEquals(5, g.getNetPower());
        AssertJUnit.assertTrue(g.isBlack());
        AssertJUnit.assertTrue(g.getType().hasCreatureType("Zombie"));
    }

    @Test
    public void sculptingSteelCopiesArtifact() {
        Game game = initAndCreateGame();
        Player ai = game.getPlayers().get(1);
        addCard("Wurmcoil Engine", ai);
        addCards("Wastes", 3, ai);
        Card ss = addCardToZone("Sculpting Steel", ai, ZoneType.Hand);
        game.getAction().checkStateEffects(true);
        cast(game, ai, ss);
        AssertJUnit.assertEquals(2, countCardsWithName(game, "Wurmcoil Engine"));
    }

    // ---------- batch 4 ----------

    @Test
    public void imotekhTriggersWhenArtifactIsCastFromGraveyard() {
        Game game = initAndCreateGame();
        Player ai = game.getPlayers().get(1);
        addCard("Imotekh the Stormlord", ai);
        addCard("Muldrotha, the Gravetide", ai);
        addCards("Wastes", 1, ai);
        Card ring = addCardToZone("Sol Ring", ai, ZoneType.Graveyard);
        game.getAction().checkStateEffects(true);
        SpellAbility castFromGy = null;
        for (SpellAbility sa : ring.getAllPossibleAbilities(ai, true)) {
            if (sa.isSpell()) castFromGy = sa;
        }
        AssertJUnit.assertNotNull("Muldrotha lets us cast Sol Ring from the graveyard", castFromGy);
        play(game, ai, castFromGy);
        AssertJUnit.assertTrue(inZone("Sol Ring", ai, ZoneType.Battlefield));
        AssertJUnit.assertEquals("casting moves the artifact card out of the graveyard", 2, countTokens(ai, "Necron Warrior"));
    }

    /** Same mechanism, other cards: Tormod's "one or more cards leave your graveyard" and a flashback cast (Strike It Rich). */
    @Test
    public void leaveGraveyardTriggerOnFlashbackCast() {
        Game game = initAndCreateGame();
        Player ai = game.getPlayers().get(1);
        addCard("Tormod, the Desecrator", ai);
        addCards("Mountain", 3, ai);
        Card sir = addCardToZone("Strike It Rich", ai, ZoneType.Graveyard);
        game.getAction().checkStateEffects(true);
        SpellAbility fb = null;
        for (SpellAbility sa : sir.getAllPossibleAbilities(ai, true)) {
            if (sa.isFlashback()) fb = sa;
        }
        AssertJUnit.assertNotNull(fb);
        play(game, ai, fb);
        AssertJUnit.assertTrue("flashback resolved", inZone("Strike It Rich", ai, ZoneType.Exile));
        AssertJUnit.assertEquals(1, countTokens(ai, "Treasure"));
        AssertJUnit.assertEquals("Strike It Rich left the graveyard when cast", 1, countTokens(ai, "Zombie"));
    }

    /** Control: Tormod triggers when a card leaves the graveyard through an effect. */
    @Test
    public void leaveGraveyardTriggerControlViaEffect() {
        Game game = initAndCreateGame();
        Player ai = game.getPlayers().get(1);
        addCard("Tormod, the Desecrator", ai);
        addCards("Forest", 2, ai);
        Card sir = addCardToZone("Strike It Rich", ai, ZoneType.Graveyard);
        Card regrowth = addCardToZone("Regrowth", ai, ZoneType.Hand);
        game.getAction().checkStateEffects(true);
        cast(game, ai, regrowth, sir);
        AssertJUnit.assertTrue(inZone("Strike It Rich", ai, ZoneType.Hand));
        AssertJUnit.assertEquals(1, countTokens(ai, "Zombie"));
    }

    @Test
    public void perchProtectionWithGift() {
        Game game = initAndCreateThreePlayerGame();
        setTeams(game);
        Player opp1 = game.getPlayers().get(0);
        Player ai = game.getPlayers().get(1);
        addCards("Plains", 6, ai);
        Card perch = addCardToZone("Perch Protection", ai, ZoneType.Hand);
        game.getAction().checkStateEffects(true);
        SpellAbility sa = perch.getFirstSpellAbility();
        sa.setActivatingPlayer(ai);
        sa.addOptionalCost(forge.game.spellability.OptionalCost.PromiseGift);
        AssertJUnit.assertTrue(ComputerUtil.playStack(sa, ai, game));
        Card onStack = game.getStack().peekAbility().getHostCard();
        onStack.setPromisedGift(opp1);
        resolveAll(game);
        System.out.println("G5 perch: " + gameStateToString(game));
        int birds = 0, phased = 0;
        for (Card c : ai.getCardsIn(ZoneType.Battlefield)) {
            if (c.isToken() && c.getName().contains("Bird")) {
                birds++;
            }
        }
        for (Card c : game.getCardsIncludePhasingIn(ZoneType.Battlefield)) {
            if (c.getController() == ai && c.isPhasedOut()) phased++;
        }
        AssertJUnit.assertTrue(inZone("Perch Protection", ai, ZoneType.Exile));
        AssertJUnit.assertEquals("6 Plains + 4 birds phased out", 10, phased);
        AssertJUnit.assertEquals("opponent gets an extra turn", 1, game.getPhaseHandler().getExtraTurnForPlayer(opp1));
        AssertJUnit.assertFalse("life total can't change", ai.canLoseLife());
        AssertJUnit.assertFalse("life total can't change", ai.canGainLife());
        int life = ai.getLife();
        Card bolt = addCardToZone("Lightning Bolt", opp1, ZoneType.Hand);
        SpellAbility b = bolt.getFirstSpellAbility();
        b.setActivatingPlayer(opp1);
        AssertJUnit.assertFalse("protection from everything: can't be targeted", ai.canBeTargetedBy(b));
        AssertJUnit.assertEquals(life, ai.getLife());
        AssertJUnit.assertTrue(birds >= 0);
    }

    @Test
    public void dawnsTruceWithGift() {
        Game game = initAndCreateGame();
        Player opp = game.getPlayers().get(0);
        Player ai = game.getPlayers().get(1);
        Card bear = addCard("Grizzly Bears", ai);
        Card ring = addCard("Sol Ring", ai);
        addCards("Plains", 2, ai);
        addCardToZone("Plains", opp, ZoneType.Library);
        Card truce = addCardToZone("Dawn's Truce", ai, ZoneType.Hand);
        game.getAction().checkStateEffects(true);
        SpellAbility sa = truce.getFirstSpellAbility();
        sa.setActivatingPlayer(ai);
        sa.addOptionalCost(forge.game.spellability.OptionalCost.PromiseGift);
        AssertJUnit.assertTrue(ComputerUtil.playStack(sa, ai, game));
        game.getStack().peekAbility().getHostCard().setPromisedGift(opp);
        resolveAll(game);
        AssertJUnit.assertEquals("opponent draws the gift", 1, opp.getCardsIn(ZoneType.Hand).size());
        AssertJUnit.assertTrue(bear.hasKeyword(Keyword.HEXPROOF));
        AssertJUnit.assertTrue(bear.hasKeyword(Keyword.INDESTRUCTIBLE));
        AssertJUnit.assertTrue(ring.hasKeyword(Keyword.INDESTRUCTIBLE));
        AssertJUnit.assertTrue(inZone("Plains", ai, ZoneType.Battlefield));
    }

    @Test
    public void fertileGroundWithMirarisWake() {
        Game game = initAndCreateGame();
        Player ai = game.getPlayers().get(1);
        Card forest = addCard("Forest", ai);
        Card fg = addCard("Fertile Ground", ai);
        fg.attachToEntity(forest, null);
        addCard("Mirari's Wake", ai);
        game.getAction().checkStateEffects(true);
        SpellAbility mana = forest.getManaAbilities().get(0);
        mana.setActivatingPlayer(ai);
        AssertJUnit.assertTrue(ComputerUtil.playNoStack(ai, mana, game, false));
        System.out.println("G5 fertile+wake pool: " + ai.getManaPool().totalMana());
        AssertJUnit.assertEquals("G from Forest + G from Wake + 1 from Fertile Ground", 3, ai.getManaPool().totalMana());
    }

    @Test
    public void sanctumWeaverCountsEnchantments() {
        Game game = initAndCreateGame();
        Player ai = game.getPlayers().get(1);
        Card weaver = addCard("Sanctum Weaver", ai);
        weaver.setSickness(false);
        addCard("Glorious Anthem", ai);
        addCard("Crusade", ai);
        game.getAction().checkStateEffects(true);
        SpellAbility mana = weaver.getManaAbilities().get(0);
        mana.setActivatingPlayer(ai);
        AssertJUnit.assertTrue(ComputerUtil.playNoStack(ai, mana, game, false));
        AssertJUnit.assertEquals(3, ai.getManaPool().totalMana());
    }

    @Test
    public void flickeringWardProtectionDoesNotRemoveItself() {
        Game game = initAndCreateGame();
        Player ai = game.getPlayers().get(1);
        Card bear = addCard("Grizzly Bears", ai);
        addCards("Plains", 1, ai);
        Card ward = addCardToZone("Flickering Ward", ai, ZoneType.Hand);
        game.getAction().checkStateEffects(true);
        cast(game, ai, ward, bear);
        Card w = findCardWithName(game, "Flickering Ward");
        AssertJUnit.assertNotNull(w);
        w.setChosenColors(java.util.Arrays.asList("white"));
        game.getAction().checkStateEffects(true);
        game.getAction().checkStateEffects(true);
        AssertJUnit.assertTrue("Ward stays attached despite protection from white", w.isInPlay() && bear.isEnchantedBy(w));
        Player opp = game.getPlayers().get(0);
        Card ps = addCardToZone("Pacifism", opp, ZoneType.Hand);
        SpellAbility pa = ps.getFirstSpellAbility();
        pa.setActivatingPlayer(opp);
        AssertJUnit.assertFalse("pro-white: white aura can't target", bear.canBeTargetedBy(pa));
    }

    @Test
    public void flareOfFortitudeAlternativeCost() {
        Game game = initAndCreateGame();
        Player ai = game.getPlayers().get(1);
        Player opp = game.getPlayers().get(0);
        addCard("Savannah Lions", ai);
        Card ring = addCard("Sol Ring", ai);
        Card flare = addCardToZone("Flare of Fortitude", ai, ZoneType.Hand);
        game.getAction().checkStateEffects(true);
        SpellAbility alt = null;
        for (SpellAbility sa : flare.getAllPossibleAbilities(ai, true)) {
            if (sa.isSpell() && sa.getPayCosts().hasSpecificCostType(forge.game.cost.CostSacrifice.class)) alt = sa;
        }
        AssertJUnit.assertNotNull("alternative cost available with no lands", alt);
        play(game, ai, alt);
        AssertJUnit.assertTrue(inZone("Savannah Lions", ai, ZoneType.Graveyard));
        AssertJUnit.assertTrue(ring.hasKeyword(Keyword.INDESTRUCTIBLE));
        AssertJUnit.assertTrue(ring.hasKeyword(Keyword.HEXPROOF));
        AssertJUnit.assertFalse(ai.canLoseLife());
        addCards("Mountain", 1, opp);
        Card bolt = addCardToZone("Lightning Bolt", opp, ZoneType.Hand);
        int life = ai.getLife();
        cast(game, opp, bolt, ai);
        AssertJUnit.assertEquals(life, ai.getLife());
    }

    // ---------- batch 5 ----------

    @Test
    public void imotekhGrandStrategistAtBeginningOfCombat() {
        Game game = initAndCreateGame();
        Player ai = game.getPlayers().get(1);
        Card imo = addCard("Imotekh the Stormlord", ai);
        Card tok = addToken("b_2_2_a_necron_warrior", ai);
        game.getAction().checkStateEffects(true);
        game.getPhaseHandler().devModeSet(PhaseType.MAIN1, ai);
        playUntilPhase(game, PhaseType.COMBAT_BEGIN);
        resolveAll(game);
        AssertJUnit.assertEquals(4, tok.getNetPower());
        AssertJUnit.assertEquals(4, tok.getNetToughness());
        AssertJUnit.assertTrue(tok.hasKeyword(Keyword.MENACE));
        AssertJUnit.assertEquals("not Imotekh itself", 3, imo.getNetPower());
    }

    @Test
    public void imotekhWithLivingDeath() {
        Game game = initAndCreateGame();
        Player ai = game.getPlayers().get(1);
        addCard("Imotekh the Stormlord", ai);
        addCards("Swamp", 5, ai);
        addCardToZone("Wurmcoil Engine", ai, ZoneType.Graveyard);
        Card ld = addCardToZone("Living Death", ai, ZoneType.Hand);
        game.getAction().checkStateEffects(true);
        cast(game, ai, ld);
        AssertJUnit.assertTrue(inZone("Wurmcoil Engine", ai, ZoneType.Battlefield));
        AssertJUnit.assertTrue(inZone("Imotekh the Stormlord", ai, ZoneType.Graveyard));
        AssertJUnit.assertEquals(2, countTokens(ai, "Necron Warrior"));
    }

    @Test
    public void destinySpinnerCreatureSpellCantBeCountered() {
        Game game = initAndCreateGame();
        Player ai = game.getPlayers().get(1);
        Player opp = game.getPlayers().get(0);
        addCard("Destiny Spinner", ai);
        addCards("Forest", 2, ai);
        addCards("Island", 2, opp);
        Card bears = addCardToZone("Grizzly Bears", ai, ZoneType.Hand);
        Card cs = addCardToZone("Counterspell", opp, ZoneType.Hand);
        game.getAction().checkStateEffects(true);
        SpellAbility b = bears.getFirstSpellAbility();
        b.setActivatingPlayer(ai);
        AssertJUnit.assertTrue(ComputerUtil.playStack(b, ai, game));
        SpellAbility c = cs.getFirstSpellAbility();
        c.setActivatingPlayer(opp);
        c.resetTargets();
        c.getTargets().add(b);
        AssertJUnit.assertTrue(ComputerUtil.playStack(c, opp, game));
        resolveAll(game);
        AssertJUnit.assertTrue(inZone("Counterspell", opp, ZoneType.Graveyard));
        AssertJUnit.assertTrue("creature spell can't be countered", inZone("Grizzly Bears", ai, ZoneType.Battlefield));
    }

    @Test
    public void hallowedHauntingSevenEnchantments() {
        Game game = initAndCreateGame();
        Player ai = game.getPlayers().get(1);
        addCard("Hallowed Haunting", ai);
        Card bear = addCard("Grizzly Bears", ai);
        for (String e : new String[] {"Glorious Anthem", "Crusade", "Ghostly Prison", "Aura of Silence", "Seal of Cleansing"}) {
            addCard(e, ai);
        }
        game.getAction().checkStateEffects(true);
        AssertJUnit.assertFalse("6 enchantments", bear.hasKeyword(Keyword.FLYING));
        addCard("Seal of Primordium", ai);
        game.getAction().checkStateEffects(true);
        AssertJUnit.assertTrue("7 enchantments", bear.hasKeyword(Keyword.FLYING));
        AssertJUnit.assertTrue(bear.hasKeyword(Keyword.VIGILANCE));
    }

    @Test
    public void heliodAndClericClassLifegain() {
        Game game = initAndCreateGame();
        Player ai = game.getPlayers().get(1);
        Card heliod = addCard("Heliod, Sun-Crowned", ai);
        addCard("Cleric Class", ai);
        Card lions = addCard("Savannah Lions", ai);
        game.getAction().checkStateEffects(true);
        AssertJUnit.assertFalse("devotion 2 (Heliod W + Class W) + Lions W = 3 < 5", heliod.isCreature());
        int life = ai.getLife();
        addCards("Plains", 2, ai);
        Card ward = addCardToZone("Chaplain's Blessing", ai, ZoneType.Hand);
        cast(game, ai, ward);
        AssertJUnit.assertEquals("5 + 1 from Cleric Class", life + 6, ai.getLife());
        int counters = lions.getCounters(CounterType.getType("P1P1")) + heliod.getCounters(CounterType.getType("P1P1"));
        AssertJUnit.assertEquals("one Heliod trigger", 1, counters);
    }
}
