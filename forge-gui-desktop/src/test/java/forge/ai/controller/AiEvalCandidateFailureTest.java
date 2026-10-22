package forge.ai.controller;

import java.lang.reflect.Field;
import java.util.List;
import java.util.Map;

import org.testng.AssertJUnit;
import org.testng.annotations.Test;

import forge.ai.AITest;
import forge.ai.AiAbilityDecision;
import forge.ai.PlayerControllerAi;
import forge.ai.SpellAbilityAi;
import forge.ai.SpellApiToAi;
import forge.game.Game;
import forge.game.ability.ApiType;
import forge.game.player.Player;
import forge.game.spellability.SpellAbility;
import forge.game.zone.ZoneType;

/** Issue #92: one candidate whose AI check throws must not cost the AI its whole priority pass. */
public class AiEvalCandidateFailureTest extends AITest {

    private static final class ThrowingAi extends SpellAbilityAi {
        int calls;

        @Override
        protected AiAbilityDecision canPlay(final Player ai, final SpellAbility sa) {
            calls++;
            throw new IllegalStateException("stubbed AI check failure (test)");
        }
    }

    @SuppressWarnings("unchecked")
    private static SpellAbilityAi swapAi(final ApiType api, final SpellAbilityAi replacement) throws ReflectiveOperationException {
        final SpellAbilityAi previous = SpellApiToAi.Converter.get(api);
        final Field f = SpellApiToAi.class.getDeclaredField("apiToInstance");
        f.setAccessible(true);
        ((Map<ApiType, SpellAbilityAi>) f.get(SpellApiToAi.Converter)).put(api, replacement);
        return previous;
    }

    @Test
    public void throwingCandidateIsSkippedAndTheNextPlayableSpellIsStillChosen() throws Exception {
        final Game game = initAndCreateGame();
        final Player ai = game.getPlayers().get(1);

        addCards("Island", 2, ai);
        addCard("Forest", ai);
        // Divination ({2}{U}, Draw) sorts before Grizzly Bears ({1}{G}): highest cost first
        addCardToZone("Divination", ai, ZoneType.Hand);
        addCardToZone("Grizzly Bears", ai, ZoneType.Hand);
        fillLibrary(ai, 10);
        moveToMain2(game, ai);

        final ThrowingAi stub = new ThrowingAi();
        final SpellAbilityAi original = swapAi(ApiType.Draw, stub);
        final List<SpellAbility> choice;
        try {
            choice = ((PlayerControllerAi) ai.getController()).getAi().chooseSpellAbilityToPlay();
        } finally {
            swapAi(ApiType.Draw, original);
        }

        AssertJUnit.assertTrue("the throwing candidate must have been evaluated", stub.calls > 0);
        AssertJUnit.assertNotNull("one throwing candidate must not make the AI pass priority", choice);
        AssertJUnit.assertEquals("Grizzly Bears", choice.get(0).getHostCard().getName());
    }
}
