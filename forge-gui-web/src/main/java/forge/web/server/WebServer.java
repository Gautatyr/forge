package forge.web.server;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;

import forge.web.bridge.ClientSink;
import forge.web.bridge.GameStream;
import io.netty.bootstrap.ServerBootstrap;
import io.netty.buffer.Unpooled;
import io.netty.channel.Channel;
import io.netty.channel.ChannelFutureListener;
import io.netty.channel.ChannelHandlerContext;
import io.netty.channel.ChannelInitializer;
import io.netty.channel.EventLoopGroup;
import io.netty.channel.SimpleChannelInboundHandler;
import io.netty.channel.nio.NioEventLoopGroup;
import io.netty.channel.socket.SocketChannel;
import io.netty.channel.socket.nio.NioServerSocketChannel;
import io.netty.handler.codec.http.DefaultFullHttpResponse;
import io.netty.handler.codec.http.FullHttpRequest;
import io.netty.handler.codec.http.FullHttpResponse;
import io.netty.handler.codec.http.HttpHeaderNames;
import io.netty.handler.codec.http.HttpMethod;
import io.netty.handler.codec.http.HttpObjectAggregator;
import io.netty.handler.codec.http.HttpResponseStatus;
import io.netty.handler.codec.http.HttpServerCodec;
import io.netty.handler.codec.http.HttpVersion;
import io.netty.handler.codec.http.QueryStringDecoder;
import io.netty.handler.codec.http.websocketx.TextWebSocketFrame;
import io.netty.handler.codec.http.websocketx.WebSocketFrame;
import io.netty.handler.codec.http.websocketx.WebSocketServerProtocolHandler;
import io.netty.handler.codec.http.websocketx.extensions.compression.WebSocketServerCompressionHandler;

/**
 * One port serves the viewer page (static files), {@code /state} and {@code /metrics} (JSON) and
 * the {@code /ws} WebSocket. Bound to loopback only: the stream is not authenticated.
 */
public final class WebServer {

    private static final Map<String, String> TYPES = Map.of(
            "html", "text/html; charset=utf-8", "js", "text/javascript; charset=utf-8",
            "css", "text/css; charset=utf-8", "json", "application/json", "png", "image/png", "svg", "image/svg+xml");

    private final int port;
    private final Path webRoot;
    private final GameStream stream;
    private EventLoopGroup boss;
    private EventLoopGroup workers;
    private Channel serverChannel;

    public WebServer(int port, Path webRoot, GameStream stream) {
        this.port = port;
        this.webRoot = webRoot.toAbsolutePath().normalize();
        this.stream = stream;
    }

    public void start() throws InterruptedException {
        boss = new NioEventLoopGroup(1);
        workers = new NioEventLoopGroup(2);
        ServerBootstrap b = new ServerBootstrap()
                .group(boss, workers)
                .channel(NioServerSocketChannel.class)
                .childHandler(new ChannelInitializer<SocketChannel>() {
                    @Override
                    protected void initChannel(SocketChannel ch) {
                        ch.pipeline()
                                .addLast(new HttpServerCodec())
                                .addLast(new HttpObjectAggregator(1 << 16))
                                .addLast(new WebSocketServerCompressionHandler())
                                .addLast(new WebSocketServerProtocolHandler("/ws", null, true, 1 << 20, false, true))
                                .addLast(new HttpHandler())
                                .addLast(new WsHandler());
                    }
                });
        serverChannel = b.bind("127.0.0.1", port).sync().channel();
        System.out.println("[web] serving http://127.0.0.1:" + port + "/ (viewer root " + webRoot + ")");
    }

    public void stop() {
        if (serverChannel != null) {
            serverChannel.close().syncUninterruptibly();
        }
        if (boss != null) {
            boss.shutdownGracefully();
            workers.shutdownGracefully();
        }
    }

    /** {@code ?seat=N} picks a player's stream (index in the game's player list); anything else is a spectator. */
    static int seatOf(String uri) {
        java.util.List<String> v = new QueryStringDecoder(uri).parameters().get("seat");
        if (v == null || v.isEmpty()) {
            return GameStream.SPECTATOR;
        }
        try {
            return Math.max(GameStream.SPECTATOR, Integer.parseInt(v.get(0)));
        } catch (NumberFormatException e) {
            return GameStream.SPECTATOR;
        }
    }

    private final class HttpHandler extends SimpleChannelInboundHandler<FullHttpRequest> {
        @Override
        protected void channelRead0(ChannelHandlerContext ctx, FullHttpRequest req) throws IOException {
            if (req.method() != HttpMethod.GET) {
                send(ctx, HttpResponseStatus.METHOD_NOT_ALLOWED, "text/plain", "GET only".getBytes(StandardCharsets.UTF_8));
                return;
            }
            String path = new QueryStringDecoder(req.uri()).path();
            if ("/state".equals(path)) {
                send(ctx, HttpResponseStatus.OK, TYPES.get("json"), stream.snapshot(seatOf(req.uri())).getBytes(StandardCharsets.UTF_8));
                return;
            }
            if ("/metrics".equals(path)) {
                send(ctx, HttpResponseStatus.OK, TYPES.get("json"), stream.metricsJson().getBytes(StandardCharsets.UTF_8));
                return;
            }
            if (path.endsWith("/")) {
                path += "index.html";
            }
            Path file = webRoot.resolve(path.substring(1)).normalize();
            if (!file.startsWith(webRoot) || !Files.isRegularFile(file)) {
                send(ctx, HttpResponseStatus.NOT_FOUND, "text/plain", "not found".getBytes(StandardCharsets.UTF_8));
                return;
            }
            String name = file.getFileName().toString();
            String ext = name.substring(name.lastIndexOf('.') + 1);
            send(ctx, HttpResponseStatus.OK, TYPES.getOrDefault(ext, "application/octet-stream"), Files.readAllBytes(file));
        }

        private void send(ChannelHandlerContext ctx, HttpResponseStatus status, String type, byte[] body) {
            FullHttpResponse res = new DefaultFullHttpResponse(HttpVersion.HTTP_1_1, status, Unpooled.wrappedBuffer(body));
            res.headers().set(HttpHeaderNames.CONTENT_TYPE, type);
            res.headers().set(HttpHeaderNames.CONTENT_LENGTH, body.length);
            res.headers().set(HttpHeaderNames.CACHE_CONTROL, "no-store");
            ctx.writeAndFlush(res).addListener(ChannelFutureListener.CLOSE);
        }
    }

    private final class WsHandler extends SimpleChannelInboundHandler<WebSocketFrame> {
        private ClientSink sink;

        @Override
        public void userEventTriggered(ChannelHandlerContext ctx, Object evt) throws Exception {
            if (evt instanceof WebSocketServerProtocolHandler.HandshakeComplete) {
                Channel ch = ctx.channel();
                sink = json -> ch.writeAndFlush(new TextWebSocketFrame(json));
                stream.addClient(sink, seatOf(((WebSocketServerProtocolHandler.HandshakeComplete) evt).requestUri()));
                System.out.println("[web] client connected " + ch.remoteAddress() + " (" + stream.clientCount() + " total)");
            } else {
                super.userEventTriggered(ctx, evt);
            }
        }

        @Override
        protected void channelRead0(ChannelHandlerContext ctx, WebSocketFrame frame) {
            // read-only viewer: client messages are ignored
        }

        @Override
        public void channelInactive(ChannelHandlerContext ctx) throws Exception {
            if (sink != null) {
                stream.removeClient(sink);
            }
            super.channelInactive(ctx);
        }
    }
}
