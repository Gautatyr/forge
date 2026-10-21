package forge.fork.web.seat;

import java.util.ArrayList;
import java.util.List;
import java.util.Objects;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;

import forge.game.card.Card;
import forge.game.combat.Combat;
import forge.game.combat.CombatUtil;
import forge.game.player.Player;
import forge.fork.web.bridge.SeatRefs;

/**
 * What the engine lets a seat block while it declares blockers (issue #48): per attacker, the creatures that may block
 * it now ({@code CombatUtil.canBlock} with the blocks declared so far, plus those already blocking it), and those that
 * could once taken off the attacker they block now. Sent as {@code {"t":"blockOptions"}} with each {@code InputBlock}
 * refresh, so the page lights and pairs only what the engine allows.
 */
record BlockOptions(List<Attacker> attackers) {

    /** {@code min}: fewest blockers the engine accepts for this attacker (menace: 2), when more than 1. */
    record Attacker(Card card, List<Card> blockers, List<Card> ifFreed, int min) { }

    /** For the players whose blocks {@code seat} declares (itself, or another player under an Odric-like effect). */
    static BlockOptions of(Combat combat, Player seat) {
        List<Attacker> out = new ArrayList<>();
        if (combat == null || seat == null) {
            return new BlockOptions(out);
        }
        for (Card a : combat.getAttackers()) {
            Player defender = combat.getDefenderPlayerByAttacker(a);
            if (defender == null || Objects.requireNonNullElse(defender.getDeclaresBlockers(), defender) != seat) {
                continue;
            }
            List<Card> now = new ArrayList<>();
            List<Card> freed = new ArrayList<>();
            for (Card b : defender.getCreaturesInPlay()) {
                if (combat.isBlocking(b, a) || CombatUtil.canBlock(a, b, combat)) {
                    now.add(b);
                } else if (combat.isBlocking(b) && CombatUtil.canBlock(a, b) && CombatUtil.canBeBlocked(a, combat, defender)) {
                    freed.add(b);
                }
            }
            out.add(new Attacker(a, now, freed, CombatUtil.getMinNumBlockersForAttacker(a, defender)));
        }
        return new BlockOptions(out);
    }

    JsonObject toJson(SeatRefs refs) {
        JsonObject j = new JsonObject();
        j.addProperty("t", "blockOptions");
        JsonArray as = new JsonArray();
        for (Attacker a : attackers) {
            JsonObject o = new JsonObject();
            o.addProperty("card", refs.card(a.card().getId()));
            o.add("blockers", ids(a.blockers(), refs));
            o.add("ifFreed", ids(a.ifFreed(), refs));
            if (a.min() > 1) {
                o.addProperty("min", a.min());
            }
            as.add(o);
        }
        j.add("attackers", as);
        return j;
    }

    private static JsonArray ids(List<Card> cards, SeatRefs refs) {
        JsonArray a = new JsonArray();
        for (Card c : cards) {
            a.add(refs.card(c.getId()));
        }
        return a;
    }
}
