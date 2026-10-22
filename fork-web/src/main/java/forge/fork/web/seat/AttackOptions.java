package forge.fork.web.seat;

import java.util.ArrayList;
import java.util.List;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;

import forge.game.GameEntity;
import forge.game.card.Card;
import forge.game.combat.Combat;
import forge.game.player.Player;
import forge.fork.web.bridge.SeatRefs;

/**
 * What the engine lets a seat attack while it declares attackers (issue #65): the combat's defenders
 * ({@code Combat.getDefenders}, which {@code InputAttack} offers): players, planeswalkers and battles. Sent as
 * {@code {"t":"attackOptions"}} with each {@code InputAttack} refresh, so the page offers only what the engine allows.
 */
record AttackOptions(List<GameEntity> defenders) {

    static AttackOptions of(Combat combat) {
        return new AttackOptions(combat == null ? List.of() : new ArrayList<>(combat.getDefenders()));
    }

    /** Defenders as entity refs in the seat's id space; a card the seat has no id for is left out. */
    JsonObject toJson(SeatRefs refs) {
        JsonObject j = new JsonObject();
        j.addProperty("t", "attackOptions");
        JsonArray ds = new JsonArray();
        for (GameEntity d : defenders) {
            JsonObject o = new JsonObject();
            if (d instanceof Player p) {
                o.addProperty("type", "player");
                o.addProperty("id", p.getId());
            } else if (d instanceof Card c && refs.card(c.getId()) >= 0) {
                o.addProperty("type", "card");
                o.addProperty("id", refs.card(c.getId()));
            } else {
                continue;
            }
            ds.add(o);
        }
        j.add("defenders", ds);
        return j;
    }
}
