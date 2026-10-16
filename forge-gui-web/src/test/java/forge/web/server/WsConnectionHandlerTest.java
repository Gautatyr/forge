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
        handler = new WsConnectionHandler(hub, LIMITS, WsConnectionHandlerTest::seatOfToken);
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
            assertTrue(sink.backlogMessages() <= LIMITS.maxMessages(), "backlog messages " + sink.backlogMessages());
            assertTrue(sink.backlogChars() <= LIMITS.maxChars(), "backlog chars " + sink.backlogChars());
            assertTrue(sink.queuedMessages() <= LIMITS.maxMessages() + 2, "queue messages " + sink.queuedMessages());
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
        handler = new WsConnectionHandler(hub, LIMITS, WsConnectionHandlerTest::seatOfToken);
        ch = new EmbeddedChannel(handler);
        ch.pipeline().fireUserEventTriggered(
                new WebSocketServerProtocolHandler.HandshakeComplete("/ws?token=t", EmptyHttpHeaders.INSTANCE, null));
        List<String> out = written();
        assertEquals(out.size(), 2);
        assertTrue(out.get(1).startsWith("snapshot 0"));
        assertEquals(handler.resyncCount(), 0);
    }

    @Test
    public void deltasQueuedBehindOversizedSnapshotBeforeFirstDrainAreDelivered() {
        hub = new FakeHub();
        hub.padSnapshots(5_000);
        handler = new WsConnectionHandler(hub, LIMITS, WsConnectionHandlerTest::seatOfToken);
        ch = new EmbeddedChannel(handler);
        ch.pipeline().fireUserEventTriggered(
                new WebSocketServerProtocolHandler.HandshakeComplete("/ws?token=t", EmptyHttpHeaders.INSTANCE, null));
        // the game thread publishes before the event loop's first drain: the greeting is not backlog
        List<String> deltas = new ArrayList<>();
        for (int i = 0; i < LIMITS.maxMessages(); i++) {
            hub.broadcast("delta " + i);
            deltas.add("delta " + i);
        }
        assertEquals(handler.currentSink().backlogMessages(), LIMITS.maxMessages());
        List<String> out = written();
        assertEquals(out.size(), 2 + deltas.size(), String.valueOf(out));
        assertEquals(out.get(0), "hello");
        assertTrue(out.get(1).startsWith("snapshot 0"));
        assertEquals(out.subList(2, out.size()), deltas);
        assertEquals(handler.resyncCount(), 0);
        assertEquals(hub.adds.get(), 1);
    }

    @Test
    public void publishFromAnotherThreadWhileSubscribingIsBounded() {
        hub = new FakeHub();
        // GameStream releases its lock before prime() returns: a game-thread publish can land in that window
        hub.afterNextAdd(() -> {
            Thread game = new Thread(() -> {
                for (int i = 0; i < 20; i++) {
                    hub.broadcast("delta " + i);
                }
            });
            game.start();
            try {
                game.join();
            } catch (InterruptedException e) {
                throw new IllegalStateException(e);
            }
        });
        handler = new WsConnectionHandler(hub, LIMITS, WsConnectionHandlerTest::seatOfToken);
        ch = new EmbeddedChannel(handler);
        ch.pipeline().fireUserEventTriggered(
                new WebSocketServerProtocolHandler.HandshakeComplete("/ws?token=t", EmptyHttpHeaders.INSTANCE, null));
        assertTrue(handler.currentSink().isStale(), "the game thread's deltas count against the limit");
        assertEquals(written(), List.of("hello", "snapshot 1"));
        assertEquals(handler.resyncCount(), 1);
        assertEquals(hub.clientCount(), 1);
    }

    /** Test tokens: "t1" opens seat 1, anything else the spectator view. */
    private static int seatOfToken(String uri) {
        return uri.contains("token=t1") ? 1 : -1;
    }

    private void connectSeatOne() {
        hub = new FakeHub();
        handler = new WsConnectionHandler(hub, LIMITS, WsConnectionHandlerTest::seatOfToken);
        ch = new EmbeddedChannel(handler);
        // the seat comes from the token; a seat parameter is ignored
        ch.pipeline().fireUserEventTriggered(
                new WebSocketServerProtocolHandler.HandshakeComplete("/ws?token=t1&seat=3", EmptyHttpHeaders.INSTANCE, null));
        written();
    }

    @Test
    public void seatFromTokenIsKeptAcrossResyncs() {
        assertEquals(hub.seats, List.of(-1), "spectator token: spectator");
        connectSeatOne();
        ch.writeInbound(new TextWebSocketFrame("{\"t\":\"requestResync\"}"));
        written();
        assertEquals(hub.seats, List.of(1, 1));
        assertEquals(handler.resyncCount(), 1);
    }

    @Test
    public void seatMessagesReachTheHubWithTheTokensSeat() {
        connectSeatOne();
        ch.writeInbound(new TextWebSocketFrame("{\"t\":\"reply\",\"id\":3,\"value\":[0],\"seat\":2}"));
        ch.writeInbound(new TextWebSocketFrame("not json"));
        ch.writeInbound(new TextWebSocketFrame("[1,2]"));
        assertEquals(hub.messages, List.of("1:{\"t\":\"reply\",\"id\":3,\"value\":[0],\"seat\":2}"));
    }

    @Test
    public void spectatorMessagesAreDropped() {
        ch.writeInbound(new TextWebSocketFrame("{\"t\":\"action\",\"method\":\"concede\"}"));
        assertEquals(hub.messages, List.of());
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
