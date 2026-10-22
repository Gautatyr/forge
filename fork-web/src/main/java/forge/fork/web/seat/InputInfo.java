package forge.fork.web.seat;

import java.lang.reflect.Field;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import com.google.gson.JsonObject;

import forge.game.ability.SpellAbilityEffect;
import forge.game.player.Player;
import forge.game.spellability.SpellAbility;
import forge.game.trigger.WrappedAbility;
import forge.gamemodes.match.input.Input;
import forge.gamemodes.match.input.InputBase;
import forge.gamemodes.match.input.InputSelectManyBase;
import forge.gamemodes.match.input.InputSelectStackItems;
import forge.gamemodes.match.input.InputSelectTargets;

/**
 * What a seat's selection input asks (issue #81), sent with its {@code showPromptMessage} call as {@code input}: the page
 * words a target pick and a card pick (a cost, a discard, a sacrifice) differently. {@code kind}: {@code target} for
 * {@link InputSelectTargets} and {@link InputSelectStackItems}, {@code pick} for every {@link InputSelectManyBase}.
 * {@code ability} (targets): the spell, activated or triggered ability the targets are for. {@code decline} (picks): the
 * input pays an "unless" cost and Cancel lets this happen: the engine's words ({@code PlaySpellAbility.getOrStringFromCost})
 * worded for the seat ({@link #declineWords}).
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
            String decline = decline(sa, in instanceof InputBase b ? b.getController().getPlayer() : null);
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
     * own "(or: …)" prompt suffix words it, then for the seat ({@link #declineWords}). A script's {@code OrString} has
     * its placeholders ({@code {c:Self}}, {@code {p:You}}, …) resolved by the engine's stack-description formatter
     * ({@code SpellAbilityEffect.tokenizeString}, issue #88); its "your" is the controller's, as in Oracle text.
     * Null for {@code UnlessSwitched} (not paying does nothing) and other inputs.
     */
    static String decline(SpellAbility sa, Player seat) {
        if (!sa.hasParam("UnlessCost") || sa.hasParam("UnlessSwitched")) {
            return null;
        }
        Player activator = sa.getActivatingPlayer();
        String text;
        if (sa.hasParam("OrString")) {
            StringBuilder sb = new StringBuilder();
            SpellAbilityEffect.tokenizeString(sa, sb, sa.getParam("OrString"));
            text = sb.toString();
            if (activator != null && seat != null && activator != seat) {
                text = YOUR.matcher(text).replaceAll(Matcher.quoteReplacement(activator.getName() + "'s"));
            }
        } else {
            text = sa.getStackDescription();
        }
        text = declineWords(text, seat == null ? null : seat.getName(), activator == null ? null : activator.getName());
        return text.isEmpty() ? null : text;
    }

    private static final Pattern YOUR = Pattern.compile("(?<![\\w'])[Yy]our\\b");

    private static final Pattern CARD_ID = Pattern.compile("\\s*\\(\\d+\\)");
    private static final Pattern FIRST_WORD = Pattern.compile("^(\\S+)");
    /** Verbs a stack description starts with, without a subject, when the ability's controller acts ("Sacrifices Drekavac"). */
    private static final Set<String> CONTROLLER_VERBS = Set.of("sacrifices", "discards", "draws", "loses", "gains", "mills",
            "exiles", "destroys", "returns", "puts", "creates", "shuffles", "searches", "reveals", "pays", "taps", "untaps");

    /**
     * An engine stack description as Cancel words for the seat: no card ids or final period; a description that starts
     * with a verb gets the activator as subject ("Sacrifices Drekavac (23)" → "Mira sacrifices Drekavac"); the seat as
     * subject is "You" with the verb agreeing ("You loses 3 life." → "You lose 3 life"); the seat elsewhere is "you" /
     * "your". Other words stay the engine's.
     */
    static String declineWords(String engineText, String seatName, String activatorName) {
        String t = engineText == null ? "" : CARD_ID.matcher(engineText).replaceAll("").replaceAll("\\s+", " ").trim();
        t = t.replaceAll("\\.$", "");
        Matcher first = FIRST_WORD.matcher(t);
        // Only a capitalised verb ("Sacrifices") starts a subject-less sentence.
        if (activatorName != null && first.find()
                && Character.isUpperCase(first.group(1).charAt(0))
                && CONTROLLER_VERBS.contains(first.group(1).toLowerCase())) {
            t = activatorName + " " + first.group(1).toLowerCase() + t.substring(first.end(1));
        }
        if (t.isEmpty() || seatName == null || seatName.isBlank()) {
            return t;
        }
        String name = Pattern.quote(seatName);
        Matcher subject = Pattern.compile("^" + name + " ([a-z]+)\\b").matcher(t);
        String head = "";
        if (subject.find()) {
            head = "You " + agree(subject.group(1));
            t = t.substring(subject.end());
        }
        t = t.replaceAll("(?<![\\w'])" + name + "'s\\b", "your");
        return head + t.replaceAll("(?<![\\w'])" + name + "(?![\\w']|\\s+[A-Z])", "you");
    }

    /** A third-person present verb agreeing with "you": "loses" → "lose", "has" → "have", "copies" → "copy", "passes" → "pass". */
    private static String agree(String verb) {
        switch (verb) {
            case "has": return "have";
            case "is": return "are";
            case "does": return "do";
            case "was": return "were";
            default: break;
        }
        if (verb.length() > 3 && verb.endsWith("ies")) {
            return verb.substring(0, verb.length() - 3) + "y";
        }
        if (verb.matches(".*(ss|sh|ch|x|z)es")) {
            return verb.substring(0, verb.length() - 2);
        }
        return verb.endsWith("s") && !verb.endsWith("ss") ? verb.substring(0, verb.length() - 1) : verb;
    }
}
