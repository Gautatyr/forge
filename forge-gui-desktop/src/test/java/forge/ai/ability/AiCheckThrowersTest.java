package forge.ai.ability;

import java.util.Arrays;
import java.util.List;

import org.testng.AssertJUnit;
import org.testng.annotations.Test;

import forge.ai.AITest;
import forge.ai.AiAbilityDecision;
import forge.ai.AiController;
import forge.ai.AiPlayDecision;
import forge.ai.ComputerUtilCard;
import forge.ai.ComputerUtilCost;
import forge.ai.PlayerControllerAi;
import forge.ai.SpellApiToAi;
import forge.game.Game;
import forge.game.ability.ApiType;
import forge.game.card.Card;
import forge.game.card.CounterEnumType;
import forge.game.combat.CombatUtil;
import forge.game.phase.PhaseType;
import forge.game.player.Player;
import forge.game.spellability.SpellAbility;
import forge.game.zone.ZoneType;

/** Issue #92: AI checks that threw for specific cards; each scenario must now be decided without an exception. */
public class AiCheckThrowersTest extends AITest {

    private static AiController aiOf(final Player p) {
        return ((PlayerControllerAi) p.getController()).getAi();
    }

    private static SpellAbility firstWithApi(final Card c, final ApiType api, final Player activator) {
        for (final SpellAbility sa : c.getSpellAbilities()) {
            if (sa.getApi() == api) {
                sa.setActivatingPlayer(activator);
                return sa;
            }
        }
        throw new AssertionError(c + " has no " + api + " ability");
    }

    private static List<String> keywordsOf(final SpellAbility sa) {
        return Arrays.asList(sa.getParam("KW").split(" & "));
    }

    private Game aiMain1() {
        final Game game = initAndCreateGame();
        game.getPhaseHandler().devModeSet(PhaseType.MAIN1, game.getPlayers().get(1));
        return game;
    }

    // Guardian Archon: KW$ Protection:Player.PlayerUID_ChosenPlayerUID | DefinedKW$ ChosenPlayer
    @Test
    public void predictedPumpFillsInTheChosenPlayer() {
        final Game game = aiMain1();
        final Player ai = game.getPlayers().get(1);
        final Player opp = game.getPlayers().get(0);
        final Card archon = addCard("Guardian Archon", ai);
        archon.setChosenPlayer(opp);
        final Card bear = addCard("Grizzly Bears", ai);
        bear.setSickness(false);
        final Card oppBear = addCard("Grizzly Bears", opp);
        game.getAction().checkStateEffects(true);

        final SpellAbility pump = firstWithApi(archon, ApiType.Pump, ai);
        final Card pumped = ComputerUtilCard.getPumpedCreature(ai, pump, bear, 0, 0, keywordsOf(pump));
        AssertJUnit.assertTrue("unpumped bear can be blocked", CombatUtil.canBlock(bear, oppBear));
        AssertJUnit.assertFalse("predicted protection from the chosen player stops its blocker",
                CombatUtil.canBlock(pumped, oppBear));

        // the AI's whole check of the ability (pump prediction included) decides without throwing
        AssertJUnit.assertNotNull(aiOf(ai).canPlaySa(pump));
    }

    @Test
    public void predictedPumpWithoutAChosenPlayerAddsNoPlaceholderKeyword() {
        final Game game = aiMain1();
        final Player ai = game.getPlayers().get(1);
        final Player opp = game.getPlayers().get(0);
        final Card archon = addCard("Guardian Archon", ai); // no player chosen
        final Card bear = addCard("Grizzly Bears", ai);
        final Card oppBear = addCard("Grizzly Bears", opp);

        final SpellAbility pump = firstWithApi(archon, ApiType.Pump, ai);
        final Card pumped = ComputerUtilCard.getPumpedCreature(ai, pump, bear, 0, 0, keywordsOf(pump));
        AssertJUnit.assertTrue(CombatUtil.canBlock(pumped, oppBear));
    }

    // Courageous Resolve: DefinedKW$ Opponent (one keyword per opponent); Cliffside Rescuer: Player.OpponentOf PlayerUID_..., DefinedKW$ You
    @Test
    public void predictedPumpFillsInDefinedPlayers() {
        for (final String name : new String[] {"Courageous Resolve", "Cliffside Rescuer"}) {
            final Game game = aiMain1();
            final Player ai = game.getPlayers().get(1);
            final Player opp = game.getPlayers().get(0);
            final Card host = addCardToZone(name, ai, ZoneType.Hand);
            final Card bear = addCard("Grizzly Bears", ai);
            final Card oppBear = addCard("Grizzly Bears", opp);

            final SpellAbility pump = firstWithApi(host, ApiType.Pump, ai);
            final Card pumped = ComputerUtilCard.getPumpedCreature(ai, pump, bear, 0, 0, keywordsOf(pump));
            AssertJUnit.assertFalse(name + ": predicted protection from opponents stops their blocker",
                    CombatUtil.canBlock(pumped, oppBear));
        }
    }

    // Moxite Refinery: SubCounter<X/Any/Artifact.YouCtrl;Creature.YouCtrl/...>, "Any" is a null counter type
    @Test
    public void removeAnyCounterCostIsCheckedWithoutThrowing() {
        final Game game = aiMain1();
        final Player ai = game.getPlayers().get(1);
        final Card refinery = addCard("Moxite Refinery", ai);
        addCards("Plains", 2, ai);
        final Card bear = addCard("Grizzly Bears", ai);
        bear.setCounters(CounterEnumType.P1P1, 2);
        game.getAction().checkStateEffects(true);

        final SpellAbility charm = firstWithApi(refinery, ApiType.Charm, ai);
        ComputerUtilCost.checkRemoveCounterCost(charm.getPayCosts(), refinery, charm);
        AssertJUnit.assertNotNull(aiOf(ai).canPlaySa(charm));
    }

    // Tempest Caller: ETB "tap all creatures target opponent controls"
    @Test
    public void tapAllTriggerWithNoTargetableOpponentIsDeclined() {
        final Game game = aiMain1();
        final Player ai = game.getPlayers().get(1);
        final Player opp = game.getPlayers().get(0);
        final Card caller = addCardToZone("Tempest Caller", ai, ZoneType.Hand);
        addCards("Island", 4, ai);
        addCard("Leyline of Sanctity", opp);
        addCards("Grizzly Bears", 2, opp);
        game.getAction().checkStateEffects(true);

        final SpellAbility trig = caller.getTriggers().iterator().next().ensureAbility();
        trig.setActivatingPlayer(ai);
        final AiAbilityDecision d = SpellApiToAi.Converter.get(ApiType.TapAll).doTriggerNoCostWithSubs(ai, trig, false);
        AssertJUnit.assertEquals(AiPlayDecision.TargetingFailed, d.decision());

        // the AI's ETB look-ahead on casting it decides without throwing
        final SpellAbility cast = caller.getFirstSpellAbility();
        cast.setActivatingPlayer(ai);
        AssertJUnit.assertNotNull(aiOf(ai).canPlaySa(cast));
    }

    @Test
    public void tapAllTriggerOnAnOpponentWithUntappedCreaturesIsWanted() {
        final Game game = aiMain1();
        final Player ai = game.getPlayers().get(1);
        final Player opp = game.getPlayers().get(0);
        final Card caller = addCardToZone("Tempest Caller", ai, ZoneType.Hand);
        addCards("Grizzly Bears", 2, opp);
        game.getAction().checkStateEffects(true);

        final SpellAbility trig = caller.getTriggers().iterator().next().ensureAbility();
        trig.setActivatingPlayer(ai);
        final AiAbilityDecision d = SpellApiToAi.Converter.get(ApiType.TapAll).doTriggerNoCostWithSubs(ai, trig, false);
        AssertJUnit.assertEquals(AiPlayDecision.WillPlay, d.decision());
        AssertJUnit.assertEquals(opp, trig.getTargets().getFirstTargetedPlayer());
    }

    // Copy target activated or triggered ability (Adric) while a face-down (morph) spell, which has no API, is on top of the stack
    @Test
    public void copyAbilityDeclinesAnApiLessSpellOnTheStack() {
        final Game game = aiMain1();
        final Player ai = game.getPlayers().get(1);
        final Player opp = game.getPlayers().get(0);
        final Card adric = addCard("Adric, Mathematical Genius", ai);
        addCards("Island", 3, ai);

        final Card morph = addCardToZone("Exalted Angel", opp, ZoneType.Hand);
        SpellAbility faceDown = null;
        for (final SpellAbility sa : morph.getSpellAbilities()) {
            if (sa.isCastFaceDown()) {
                faceDown = sa;
            }
        }
        AssertJUnit.assertNotNull(faceDown);
        AssertJUnit.assertNull("precondition: the face-down spell has no API", faceDown.getApi());
        faceDown.setActivatingPlayer(opp);
        game.getStackZone().add(morph);
        game.getStack().add(faceDown);

        final SpellAbility copy = firstWithApi(adric, ApiType.CopySpellAbility, ai);
        final AiAbilityDecision d = SpellApiToAi.Converter.get(ApiType.CopySpellAbility).canPlayWithSubs(ai, copy);
        AssertJUnit.assertFalse(d.willingToPlay());
    }
}
