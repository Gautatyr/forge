package forge.web.bridge;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.TreeMap;
import java.util.zip.Deflater;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;

/** Per-game wire measurements. Guarded by the owning {@link GameStream}'s lock. */
public final class StreamMetrics {
    private final String label;
    private final long startMs = System.currentTimeMillis();
    private int deltas;
    private long deltaBytes;
    private long deltaDeflatedBytes;
    private long maxDeltaBytes;
    private long fullIfSnapshotBytes;
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

    void recordDelta(int bytes, int deflated, long nanos, int fullSnapshotBytes) {
        deltas++;
        deltaBytes += bytes;
        deltaDeflatedBytes += deflated;
        maxDeltaBytes = Math.max(maxDeltaBytes, bytes);
        fullIfSnapshotBytes += fullSnapshotBytes;
        encodeNanos += nanos;
        maxEncodeNanos = Math.max(maxEncodeNanos, nanos);
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
        o.addProperty("deltas", deltas);
        o.addProperty("deltaBytes", deltaBytes);
        o.addProperty("deltaDeflatedBytes", deltaDeflatedBytes);
        o.addProperty("avgDeltaBytes", deltas == 0 ? 0 : deltaBytes / deltas);
        o.addProperty("maxDeltaBytes", maxDeltaBytes);
        o.addProperty("deltasPerSecond", deltas * 1000.0 / durMs);
        o.addProperty("deltaBytesPerSecond", deltaBytes * 1000.0 / durMs);
        o.addProperty("fullSnapshotPerFlushBytes", fullIfSnapshotBytes);
        o.addProperty("fullSnapshotPerFlushBytesPerSecond", fullIfSnapshotBytes * 1000.0 / durMs);
        o.addProperty("avgEncodeMicros", deltas == 0 ? 0 : encodeNanos / deltas / 1000);
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
