package forge.fork.web.bridge;

import java.util.ArrayList;
import java.util.List;

/**
 * The round shown beside the turn number ("Round 7 · Turn 26"): how many times the first player has
 * started a turn. The first player is the starting player, or once they are out, the next player in
 * turn order still in the game; the round they were in goes on. A new round starts only on a turn of the first
 * player that does not follow later in turn order (a regular turn after a wrap, an extra turn, or a
 * turn after a reversal); out-of-order turns of other players never start one. Fed from
 * {@code GameEventTurnBegan} in order, so batching never skips a turn. Not thread-safe (game thread).
 */
public final class RoundCounter {

    /** Turn order from the starting player, fixed at the first turn. */
    private List<Integer> order;
    private int lastPos;
    private int round;

    /** 0 before the first turn. */
    public int round() {
        return round;
    }

    public void reset() {
        order = null;
        lastPos = 0;
        round = 0;
    }

    /**
     * A turn began.
     *
     * @param owner the player whose turn it is
     * @param inGame the players still in the game, in turn order (the engine's player list)
     * @return the round now
     */
    public int turnBegan(int owner, List<Integer> inGame) {
        if (order == null) {
            int start = Math.max(0, inGame.indexOf(owner));
            order = new ArrayList<>(inGame.subList(start, inGame.size()));
            order.addAll(inGame.subList(0, start));
            if (!order.contains(owner)) {
                order.add(0, owner);
            }
            lastPos = order.indexOf(owner);
            round = 1;
            return round;
        }
        int pos = order.indexOf(owner);
        if (pos < 0) {
            return round;
        }
        Integer first = order.stream().filter(inGame::contains).findFirst().orElse(null);
        if (Integer.valueOf(owner).equals(first) && pos <= lastPos) {
            round++;
        }
        lastPos = pos;
        return round;
    }
}
