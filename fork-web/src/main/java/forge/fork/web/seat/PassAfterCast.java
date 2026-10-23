package forge.fork.web.seat;

import java.util.HashSet;
import java.util.Set;

import forge.game.player.Player;
import forge.game.spellability.SpellAbilityStackInstance;
import forge.game.zone.MagicStack;
import forge.gamemodes.match.input.Input;
import forge.gamemodes.match.input.InputPassPriority;

/**
 * "Pass priority after casting" (owner ruling U1b, a seat setting, off by default): once the seat's own spell or
 * activated ability goes on the stack, the seat passes the priority it gets back (CR 117.3c) once, so the item resolves
 * unless someone responds. Game thread only, except {@link #hold}.
 *
 * <p>The seat acted when it gets priority twice in a row ({@link #priority}: no other player had it in between, so it
 * chose something instead of passing). The pass is due only when every item put on the stack since its previous
 * priority is the seat's, at least one of them a spell or an activated ability (not only triggers: a land's landfall
 * trigger is no cast), and the cast did not ask to hold priority. Anything else (a cancelled cast, a mana ability, an
 * opponent's trigger on top, an undo) leaves the seat its normal priority. Only that priority input is passed
 * ({@link #onInput}): never a target, cost or choice input, and never an empty stack, so no phase stop is skipped.
 */
final class PassAfterCast {

    /** Stack item ids at the seat's last priority. */
    private Set<Integer> before = Set.of();
    /** The last player to get priority was the seat. */
    private boolean seatHadPriority;
    /** The seat's next priority input is passed. */
    private boolean passNext;
    /** The seat's last cast asked to keep priority (any thread: set by the cast action). */
    private volatile boolean hold;

    /** The cast the seat is sending keeps priority for one time (a modifier held while clicking). */
    void hold() {
        hold = true;
    }

    /** A player gets priority ({@code GameEventPlayerPriority}, before it is asked). */
    void priority(Player priorityPlayer, Player seatPlayer, MagicStack stack, boolean on) {
        if (seatPlayer == null || priorityPlayer != seatPlayer) {
            seatHadPriority = false;
            passNext = false;
            return;
        }
        Set<Integer> now = new HashSet<>();
        boolean cast = false;
        boolean othersItem = false;
        for (SpellAbilityStackInstance si : stack) {
            now.add(si.getId());
            if (!before.contains(si.getId())) {
                othersItem |= si.getActivatingPlayer() != seatPlayer;
                cast |= !si.isTrigger();
            }
        }
        passNext = on && seatHadPriority && !hold && cast && !othersItem;
        hold = false;
        seatHadPriority = true;
        before = now;
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
