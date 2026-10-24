package forge.fork.web.seat;

import forge.game.Game;
import forge.game.player.Player;
import forge.game.zone.MagicStack;
import forge.gamemodes.match.input.Input;
import forge.gamemodes.match.input.InputPassPriority;

/**
 * "Skip spells between opponents" (owner ruling 2026-10-24, a seat setting, off by default; "Stop only when I'm
 * involved" leaves stack stops alone): at a priority of the seat with a non-empty stack whose every item neither targets
 * nor affects the seat ({@link StackInvolvement}), the seat passes without being asked. Only that priority input is
 * passed ({@link #onInput}), never a target, cost, block or choice input; an empty stack is never skipped, so no phase
 * stop is. The whole stack is judged, not its top: the seat's own item, or any item that involves it, keeps its priority
 * so it may respond to an opponent's response. Game thread only.
 */
final class SkipOpponentStack {

    /** The seat's next priority input is passed. */
    private boolean passNext;

    /** A player gets priority ({@code GameEventPlayerPriority}, before it is asked). */
    void priority(Game game, Player priorityPlayer, Player seatPlayer, MagicStack stack, boolean on) {
        passNext = on && seatPlayer != null && priorityPlayer == seatPlayer && StackInvolvement.allUninvolved(game, seatPlayer, stack);
    }

    /** Game thread, before the seat's input waits: the pass to run for it, or null. */
    Runnable onInput(Input in, Player seatPlayer) {
        if (!passNext || !(in instanceof InputPassPriority pass) || in.getOwner() == null
                || seatPlayer == null || in.getOwner().getId() != seatPlayer.getId()) {
            return null;
        }
        passNext = false;
        return pass::passPriority;
    }
}
