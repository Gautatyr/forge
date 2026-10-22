package forge.fork.web.seat;

import java.lang.reflect.Field;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

import com.google.gson.JsonObject;

import forge.game.spellability.SpellAbility;
import forge.game.trigger.WrappedAbility;
import forge.gamemodes.match.input.Input;
import forge.gamemodes.match.input.InputSelectManyBase;
import forge.gamemodes.match.input.InputSelectStackItems;
import forge.gamemodes.match.input.InputSelectTargets;

/**
 * What a seat's selection input asks (issue #81), sent with its {@code showPromptMessage} call as {@code input}: the page
 * words a target pick and a card pick (a cost, a discard, a sacrifice) differently. {@code kind}: {@code target} for
 * {@link InputSelectTargets} and {@link InputSelectStackItems}, {@code pick} for every {@link InputSelectManyBase}.
 * {@code ability} (targets): the spell, activated or triggered ability the targets are for. {@code decline} (picks): the
 * input pays an "unless" cost and Cancel lets this happen, in the engine's words ({@code PlaySpellAbility.getOrStringFromCost}).
 *
 * <p>The inputs keep their spell ability in a non-public field {@code sa}, read by reflection; when it is renamed upstream
 * the info keeps its {@code kind} only ({@code InputInfoTest} fails).
 */
final class InputInfo {

    private static final Map<Class<?>, Field> FIELDS = new ConcurrentHashMap<>();

    private InputInfo() { }

    /** Null for an input that is not a selection. */
    static JsonObject of(Input in) {
        String kind = in instanceof InputSelectTargets || in instanceof InputSelectStackItems ? "target"
                : in instanceof InputSelectManyBase<?> ? "pick" : null;
        if (kind == null) {
            return null;
        }
        JsonObject o = new JsonObject();
        o.addProperty("kind", kind);
        SpellAbility sa = spellAbility(in);
        if (sa == null) {
            return o;
        }
        if ("target".equals(kind)) {
            String ability = ability(sa.getRootAbility());
            if (ability != null) {
                o.addProperty("ability", ability);
            }
        } else {
            String decline = decline(sa);
            if (decline != null) {
                o.addProperty("decline", decline);
            }
        }
        return o;
    }

    static SpellAbility spellAbility(Input in) {
        Class<?> owner = in instanceof InputSelectTargets ? InputSelectTargets.class
                : in instanceof InputSelectStackItems ? InputSelectStackItems.class
                : in instanceof InputSelectManyBase<?> ? InputSelectManyBase.class : null;
        if (owner == null) {
            return null;
        }
        try {
            Field f = FIELDS.computeIfAbsent(owner, c -> {
                try {
                    Field x = c.getDeclaredField("sa");
                    x.setAccessible(true);
                    return x;
                } catch (ReflectiveOperationException e) {
                    throw new IllegalStateException(e);
                }
            });
            return f.get(in) instanceof SpellAbility sa ? sa : null;
        } catch (ReflectiveOperationException | RuntimeException e) {
            return null;
        }
    }

    private static String ability(SpellAbility root) {
        if (root instanceof WrappedAbility || root.isTrigger()) {
            return "triggered";
        }
        if (root.isSpell()) {
            return "spell";
        }
        return root.isActivatedAbility() ? "activated" : null;
    }

    /**
     * An "unless" cost ({@code UnlessCost}): not paying lets the ability do what its text says, worded as the engine's
     * own "(or: …)" prompt suffix words it. Null for {@code UnlessSwitched} (not paying does nothing) and other inputs.
     */
    private static String decline(SpellAbility sa) {
        if (!sa.hasParam("UnlessCost") || sa.hasParam("UnlessSwitched")) {
            return null;
        }
        String text = sa.hasParam("OrString") ? sa.getParam("OrString") : sa.getStackDescription();
        text = text == null ? "" : text.trim();
        return text.isEmpty() ? null : text;
    }
}
