package forge.fork.web.seat;

import java.util.Collection;
import java.util.Set;
import java.util.regex.Pattern;

import forge.game.Game;
import forge.game.GameObject;
import forge.game.ability.AbilityUtils;
import forge.game.ability.ApiType;
import forge.game.card.Card;
import forge.game.player.Player;
import forge.game.spellability.SpellAbility;
import forge.game.spellability.SpellAbilityStackInstance;
import forge.game.spellability.TargetChoices;
import forge.game.zone.MagicStack;

/**
 * Does a stack item involve a player? "Involved" means it targets or affects the player, the player's permanents or the
 * player's cards in any zone, or the player controls or owns it (owner ruling 2026-10-24, "Stop between opponents").
 * Decided from engine data, generically (never per card), and conservatively: whatever cannot be classified involves.
 *
 * <ul>
 * <li>Who put it there: its activator, and its source card's controller and owner.</li>
 * <li>Targets of the item and of every sub-ability: players, cards (controller or owner), spells on the stack (their
 * activator and source card).</li>
 * <li>Untargeted reach, read from the ability's own parameters with the engine's own resolution: "Defined"-style
 * parameters ({@link AbilityUtils#getDefinedObjects}: {@code Player.Other} includes you, {@code You} is the activator,
 * {@code TriggeredPlayer} the triggering one) and "Valid"-style parameters (tested against you and your cards in every
 * zone with {@code isValid}: a wrath reaches your creatures if you have any). The engine's convention for an absent
 * parameter is the activator ({@code SpellAbilityEffect}: {@code getParamOrDefault("Defined", "You")}).</li>
 * <li>An "All" effect (destroy all, damage all…) or a parameter that names players or controllers in a way not listed
 * here involves everyone.</li>
 * </ul>
 * Game thread only (reads the engine).
 */
final class StackInvolvement {

    /** Parameters naming who or what an effect is applied to, resolved with {@link AbilityUtils#getDefinedObjects}. */
    private static final Set<String> DEFINED = Set.of("Defined", "DefinedPlayer", "DefinedCards", "DefinedCard", "TokenOwner",
            "Chooser", "Controller", "NewController", "EffectOwner", "RepeatPlayers", "RepeatCards", "DefinedDamagers");

    /** Parameters filtering what an effect is applied to, tested with {@code isValid}; others are matched by {@link #VALID}. */
    private static final Pattern VALID = Pattern.compile("(Valid(?!Tgts|Desc|SA|Activating)\\w*|\\w+Valid|ChangeType|ChangeTypeDesc)");

    /** Parameters that restrict targets, choose between targets or describe, never widen the reach. */
    private static final Pattern BENIGN = Pattern.compile(
            "Cost|\\w*Description|\\w*Desc|ValidTgts|ValidSA|ValidActivatingPlayer|Target\\w*|TgtPrompt|TgtZone|Tgt\\w*|AI\\w*"
                    + "|Condition\\w*|Activation\\w*|Present\\w*|Announce\\w*|SubAbility|Execute|Defined\\w*Desc|PlayerTurn|MayChooseTarget"
                    + "|PrecostDesc|Secondary|Mode|Optional\\w*|RememberTargets|ForgetOtherTargets|DividedAsYouChoose|Unique\\w*");

    /** Parameter names that suggest a reach this class does not read: the item is taken as involved. */
    private static final Pattern REACH_HINT = Pattern.compile("(?i).*(player|opponent|each|owner|control|group|everyone|chooser).*");

    private StackInvolvement() { }

    /** Every item on the stack is uninvolved for {@code you} (false for an empty stack). */
    static boolean allUninvolved(Game game, Player you, MagicStack stack) {
        if (stack.isEmpty()) {
            return false;
        }
        for (SpellAbilityStackInstance si : stack) {
            if (involves(game, you, si)) {
                return false;
            }
        }
        return true;
    }

    /** The stack item (with its sub-abilities) involves {@code you}, or cannot be told not to. */
    static boolean involves(Game game, Player you, SpellAbilityStackInstance si) {
        try {
            if (you == null || si == null || si.getActivatingPlayer() == null) {
                return true;
            }
            if (si.getActivatingPlayer() == you || yours(si.getSourceCard(), you)) {
                return true;
            }
            for (SpellAbilityStackInstance item = si; item != null; item = item.getSubInstance()) {
                SpellAbility sa = item.getSpellAbility();
                if (sa == null || involves(you, item.getTargetChoices()) || involves(you, sa.getTargets()) || reaches(game, you, sa)) {
                    return true;
                }
                // a sub-ability the instance chain does not carry
                for (SpellAbility sub = sa.getSubAbility(); sub != null; sub = sub.getSubAbility()) {
                    if (involves(you, sub.getTargets()) || reaches(game, you, sub)) {
                        return true;
                    }
                }
            }
            return false;
        } catch (RuntimeException e) {
            return true; // unsure: stop
        }
    }

    private static boolean yours(Card c, Player you) {
        return c == null || c.getController() == you || c.getOwner() == you;
    }

    private static boolean involves(Player you, TargetChoices targets) {
        if (targets == null) {
            return false;
        }
        for (GameObject o : targets) {
            if (involves(you, o)) {
                return true;
            }
        }
        return false;
    }

    private static boolean involves(Player you, GameObject o) {
        if (o instanceof Player p) {
            return p == you;
        }
        if (o instanceof Card c) {
            return yours(c, you);
        }
        if (o instanceof SpellAbility sa) {
            return sa.getActivatingPlayer() == you || yours(sa.getHostCard(), you);
        }
        return true; // a target of a kind not known here
    }

    /** What the ability applies to without targeting, as its parameters say. */
    private static boolean reaches(Game game, Player you, SpellAbility sa) {
        ApiType api = sa.getApi();
        if (api == null) {
            return false; // a permanent spell: its effects are triggers of their own, put on the stack when it enters
        }
        if (api.name().endsWith("All")) {
            return true;
        }
        Card host = sa.getHostCard();
        for (var e : sa.getMapParams().entrySet()) {
            String key = e.getKey();
            String value = e.getValue();
            if (DEFINED.contains(key)) {
                if (defined(host, value, sa, you)) {
                    return true;
                }
            } else if (VALID.matcher(key).matches() && !BENIGN.matcher(key).matches()) {
                if (valid(you, host, value, sa)) {
                    return true;
                }
            } else if (!BENIGN.matcher(key).matches() && REACH_HINT.matcher(key).matches()) {
                return true;
            }
        }
        return false;
    }

    private static boolean defined(Card host, String value, SpellAbility sa, Player you) {
        for (String d : value.split(" & ")) {
            Collection<GameObject> objects = AbilityUtils.getDefinedObjects(host, d, sa);
            for (GameObject o : objects) {
                if (involves(you, o)) {
                    return true;
                }
            }
        }
        return false;
    }

    /** {@code you}, or a card of yours in any zone, matches the restriction as the ability's controller applies it. */
    private static boolean valid(Player you, Card host, String restriction, SpellAbility sa) {
        Player activator = sa.getActivatingPlayer();
        for (String r : restriction.split(",(?![^(]*\\))")) {
            if (you.isValid(r, activator, host, sa)) {
                return true;
            }
            for (Card c : you.getAllCards()) {
                if (c.isValid(r, activator, host, sa)) {
                    return true;
                }
            }
        }
        return false;
    }
}
