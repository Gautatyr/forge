package forge.fork.web.seat;

import static org.testng.Assert.assertEquals;

import java.util.Arrays;
import java.util.EnumSet;

import org.testng.annotations.BeforeClass;
import org.testng.annotations.Test;

import forge.fork.web.bridge.visibility.TestEngine;
import forge.gamemodes.match.YieldController;
import forge.localinstance.properties.ForgePreferences;
import forge.localinstance.properties.ForgePreferences.FPref;
import forge.model.FModel;

/** The web seat's yield behaviour does not depend on the desktop app's preferences (the owner's own, in the launcher). */
public class SeatYieldsTest {

    @BeforeClass
    public void boot() {
        TestEngine.boot();
    }

    /** The desktop prefs the engine's yield code reads for a seat's controller (YieldController.SYNCED_PREFS) other than the seat's own. */
    private static final FPref[] READ = {
        FPref.YIELD_INTERRUPT_ON_ATTACKERS, FPref.YIELD_INTERRUPT_ON_OPPONENT_SPELL, FPref.YIELD_INTERRUPT_ON_TARGETING,
        FPref.YIELD_INTERRUPT_ON_TRIGGERS, FPref.YIELD_INTERRUPT_ON_REVEAL, FPref.YIELD_INTERRUPT_ON_MASS_REMOVAL,
        FPref.YIELD_AUTO_PASS_RESPECTS_INTERRUPTS, FPref.YIELD_SKIP_PHASE_DELAY, FPref.YIELD_SKIP_RESOLVE_DELAY,
        FPref.YIELD_SUPPRESS_ON_OWN_TURN, FPref.YIELD_SUPPRESS_AFTER_END, FPref.YIELD_AVAILABLE_ACTIONS_BUDGET_MS,
        FPref.YIELD_DECLINE_SCOPE_STACK_YIELD, FPref.YIELD_DECLINE_SCOPE_NO_ACTIONS };

    /** Every such pref set to a non-default value on the desktop: the seat's controller still has the engine default. */
    @Test
    public void desktopYieldPrefsDoNotReachTheSeat() {
        ForgePreferences desktop = FModel.getPreferences();
        for (FPref p : READ) {
            desktop.setPref(p, other(p));
        }
        try {
            YieldController yc = new YieldController(null);
            SeatYields.apply(yc, true, true);
            for (FPref p : READ) {
                assertEquals(yc.getStringPref(p), p.getDefault(), p + " is the engine default, not the desktop's");
            }
            assertEquals(yc.getStringPref(FPref.YIELD_AUTO_PASS_NO_ACTIONS), "true", "the seat's own setting");
        } finally {
            for (FPref p : READ) {
                desktop.setPref(p, p.getDefault());
            }
        }
    }

    @Test
    public void thePinnedSetIsExactlyWhatTheEngineReads() {
        assertEquals(SeatYields.PINNED, EnumSet.copyOf(Arrays.asList(READ)));
    }

    private static String other(FPref p) {
        String d = p.getDefault();
        if (d.equals("true") || d.equals("false")) {
            return String.valueOf(!Boolean.parseBoolean(d));
        }
        return d.equals("NEVER") ? "ALWAYS" : "777";
    }
}
