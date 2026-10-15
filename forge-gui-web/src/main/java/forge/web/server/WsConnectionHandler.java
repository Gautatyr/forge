package forge.web.server;

import com.google.gson.JsonElement;
import com.google.gson.JsonParseException;
import com.google.gson.JsonParser;

import io.netty.channel.Channel;
import io.netty.channel.ChannelHandlerContext;
import io.netty.channel.SimpleChannelInboundHandler;
import io.netty.handler.codec.http.websocketx.TextWebSocketFrame;
import io.netty.handler.codec.http.websocketx.WebSocketFrame;
import io.netty.handler.codec.http.websocketx.WebSocketServerProtocolHandler;

/**
 * One WebSocket client after the handshake. Holds its current {@link ChannelSink} subscription and
 * replaces it with a fresh one (greeting + snapshot from the mirror) when the queue overflowed and
 * the channel is writable again, or when the client sends {@code {"t":"requestResync"}}.
 * All methods run on the channel's event loop.
 */
final class WsConnectionHandler extends SimpleChannelInboundHandler<WebSocketFrame> {

    private final StreamHub hub;
    private final SendLimits limits;
    private ChannelSink current;
    private int resyncs;

    WsConnectionHandler(StreamHub hub, SendLimits limits) {
        this.hub = hub;
        this.limits = limits;
    }

    ChannelSink currentSink() {
        return current;
    }

    int resyncCount() {
        return resyncs;
    }

    @Override
    public void userEventTriggered(ChannelHandlerContext ctx, Object evt) throws Exception {
        if (evt instanceof WebSocketServerProtocolHandler.HandshakeComplete) {
            subscribe(ctx.channel());
            System.out.println("[web] client connected " + ctx.channel().remoteAddress() + " (" + hub.clientCount() + " total)");
        } else {
            super.userEventTriggered(ctx, evt);
        }
    }

    @Override
    protected void channelRead0(ChannelHandlerContext ctx, WebSocketFrame frame) {
        if (current != null && frame instanceof TextWebSocketFrame && "requestResync".equals(typeOf(((TextWebSocketFrame) frame).text()))) {
            resubscribe("client request");
        }
        // other client messages: none defined yet
    }

    @Override
    public void channelWritabilityChanged(ChannelHandlerContext ctx) throws Exception {
        if (current != null && ctx.channel().isWritable()) {
            if (current.isStale()) {
                resubscribe("queue overflow");
            } else {
                current.kick();
            }
        }
        super.channelWritabilityChanged(ctx);
    }

    @Override
    public void channelInactive(ChannelHandlerContext ctx) throws Exception {
        if (current != null) {
            hub.removeClient(current);
            current.close();
        }
        super.channelInactive(ctx);
    }

    private void subscribe(Channel ch) {
        ChannelSink sink = new ChannelSink(ch, limits, this::onOverflow);
        current = sink;
        sink.prime(() -> hub.addClient(sink));
    }

    private void onOverflow(ChannelSink sink) {
        // otherwise channelWritabilityChanged resubscribes once the client drains
        if (sink == current && sink.channel().isWritable()) {
            resubscribe("queue overflow");
        }
    }

    private void resubscribe(String why) {
        ChannelSink old = current;
        hub.removeClient(old);
        old.close();
        if (!old.channel().isActive()) {
            return;
        }
        resyncs++;
        System.out.println("[web] resync " + old.channel().remoteAddress() + " (" + why + ")");
        subscribe(old.channel());
    }

    private static String typeOf(String text) {
        try {
            JsonElement e = JsonParser.parseString(text);
            if (e.isJsonObject() && e.getAsJsonObject().has("t") && e.getAsJsonObject().get("t").isJsonPrimitive()) {
                return e.getAsJsonObject().get("t").getAsString();
            }
        } catch (JsonParseException | IllegalStateException ignored) {
            // not a message we understand
        }
        return null;
    }
}
