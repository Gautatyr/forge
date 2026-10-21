package forge.web.seat;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;

/**
 * Questions to a human player answered without the player: a prompt closed by timeout, disconnect or a closed seat
 * (its engine default), a method the seat has no prompt for, or a headless {@code IGuiBase} dialog. Each one is
 * logged on stderr as {@code [web] SILENT DEFAULT …}. In strict mode ({@code -Dforge.web.strictPrompts=true}, or
 * {@link #setStrict}) it also throws {@link SilentDefaultException} on the thread that asked, so tests and the
 * card-pool sweep fail. Audit: {@code docs/fork/audit/human-seat.md}.
 */
public final class SilentDefaults {

    public static final String STRICT_PROPERTY = "forge.web.strictPrompts";

    /** Thrown in strict mode instead of answering for the player. */
    public static final class SilentDefaultException extends IllegalStateException {
        private static final long serialVersionUID = 1L;

        SilentDefaultException(String message) {
            super(message);
        }
    }

    private static final AtomicLong COUNT = new AtomicLong();
    private static final List<String> RECENT = new ArrayList<>();
    private static final int KEEP = 100;
    private static volatile Boolean strict;

    private SilentDefaults() { }

    /** Strict mode: the override from {@link #setStrict}, else the system property. */
    public static boolean isStrict() {
        Boolean s = strict;
        return s != null ? s : Boolean.getBoolean(STRICT_PROPERTY);
    }

    /** Overrides the system property; null restores it. */
    public static void setStrict(Boolean value) {
        strict = value;
    }

    /**
     * A question answered without the player: {@code where} names the seat or GUI, {@code what} the question and
     * the answer used. Logs it; in strict mode throws.
     */
    public static void report(String where, String what) {
        String line = "[web] SILENT DEFAULT " + where + ": " + what;
        COUNT.incrementAndGet();
        synchronized (RECENT) {
            RECENT.add(line);
            if (RECENT.size() > KEEP) {
                RECENT.remove(0);
            }
        }
        System.err.println(line);
        if (isStrict()) {
            throw new SilentDefaultException(line);
        }
    }

    /** Silent defaults since the JVM started or the last {@link #reset}. */
    public static long count() {
        return COUNT.get();
    }

    /** The last reports (at most 100), oldest first. */
    public static List<String> recent() {
        synchronized (RECENT) {
            return new ArrayList<>(RECENT);
        }
    }

    public static void reset() {
        COUNT.set(0);
        synchronized (RECENT) {
            RECENT.clear();
        }
    }
}
