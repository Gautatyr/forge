package forge.fork.web.server;

/**
 * Bound of one client's send queue (messages not yet handed to the channel). Overflow drops the
 * queue and the client gets a fresh snapshot instead. {@code maxChars} counts UTF-16 chars.
 */
record SendLimits(int maxMessages, long maxChars) {

    /** Measured: snapshots up to ~0.4 MB, deltas ~1–2 KB at 2–18/s (spike-report.md, Measurements). */
    static final SendLimits DEFAULT = new SendLimits(512, 4L << 20);
}
