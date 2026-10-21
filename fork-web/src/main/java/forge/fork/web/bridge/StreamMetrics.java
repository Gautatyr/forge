package forge.fork.web.bridge;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.TreeMap;
import java.util.zip.Deflater;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;

/**
 * Per-game wire measurements. Delta sizes are the spectator stream's; seat streams add up in
 * {@code seatDeltaBytes}; encode time covers every viewer. Guarded by the owning {@link GameStream}'s lock.
 */
public final class StreamMetrics {
    private final String label;
    private final long startMs = System.currentTimeMillis();
    private int flushes;
    private int deltas;
    private long deltaBytes;
    private long deltaDeflatedBytes;
    private long maxDeltaBytes;
    private long seatDeltaBytes;
    private long encodeNanos;
    private long maxEncodeNanos;
    private long snapshotSerializeNanos;
    private int snapshotSerializeCount;
    private final TreeMap<Long, long[]> perSecond = new TreeMap<>();
    private final List<JsonObject> snapshotSamples = new ArrayList<>();
    private int clientSnapshotsSent;
    private long lastClientSnapshotBytes;

    public StreamMetrics(String label) {
        this.label = label;
    }

    public static byte[] utf8(String s) {
        return s.getBytes(StandardCharsets.UTF_8);
    }

    public static int deflatedSize(byte[] in) {
        Deflater d = new Deflater(Deflater.DEFAULT_COMPRESSION, true);
        d.setInput(in);
        d.finish();
        byte[] buf = new byte[8192];
        int total = 0;
        while (!d.finished()) {
            total += d.deflate(buf);
        }
        d.end();
        return total;
    }

    /** One flush: collect, encode, filter and send, for every viewer. */
    void recordFlush(long nanos, long seatBytes) {
        flushes++;
        encodeNanos += nanos;
        maxEncodeNanos = Math.max(maxEncodeNanos, nanos);
        seatDeltaBytes += seatBytes;
    }

    /** One spectator delta. */
    void recordDelta(int bytes, int deflated) {
        deltas++;
        deltaBytes += bytes;
        deltaDeflatedBytes += deflated;
        maxDeltaBytes = Math.max(maxDeltaBytes, bytes);
        long sec = (System.currentTimeMillis() - startMs) / 1000;
        long[] b = perSecond.computeIfAbsent(sec, k -> new long[2]);
        b[0]++;
        b[1] += bytes;
    }

    void recordSnapshotSerialize(long nanos) {
        snapshotSerializeNanos += nanos;
        snapshotSerializeCount++;
    }

    void recordSnapshotSample(int turn, String phase, int objects, int bytes, int deflated, int objectsOnlyBytes) {
        JsonObject o = new JsonObject();
        o.addProperty("turn", turn);
        o.addProperty("phase", phase);
        o.addProperty("objects", objects);
        o.addProperty("bytes", bytes);
        o.addProperty("deflatedBytes", deflated);
        o.addProperty("objectsOnlyBytes", objectsOnlyBytes);
        o.addProperty("tMs", System.currentTimeMillis() - startMs);
        snapshotSamples.add(o);
    }

    void recordClientSnapshot(int bytes) {
        clientSnapshotsSent++;
        lastClientSnapshotBytes = bytes;
    }

    public JsonObject toJson() {
        long durMs = Math.max(1, System.currentTimeMillis() - startMs);
        JsonObject o = new JsonObject();
        o.addProperty("label", label);
        o.addProperty("durationMs", durMs);
        o.addProperty("flushes", flushes);
        o.addProperty("deltas", deltas);
        o.addProperty("deltaBytes", deltaBytes);
        o.addProperty("deltaDeflatedBytes", deltaDeflatedBytes);
        o.addProperty("avgDeltaBytes", deltas == 0 ? 0 : deltaBytes / deltas);
        o.addProperty("maxDeltaBytes", maxDeltaBytes);
        o.addProperty("deltasPerSecond", deltas * 1000.0 / durMs);
        o.addProperty("deltaBytesPerSecond", deltaBytes * 1000.0 / durMs);
        o.addProperty("seatDeltaBytes", seatDeltaBytes);
        o.addProperty("avgEncodeMicros", flushes == 0 ? 0 : encodeNanos / flushes / 1000);
        o.addProperty("maxEncodeMicros", maxEncodeNanos / 1000);
        o.addProperty("avgSnapshotSerializeMicros", snapshotSerializeCount == 0 ? 0 : snapshotSerializeNanos / snapshotSerializeCount / 1000);
        o.addProperty("clientSnapshotsSent", clientSnapshotsSent);
        o.addProperty("lastClientSnapshotBytes", lastClientSnapshotBytes);
        long peakCount = 0;
        long peakBytes = 0;
        for (long[] b : perSecond.values()) {
            peakCount = Math.max(peakCount, b[0]);
            peakBytes = Math.max(peakBytes, b[1]);
        }
        o.addProperty("peakDeltasInOneSecond", peakCount);
        o.addProperty("peakBytesInOneSecond", peakBytes);
        JsonArray samples = new JsonArray();
        snapshotSamples.forEach(samples::add);
        o.add("snapshotSamples", samples);
        return o;
    }
}
