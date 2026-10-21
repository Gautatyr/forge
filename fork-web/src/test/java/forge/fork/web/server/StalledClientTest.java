package forge.fork.web.server;

import static org.testng.Assert.assertEquals;
import static org.testng.Assert.assertTrue;

import java.io.InputStream;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.nio.file.Files;
import java.nio.file.Path;

import org.testng.annotations.Test;

import forge.fork.web.bridge.ClientSink;
import io.netty.channel.Channel;

/** A real loopback client that stops reading: server memory stays bounded; reading again resyncs it. */
public class StalledClientTest {

    private static final int HIGH_WATER_MARK = 1 << 20;

    @Test(timeOut = 60_000)
    public void stalledSocketClientStaysBoundedAndRecoversWithSnapshot() throws Exception {
        String token = AccessPolicy.newToken();
        SendLimits limits = new SendLimits(64, 1 << 20);
        FakeHub hub = new FakeHub();
        Path root = Files.createTempDirectory("forge-web-test");
        WebServer server = new WebServer(0, root, hub, token, limits);
        server.start();
        try (Socket s = new Socket()) {
            s.setReceiveBufferSize(4096);
            s.connect(new InetSocketAddress(InetAddress.getLoopbackAddress(), server.port()));
            s.setSoTimeout(10_000);
            s.getOutputStream().write(RawHttp.upgradeRequest("/ws?token=" + token, "127.0.0.1:" + server.port(), null));
            InputStream in = s.getInputStream();
            assertEquals(RawHttp.statusOf(RawHttp.readHead(in)), 101);
            assertEquals(RawHttp.readTextFrame(in), "hello");
            assertEquals(RawHttp.readTextFrame(in), "snapshot 0");
            for (int i = 0; i < 500 && hub.clientCount() == 0; i++) {
                Thread.sleep(10);
            }
            Channel ch = ((ChannelSink) hub.clients.get(0)).channel();

            // the client reads nothing; push ~100 MB through the stream. The producer also outpaces the
            // event loop here, so overflow resyncs can happen before the socket stalls: that is allowed.
            String pad = "x".repeat(10_000);
            for (int i = 0; i < 10_000; i++) {
                hub.broadcast("delta " + i + " " + pad);
                for (ClientSink c : hub.clients) {
                    ChannelSink sink = (ChannelSink) c;
                    assertTrue(sink.backlogMessages() <= limits.maxMessages());
                    assertTrue(sink.backlogChars() <= limits.maxChars());
                    // plus at most the greeting and snapshot of the current subscription
                    assertTrue(sink.queuedMessages() <= limits.maxMessages() + 2);
                }
            }
            // the game keeps publishing at its own pace: the paused queue fills and the subscription goes stale
            for (int i = 0; i < 2_000 && !(currentStale(hub) && !ch.isWritable()); i++) {
                hub.broadcast("slow delta " + i + " " + pad);
                Thread.sleep(2);
            }
            assertTrue(currentStale(hub) && !ch.isWritable(), "a stalled client overflows and waits for writability");
            long inNetty = ch.unsafe().outboundBuffer().totalPendingWriteBytes();
            assertTrue(inNetty <= HIGH_WATER_MARK + 2 * pad.length(), "pending in Netty: " + inNetty);
            assertEquals(hub.clientCount(), 1);
            int lastSnapshot = hub.adds.get() - 1;

            // the client reads again: frames in flight, then per resync a hello and a snapshot k (k increasing).
            // A resync's snapshot can be dropped with its queue after its hello left; then the next hello follows.
            // Never a delta between a hello and its snapshot. The last resync happens once the socket drains.
            hub.broadcast("dropped while stale");
            int deltas = 0;
            int snapshot = 0;
            boolean needSnapshot = false;
            while (snapshot < lastSnapshot + 1) {
                String frame = RawHttp.readTextFrame(in);
                if ("hello".equals(frame)) {
                    needSnapshot = true;
                } else if (frame.startsWith("snapshot ")) {
                    assertTrue(needSnapshot, "snapshot after hello");
                    int k = Integer.parseInt(frame.substring("snapshot ".length()));
                    assertTrue(k > snapshot, "snapshots in order: " + k + " after " + snapshot);
                    snapshot = k;
                    needSnapshot = false;
                } else {
                    assertTrue(frame.startsWith("delta ") || frame.startsWith("slow delta "), frame);
                    assertTrue(!needSnapshot, "delta between hello and snapshot");
                    deltas++;
                }
            }
            assertEquals(snapshot, lastSnapshot + 1, "a fresh snapshot after the stall");
            assertTrue(deltas < 10_000, "deltas were dropped, not all delivered");
            hub.broadcast("after resync");
            assertEquals(RawHttp.readTextFrame(in), "after resync");
            assertEquals(hub.clientCount(), 1);
        } finally {
            server.stop();
        }
    }

    private static boolean currentStale(FakeHub hub) {
        for (ClientSink c : hub.clients) {
            if (((ChannelSink) c).isStale()) {
                return true;
            }
        }
        return false;
    }
}
