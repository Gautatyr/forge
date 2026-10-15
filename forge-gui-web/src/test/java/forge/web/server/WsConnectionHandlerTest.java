package forge.web.server;

import static org.testng.Assert.assertEquals;
import static org.testng.Assert.assertFalse;
import static org.testng.Assert.assertTrue;

import java.util.ArrayList;
import java.util.List;

import org.testng.annotations.BeforeMethod;
import org.testng.annotations.Test;

import io.netty.channel.embedded.EmbeddedChannel;
import io.netty.handler.codec.http.EmptyHttpHeaders;
import io.netty.handler.codec.http.websocketx.TextWebSocketFrame;
import io.netty.handler.codec.http.websocketx.WebSocketServerProtocolHandler;

/** Backpressure and resync of one WebSocket client, on an embedded channel with a fake stream. */
public class WsConnectionHandlerTest {

    private static final SendLimits LIMITS = new SendLimits(8, 1_000);

    private FakeHub hub;
    private WsConnectionHandler handler;
    private EmbeddedChannel ch;

    @BeforeMethod
    public void connect() {
        hub = new FakeHub();
        handler = new WsConnectionHandler(hub, LIMITS);
        ch = new EmbeddedChannel(handler);
        ch.pipeline().fireUserEventTriggered(
                new WebSocketServerProtocolHandler.HandshakeComplete("/ws?token=t", EmptyHttpHeaders.INSTANCE, null));
        ch.runPendingTasks();
    }

    @Test
    public void newClientGetsHelloThenSnapshotThenDeltas() {
        hub.broadcast("delta 1");
        ch.runPendingTasks();
        assertEquals(written(), List.of("hello", "snapshot 0", "delta 1"));
    }

    @Test
    public void stalledClientIsBoundedAndRecoversWithSnapshot() {
        assertEquals(written(), List.of("hello", "snapshot 0"));
        setWritable(false);
        String pad = "d".repeat(100);
        for (int i = 0; i < 100_000; i++) {
            hub.broadcast("delta " + i + pad);
            ChannelSink sink = handler.currentSink();
            assertTrue(sink.queuedMessages() <= LIMITS.maxMessages(), "queue messages " + sink.queuedMessages());
            assertTrue(sink.queuedChars() <= LIMITS.maxChars(), "queue chars " + sink.queuedChars());
        }
        ch.runPendingTasks();
        assertTrue(handler.currentSink().isStale());
        assertEquals(written(), List.of(), "nothing is written while the channel is unwritable");

        setWritable(true);
        hub.broadcast("delta after");
        assertEquals(written(), List.of("hello", "snapshot 1", "delta after"));
        assertEquals(hub.clientCount(), 1, "the dropped subscription is replaced, not added to");
        assertEquals(handler.resyncCount(), 1);
    }

    @Test
    public void unwritableAloneOnlyPausesTheQueue() {
        written();
        setWritable(false);
        hub.broadcast("delta 1");
        hub.broadcast("delta 2");
        assertEquals(written(), List.of());
        setWritable(true);
        assertEquals(written(), List.of("delta 1", "delta 2"));
        assertEquals(handler.resyncCount(), 0);
    }

    @Test
    public void overflowWhileWritableDropsQueueAndResnapshots() {
        written();
        // the event loop has not drained yet: the queue overflows on the game thread side
        for (int i = 0; i < 20; i++) {
            hub.broadcast("delta " + i);
        }
        assertEquals(written(), List.of("hello", "snapshot 1"));
        hub.broadcast("delta 20");
        assertEquals(written(), List.of("delta 20"));
    }

    @Test
    public void snapshotLargerThanQueueLimitIsStillDelivered() {
        hub = new FakeHub();
        hub.padSnapshots(5_000);
        handler = new WsConnectionHandler(hub, LIMITS);
        ch = new EmbeddedChannel(handler);
        ch.pipeline().fireUserEventTriggered(
                new WebSocketServerProtocolHandler.HandshakeComplete("/ws?token=t", EmptyHttpHeaders.INSTANCE, null));
        List<String> out = written();
        assertEquals(out.size(), 2);
        assertTrue(out.get(1).startsWith("snapshot 0"));
        assertEquals(handler.resyncCount(), 0);
    }

    @Test
    public void requestResyncSendsFreshSnapshot() {
        written();
        ch.writeInbound(new TextWebSocketFrame("{\"t\":\"requestResync\"}"));
        hub.broadcast("delta 1");
        assertEquals(written(), List.of("hello", "snapshot 1", "delta 1"));
        assertEquals(hub.clientCount(), 1);
    }

    @Test
    public void unknownOrMalformedClientMessagesAreIgnored() {
        written();
        ch.writeInbound(new TextWebSocketFrame("{\"t\":\"somethingElse\"}"));
        ch.writeInbound(new TextWebSocketFrame("not json"));
        ch.writeInbound(new TextWebSocketFrame("[1,2]"));
        assertEquals(written(), List.of());
        assertTrue(ch.isActive());
    }

    @Test
    public void closeUnsubscribes() {
        ChannelSink sink = handler.currentSink();
        ch.close();
        ch.runPendingTasks();
        assertEquals(hub.clientCount(), 0);
        sink.send("late delta");
        assertEquals(sink.queuedMessages(), 0);
        assertFalse(ch.isActive());
    }

    private void setWritable(boolean writable) {
        ch.unsafe().outboundBuffer().setUserDefinedWritability(1, writable);
        ch.runPendingTasks();
    }

    /** Runs pending event-loop tasks and returns the text frames written since the last call. */
    private List<String> written() {
        ch.runPendingTasks();
        List<String> out = new ArrayList<>();
        Object o;
        while ((o = ch.readOutbound()) != null) {
            TextWebSocketFrame f = (TextWebSocketFrame) o;
            out.add(f.text());
            f.release();
        }
        return out;
    }
}
