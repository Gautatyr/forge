package forge.web.server;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Set;
import java.util.function.Supplier;

import io.netty.buffer.Unpooled;
import io.netty.channel.ChannelFutureListener;
import io.netty.channel.ChannelHandlerContext;
import io.netty.channel.SimpleChannelInboundHandler;
import io.netty.handler.codec.http.DefaultFullHttpResponse;
import io.netty.handler.codec.http.FullHttpRequest;
import io.netty.handler.codec.http.FullHttpResponse;
import io.netty.handler.codec.http.HttpHeaderNames;
import io.netty.handler.codec.http.HttpResponseStatus;
import io.netty.handler.codec.http.HttpVersion;
import io.netty.handler.codec.http.QueryStringDecoder;

/**
 * First handler after HTTP aggregation: applies {@link AccessPolicy} to every request, including
 * the WebSocket upgrade, and answers 403 (connection closed) on failure. Frames after the upgrade
 * are not {@link FullHttpRequest}s and pass through.
 */
final class RequestGuard extends SimpleChannelInboundHandler<FullHttpRequest> {

    /** Endpoints that expose game state. */
    private static final Set<String> DATA_PATHS = Set.of("/state", "/metrics");

    private final String wsPath;
    private final Supplier<AccessPolicy> policy;

    RequestGuard(String wsPath, Supplier<AccessPolicy> policy) {
        super(false);
        this.wsPath = wsPath;
        this.policy = policy;
    }

    @Override
    protected void channelRead0(ChannelHandlerContext ctx, FullHttpRequest req) {
        String refusal = refusal(req);
        if (refusal == null) {
            ctx.fireChannelRead(req);
            return;
        }
        req.release();
        System.out.println("[web] refused " + ctx.channel().remoteAddress() + ": " + refusal);
        byte[] body = "forbidden".getBytes(StandardCharsets.UTF_8);
        FullHttpResponse res = new DefaultFullHttpResponse(HttpVersion.HTTP_1_1, HttpResponseStatus.FORBIDDEN, Unpooled.wrappedBuffer(body));
        res.headers().set(HttpHeaderNames.CONTENT_TYPE, "text/plain");
        res.headers().set(HttpHeaderNames.CONTENT_LENGTH, body.length);
        res.headers().set(HttpHeaderNames.CONNECTION, "close");
        ctx.writeAndFlush(res).addListener(ChannelFutureListener.CLOSE);
    }

    private String refusal(FullHttpRequest req) {
        AccessPolicy p = policy.get();
        if (p == null) {
            return "server starting";
        }
        if (!p.hostAllowed(req.headers().get(HttpHeaderNames.HOST))) {
            return "host " + req.headers().get(HttpHeaderNames.HOST);
        }
        QueryStringDecoder q = new QueryStringDecoder(req.uri());
        // raw prefix: a superset of what the WebSocket handshaker accepts as its path
        boolean ws = req.uri().startsWith(wsPath);
        if (ws && !p.originAllowed(req.headers().get(HttpHeaderNames.ORIGIN))) {
            return "origin " + req.headers().get(HttpHeaderNames.ORIGIN);
        }
        if ((ws || DATA_PATHS.contains(q.path())) && !p.tokenValid(single(q, "token"))) {
            return "token on " + q.path();
        }
        return null;
    }

    private static String single(QueryStringDecoder q, String name) {
        List<String> v = q.parameters().get(name);
        return v == null || v.size() != 1 ? null : v.get(0);
    }
}
