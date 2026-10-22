package forge.fork.web.server;

import java.util.function.ToIntFunction;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParseException;
import com.google.gson.JsonParser;

import forge.fork.web.bridge.GameStream;

import io.netty.channel.Channel;
import io.netty.channel.ChannelHandlerContext;
import io.netty.channel.SimpleChannelInboundHandler;
import io.netty.handler.codec.http.websocketx.TextWebSocketFrame;
import io.netty.handler.codec.http.websocketx.WebSocketFrame;
import io.netty.handler.codec.http.websocketx.WebSocketServerProtocolHandler;

/**
 * One WebSocket client after the handshake. Holds its current {@link ChannelSink} subscription and
 * replaces it with a fresh one (greeting + snapshot from the mirror) when the queue overflowed and
 * the channel is writable again, or when the client sends {@code {"t":"requestResync"}}; {@code {"t":"setLanguage"}} sets its seat's card-text language. Any other
 * JSON object from a seat's client (a prompt reply, a player action) goes to
 * {@link StreamHub#clientMessage}; a spectator's are dropped. All methods run on the channel's event loop.
 */
final class WsConnectionHandler extends SimpleChannelInboundHandler<WebSocketFrame> {

    private final StreamHub hub;
    private final SendLimits limits;
    private final ToIntFunction<String> seatOfUri;
    private ChannelSink current;
    private int resyncs;
    /** Bound to the handshake's token; every resync keeps it. */
    private int seat = GameStream.SPECTATOR;

    /** @param seatOfUri the seat the handshake URI's token opens ({@link GameStream#SPECTATOR} for none) */
    WsConnectionHandler(StreamHub hub, SendLimits limits, ToIntFunction<String> seatOfUri) {
        this.hub = hub;
        this.limits = limits;
        this.seatOfUri = seatOfUri;
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
            seat = seatOfUri.applyAsInt(((WebSocketServerProtocolHandler.HandshakeComplete) evt).requestUri());
            subscribe(ctx.channel());
            System.out.println("[web] client connected " + ctx.channel().remoteAddress() + " (" + hub.clientCount() + " total)");
        } else {
            super.userEventTriggered(ctx, evt);
        }
    }

    @Override
    protected void channelRead0(ChannelHandlerContext ctx, WebSocketFrame frame) {
        if (current == null || !(frame instanceof TextWebSocketFrame)) {
            return;
        }
        JsonObject msg = parse(((TextWebSocketFrame) frame).text());
        if (msg == null) {
            return;
        }
        if ("requestResync".equals(typeOf(msg))) {
            resubscribe("client request");
        } else if ("setLanguage".equals(typeOf(msg))) {
            JsonElement lang = msg.get("lang");
            if (seat != GameStream.SPECTATOR) {
                hub.setLanguage(seat, lang != null && lang.isJsonPrimitive() ? lang.getAsString() : "en");
            }
        } else if (seat != GameStream.SPECTATOR) {
            hub.clientMessage(seat, msg, current);
        }
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
        sink.prime(() -> hub.addClient(sink, seat));
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

    private static JsonObject parse(String text) {
        try {
            JsonElement e = JsonParser.parseString(text);
            return e.isJsonObject() ? e.getAsJsonObject() : null;
        } catch (JsonParseException | IllegalStateException ignored) {
            return null; // not a message we understand
        }
    }

    private static String typeOf(JsonObject o) {
        JsonElement t = o.get("t");
        return t != null && t.isJsonPrimitive() ? t.getAsString() : null;
    }
}
