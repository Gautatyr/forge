package forge.game.spellability;

import static org.testng.Assert.assertEquals;
import static org.testng.Assert.assertFalse;
import static org.testng.Assert.assertNotNull;
import static org.testng.Assert.assertTrue;

import java.util.List;

import org.testng.annotations.Test;

import forge.ai.AITest;
import forge.ai.ComputerUtil;
import forge.ai.ComputerUtilMana;
import forge.ai.PlayerControllerAi;
import forge.game.Game;
import forge.game.ability.AbilityFactory;
import forge.game.ability.AbilityUtils;
import forge.game.card.Card;
import forge.game.mana.ManaConversionMatrix;
import forge.game.mana.ManaCostBeingPaid;
import forge.game.phase.PhaseType;
import forge.game.player.Player;
import forge.game.zone.ZoneType;

/**
 * Issue #181: a card cast from Gonti's exile ("mana of any type can be spent") costs its whole printed cost. A human's
 * Auto payment that cannot pay all of it pays none of it: it used to pay the coloured shard, give the mana back to the
 * pool without giving the shard back, and the next Auto paid the rest with that same mana.
 */
public class GontiFullCostTest extends AITest {
    private Game game;
    private Player me;
    private Player opp;
    private Card swampA;
    private Card swampB;

    /** Gonti resolves its trigger and exiles Grizzly Bears face down; {@code swamps} Swamps are all the mana there is. */
    private Card exiledBears(int swamps) {
        game = initAndCreateGame();
        me = game.getPlayers().get(0);
        opp = game.getPlayers().get(1);
        game.getPhaseHandler().devModeSet(PhaseType.MAIN1, me);
        for (int i = 0; i < 4; i++) {
            addCardToZone("Grizzly Bears", opp, ZoneType.Library);
        }
        List<Card> lands = addCards("Swamp", swamps, me);
        swampA = lands.get(0);
        swampB = swamps > 1 ? lands.get(1) : null;
        Card gonti = addCard("Gonti, Lord of Luxury", me);
        SpellAbility trigger = AbilityFactory.getAbility(gonti.getSVar("TrigDig"), gonti);
        trigger.setActivatingPlayer(me);
        trigger.getTargets().add(opp);
        AbilityUtils.resolve(trigger);
        game.getAction().checkStateEffects(true);
        Card bears = opp.getCardsIn(ZoneType.Exile).getFirst();
        assertTrue(bears.isFaceDown(), "Gonti exiled the card face down");
        return bears;
    }

    private SpellAbility castOf(Card bears) {
        List<SpellAbility> sas = bears.getAllPossibleAbilities(me, true);
        assertEquals(sas.size(), 1, "one way to cast it: " + sas);
        SpellAbility sa = sas.get(0);
        sa.setActivatingPlayer(me);
        return sa;
    }

    /**
     * What InputPayMana's Auto does: the cast's own "any type" conversion is on the pool (InputPayManaOfCostPayment), then
     * the engine's payer runs for the human with auto-pay on, on the cost being paid.
     */
    private boolean autoPay(SpellAbility sa, ManaCostBeingPaid cost) {
        ManaConversionMatrix matrix = new ManaConversionMatrix();
        matrix.restoreColorReplacements();
        assertTrue(sa.getMayPlayOption().applyManaConvert(matrix), "the cast carries the any-type permission");
        me.getManaPool().applyCardMatrix(matrix);
        boolean[] paid = {false};
        me.runWithController(() -> paid[0] = ComputerUtilMana.payManaCost(cost, sa, me, false),
                new PlayerControllerAi(game, me, me.getOriginalLobbyPlayer()).setAutoPayForHuman(true));
        return paid[0];
    }

    @Test
    public void theFaceDownCardCostsItsPrintedCost() {
        SpellAbility sa = castOf(exiledBears(2));
        assertEquals(sa.getPayCosts().getTotalMana().toString(), "{1}{G}");
    }

    @Test
    public void autoPayWithTooLittleManaPaysNothing() {
        SpellAbility sa = castOf(exiledBears(1));
        ManaCostBeingPaid cost = new ManaCostBeingPaid(sa.getPayCosts().getTotalMana());

        assertFalse(autoPay(sa, cost), "one Swamp cannot pay {1}{G}");
        assertEquals(cost.toString(), "{1}{G}", "no shard was paid");
        assertFalse(swampA.isTapped(), "no Swamp was tapped");
        assertTrue(me.getManaPool().isEmpty(), "no mana was left floating");

        // the second Auto the page lets the player press must not finish what the first one started
        assertFalse(autoPay(sa, cost), "a second Auto still cannot pay it");
        assertFalse(cost.isPaid());
        assertEquals(cost.toString(), "{1}{G}");
    }

    @Test
    public void autoPayWithOffColorManaPaysEverySymbol() {
        SpellAbility sa = castOf(exiledBears(2));
        ManaCostBeingPaid cost = new ManaCostBeingPaid(sa.getPayCosts().getTotalMana());

        assertTrue(autoPay(sa, cost), "two Swamps pay {1}{G} when any type of mana may be spent");
        assertTrue(cost.isPaid());
        assertTrue(swampA.isTapped() && swampB.isTapped(), "both Swamps were spent");
    }

    @Test
    public void theAiPaysTheFullCostFromGonti() {
        Card bears = exiledBears(2);
        SpellAbility sa = castOf(bears);

        assertTrue(ComputerUtil.playStack(sa, me, game), "the AI casts it with two Swamps");
        assertTrue(swampA.isTapped() && swampB.isTapped(), "both Swamps were spent");
        assertNotNull(game.getStack().peekAbility(), "the spell is on the stack");
    }

    @Test
    public void theAiDoesNotCastItWithTooLittleMana() {
        Card bears = exiledBears(1);
        SpellAbility sa = castOf(bears);

        assertFalse(ComputerUtil.playStack(sa, me, game), "one Swamp cannot cast {1}{G}");
        assertFalse(swampA.isTapped(), "the Swamp was not spent");
        assertTrue(game.getStack().isEmpty(), "nothing is on the stack");
        assertTrue(game.getCardState(bears).isInZone(ZoneType.Exile) || game.getCardState(bears).isInZone(ZoneType.Stack), "the card is still where it was or being cast");
    }
}
