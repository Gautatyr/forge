package forge.fork.web.server;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;

import forge.fork.web.bridge.GameStream;

import io.netty.bootstrap.ServerBootstrap;
import io.netty.buffer.Unpooled;
import io.netty.channel.Channel;
import io.netty.channel.ChannelFutureListener;
import io.netty.channel.ChannelHandlerContext;
import io.netty.channel.ChannelInitializer;
import io.netty.channel.ChannelOption;
import io.netty.channel.EventLoopGroup;
import io.netty.channel.SimpleChannelInboundHandler;
import io.netty.channel.WriteBufferWaterMark;
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
import io.netty.handler.codec.http.websocketx.WebSocketServerProtocolConfig;
import io.netty.handler.codec.http.websocketx.WebSocketServerProtocolHandler;
import io.netty.handler.codec.http.websocketx.extensions.compression.WebSocketServerCompressionHandler;

/**
 * One port serves the viewer page (static files), {@code /state} and {@code /metrics} (JSON), card
 * images ({@code /img}, {@link ImageSource}) and the {@code /ws} WebSocket. Bound to loopback only.
 * Every request passes {@link RequestGuard} ({@link AccessPolicy}: Host, Origin, per-launch token);
 * each WebSocket client gets a bounded send queue and resyncs from a snapshot ({@link WsConnectionHandler}).
 */
public final class WebServer {

    private static final String WS_PATH = "/ws";
    static final String IMG_PATH = "/img";
    /** Netty marks a channel unwritable above this many pending outbound bytes; draining stops there. */
    private static final WriteBufferWaterMark WATER_MARK = new WriteBufferWaterMark(512 << 10, 1 << 20);

    private static final Map<String, String> TYPES = Map.of(
            "html", "text/html; charset=utf-8", "js", "text/javascript; charset=utf-8",
            "css", "text/css; charset=utf-8", "json", "application/json", "png", "image/png", "svg", "image/svg+xml",
            "woff2", "font/woff2", "woff", "font/woff", "jpg", "image/jpeg", "ico", "image/x-icon");

    private final int requestedPort;
    private final Path webRoot;
    private final StreamHub stream;
    private final Map<String, Integer> tokens;
    private final SendLimits limits;
    private final ImageSource images;
    private volatile AccessPolicy policy;
    private EventLoopGroup boss;
    private EventLoopGroup workers;
    private Channel serverChannel;

    /**
     * @param port  0 picks a free port
     * @param token per-launch secret ({@link AccessPolicy#newToken()}) of the spectator view, required on
     *              the WebSocket and data endpoints
     */
    public WebServer(int port, Path webRoot, StreamHub stream, String token) {
        this(port, webRoot, stream, Map.of(token, GameStream.SPECTATOR), SendLimits.DEFAULT, ImageSource.NONE);
    }

    /**
     * @param tokens per-launch secrets, each bound to the one view it opens: a seat, or
     *               {@link GameStream#SPECTATOR}; the first is printed as the page URL
     */
    public WebServer(int port, Path webRoot, StreamHub stream, Map<String, Integer> tokens) {
        this(port, webRoot, stream, tokens, SendLimits.DEFAULT, ImageSource.NONE);
    }

    /** @param images card images for {@code GET /img?key=<view image key>&token=...} (any valid token) */
    public WebServer(int port, Path webRoot, StreamHub stream, Map<String, Integer> tokens, ImageSource images) {
        this(port, webRoot, stream, tokens, SendLimits.DEFAULT, images);
    }

    /** One spectator token, with card images. */
    public WebServer(int port, Path webRoot, StreamHub stream, String token, ImageSource images) {
        this(port, webRoot, stream, Map.of(token, GameStream.SPECTATOR), SendLimits.DEFAULT, images);
    }

    WebServer(int port, Path webRoot, StreamHub stream, String token, SendLimits limits) {
        this(port, webRoot, stream, Map.of(token, GameStream.SPECTATOR), limits, ImageSource.NONE);
    }

    WebServer(int port, Path webRoot, StreamHub stream, Map<String, Integer> tokens, SendLimits limits) {
        this(port, webRoot, stream, tokens, limits, ImageSource.NONE);
    }

    WebServer(int port, Path webRoot, StreamHub stream, Map<String, Integer> tokens, SendLimits limits, ImageSource images) {
        this.requestedPort = port;
        this.webRoot = webRoot.toAbsolutePath().normalize();
        this.stream = stream;
        this.tokens = tokens;
        this.limits = limits;
        this.images = images;
    }

    public void start() throws InterruptedException {
        boss = new NioEventLoopGroup(1);
        workers = new NioEventLoopGroup(2);
        WebSocketServerProtocolConfig wsConfig = WebSocketServerProtocolConfig.newBuilder()
                .websocketPath(WS_PATH)
                .checkStartsWith(true) // the token rides in the query string
                .allowExtensions(true)
                .maxFramePayloadLength(1 << 20)
                .build();
        ServerBootstrap b = new ServerBootstrap()
                .group(boss, workers)
                .channel(NioServerSocketChannel.class)
                .childOption(ChannelOption.WRITE_BUFFER_WATER_MARK, WATER_MARK)
                .childHandler(new ChannelInitializer<SocketChannel>() {
                    @Override
                    protected void initChannel(SocketChannel ch) {
                        ch.pipeline()
                                .addLast(new HttpServerCodec())
                                .addLast(new HttpObjectAggregator(1 << 16))
                                .addLast(new RequestGuard(WS_PATH, () -> policy))
                                .addLast(new WebSocketServerCompressionHandler())
                                .addLast(new WebSocketServerProtocolHandler(wsConfig))
                                .addLast(new HttpHandler())
                                .addLast(new WsConnectionHandler(stream, limits, WebServer.this::seatOf));
                    }
                });
        serverChannel = b.bind("127.0.0.1", requestedPort).sync().channel();
        policy = new AccessPolicy(tokens, port());
        System.out.println("[web] serving " + pageUrl() + " (viewer root " + webRoot + ")");
    }

    /** The bound port (after {@link #start}). */
    public int port() {
        return boundAddress().getPort();
    }

    public InetSocketAddress boundAddress() {
        return (InetSocketAddress) serverChannel.localAddress();
    }

    /** The viewer URL including the first token; open this one. */
    public String pageUrl() {
        return policy.pageUrl();
    }

    /** The viewer URL for one token (a seat's page). */
    public String pageUrl(String token) {
        return policy.pageUrl(token);
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

    /**
     * The seat bound to the request's {@code token} (index in the game's player list), or
     * {@link GameStream#SPECTATOR}. A {@code seat} parameter is ignored: a token opens one view only.
     */
    int seatOf(String uri) {
        List<String> v = new QueryStringDecoder(uri).parameters().get("token");
        AccessPolicy p = policy;
        Integer seat = v == null || v.size() != 1 || p == null ? null : p.seatOf(v.get(0));
        return seat == null ? GameStream.SPECTATOR : seat;
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
            if (IMG_PATH.equals(path)) {
                Map<String, List<String>> q = new QueryStringDecoder(req.uri()).parameters();
                List<String> key = q.get("key");
                List<String> lang = q.get("lang");
                images.find(key == null || key.size() != 1 ? null : key.get(0),
                        lang == null || lang.size() != 1 ? null : lang.get(0)).whenComplete((img, err) -> {
                    if (img == null) {
                        send(ctx, HttpResponseStatus.NOT_FOUND, "text/plain", "no image".getBytes(StandardCharsets.UTF_8));
                    } else {
                        // the key names one printing's image (in one language), and the URL carries this launch's token
                        send(ctx, HttpResponseStatus.OK, img.contentType(), img.bytes(), "private, max-age=31536000, immutable");
                    }
                });
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
            send(ctx, status, type, body, "no-store");
        }

        private void send(ChannelHandlerContext ctx, HttpResponseStatus status, String type, byte[] body, String cacheControl) {
            FullHttpResponse res = new DefaultFullHttpResponse(HttpVersion.HTTP_1_1, status, Unpooled.wrappedBuffer(body));
            res.headers().set(HttpHeaderNames.CONTENT_TYPE, type);
            res.headers().set(HttpHeaderNames.CONTENT_LENGTH, body.length);
            res.headers().set(HttpHeaderNames.CACHE_CONTROL, cacheControl);
            ctx.writeAndFlush(res).addListener(ChannelFutureListener.CLOSE);
        }
    }
}
