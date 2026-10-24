package forge.fork.web.seat;

import java.util.Collections;
import java.util.EnumSet;
import java.util.List;
import java.util.Set;

import forge.gamemodes.match.YieldController;
import forge.gamemodes.match.YieldUpdate;
import forge.localinstance.properties.ForgePreferences.FPref;

/**
 * The seat's yield settings (issue #125; off by default, owner ruling D4), applied to its {@link YieldController} (the
 * seat is a remote client to the engine: the controller's own prefs and store, never the desktop's {@code FModel};
 * {@link #PINNED} covers the other prefs it would fall back to).
 * <ul>
 * <li>"Auto-pass when I can't act" is the engine's {@code YIELD_AUTO_PASS_NO_ACTIONS}: at a priority the seat has no
 * playable action for ({@code PlayerView.hasAvailableActions}, scanned before the seat is asked), it passes. Only that
 * priority input: blocks, attacks, targets, "may" choices and the mulligan are other inputs, which it never skips.
 * Phase stops and "stop only when I'm involved" are untouched: a stop only matters at a priority the seat can act in.</li>
 * <li>"Auto-yield" is the engine's per-ability auto-yield switch ({@code AutoYieldStore} disabled flag, inverted): with it
 * off the abilities the seat chose with "Always yield to this" are kept but not honoured.</li>
 * </ul>
 */
final class SeatYields {

    /**
     * The desktop prefs the engine's yield code falls back to ({@code YieldController.getStringPref}) that the seat does
     * not set itself: interrupts, suggestions, delays and the action scan's budget. In the launcher they are the owner's
     * desktop settings; a web seat must not depend on them: a suggestion scope other than NEVER turns the seat's pass into
     * a "yield until the stack is empty?" prompt whose OK starts a yield, and an interrupt switched off lets a yield run
     * over the opponent's spells and attackers. Pinned to the engine defaults ({@code FPref.getDefault}).
     */
    static final Set<FPref> PINNED = Collections.unmodifiableSet(EnumSet.of(
            FPref.YIELD_INTERRUPT_ON_ATTACKERS, FPref.YIELD_INTERRUPT_ON_OPPONENT_SPELL, FPref.YIELD_INTERRUPT_ON_TARGETING,
            FPref.YIELD_INTERRUPT_ON_TRIGGERS, FPref.YIELD_INTERRUPT_ON_REVEAL, FPref.YIELD_INTERRUPT_ON_MASS_REMOVAL,
            FPref.YIELD_AUTO_PASS_RESPECTS_INTERRUPTS, FPref.YIELD_SKIP_PHASE_DELAY, FPref.YIELD_SKIP_RESOLVE_DELAY,
            FPref.YIELD_SUPPRESS_ON_OWN_TURN, FPref.YIELD_SUPPRESS_AFTER_END, FPref.YIELD_AVAILABLE_ACTIONS_BUDGET_MS,
            FPref.YIELD_DECLINE_SCOPE_STACK_YIELD, FPref.YIELD_DECLINE_SCOPE_NO_ACTIONS));

    private SeatYields() { }

    /** Before the game runs (a controller just bound): set directly. */
    static void apply(YieldController yc, boolean autoPass, boolean autoYield) {
        for (FPref p : PINNED) {
            yc.setPref(p, p.getDefault());
        }
        yc.setPref(FPref.YIELD_AUTO_PASS_NO_ACTIONS, String.valueOf(autoPass));
        yc.setDisableAutoYields(!autoYield);
    }

    /** While the game runs: the updates that bring the controller in line; applying them also re-checks a sitting prompt. */
    static List<YieldUpdate> updates(boolean autoPass, boolean autoYield) {
        return List.of(new YieldUpdate.SetYieldPref(FPref.YIELD_AUTO_PASS_NO_ACTIONS, String.valueOf(autoPass)),
                new YieldUpdate.SetDisableYields(!autoYield));
    }
}
