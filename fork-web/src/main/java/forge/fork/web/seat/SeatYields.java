package forge.fork.web.seat;

import java.util.List;

import forge.gamemodes.match.YieldController;
import forge.gamemodes.match.YieldUpdate;
import forge.localinstance.properties.ForgePreferences.FPref;

/**
 * The seat's yield settings (issue #125; off by default, owner ruling D4), applied to its {@link YieldController} (the
 * seat is a remote client to the engine: the controller's own prefs and store, never the desktop's {@code FModel}).
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

    private SeatYields() { }

    /** Before the game runs (a controller just bound): set directly. */
    static void apply(YieldController yc, boolean autoPass, boolean autoYield) {
        yc.setPref(FPref.YIELD_AUTO_PASS_NO_ACTIONS, String.valueOf(autoPass));
        yc.setDisableAutoYields(!autoYield);
    }

    /** While the game runs: the updates that bring the controller in line; applying them also re-checks a sitting prompt. */
    static List<YieldUpdate> updates(boolean autoPass, boolean autoYield) {
        return List.of(new YieldUpdate.SetYieldPref(FPref.YIELD_AUTO_PASS_NO_ACTIONS, String.valueOf(autoPass)),
                new YieldUpdate.SetDisableYields(!autoYield));
    }
}
