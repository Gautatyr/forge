package forge.fork.web.server;

import static org.testng.Assert.assertEquals;
import static org.testng.Assert.assertFalse;
import static org.testng.Assert.assertNotEquals;
import static org.testng.Assert.assertTrue;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.testng.annotations.AfterClass;
import org.testng.annotations.BeforeClass;
import org.testng.annotations.BeforeMethod;
import org.testng.annotations.Test;

/** Origin, token and Host checks on a real loopback server (ephemeral port, fake stream). */
public class WebServerSecurityTest {

    private static final String TOKEN = AccessPolicy.newToken();
    private static final String SEAT1 = AccessPolicy.newToken();

    private FakeHub hub;
    private WebServer server;
    private int port;
    private String self;

    @BeforeClass
    public void start() throws Exception {
        Path root = Files.createTempDirectory("forge-web-test");
        Files.writeString(root.resolve("index.html"), "<!doctype html><title>t</title>");
        hub = new FakeHub();
        Map<String, Integer> tokens = new LinkedHashMap<>();
        tokens.put(TOKEN, -1);
        tokens.put(SEAT1, 1);
        server = new WebServer(0, root, hub, tokens);
        server.start();
        port = server.port();
        self = "127.0.0.1:" + port;
    }

    @AfterClass(alwaysRun = true)
    public void stop() {
        server.stop();
    }

    @BeforeMethod
    public void reset() {
        hub.clients.clear();
        hub.adds.set(0);
        hub.seats.clear();
    }

    @Test
    public void bindsLoopbackOnlyAndPrintsTokenPage() {
        assertTrue(server.boundAddress().getAddress().isLoopbackAddress());
        assertEquals(server.pageUrl(), "http://127.0.0.1:" + port + "/#token=" + TOKEN);
    }

    @Test
    public void ownOriginWithTokenConnectsAndReceivesHello() throws Exception {
        Handshake h = handshake("/ws?token=" + TOKEN, self, "http://" + self);
        assertEquals(h.status, 101);
        assertEquals(h.firstText, "hello");
        assertEquals(hub.adds.get(), 1);
        Handshake local = handshake("/ws?token=" + TOKEN, "localhost:" + port, "http://localhost:" + port);
        assertEquals(local.status, 101);
    }

    @Test
    public void nonBrowserClientWithoutOriginNeedsOnlyTheToken() throws Exception {
        assertEquals(handshake("/ws?token=" + TOKEN, self, null).status, 101);
    }

    @Test
    public void foreignOriginIsRefusedEvenWithToken() throws Exception {
        for (String origin : new String[] {"http://evil.example", "http://127.0.0.1:" + (port + 1), "https://" + self,
                "null", "http://" + self + ".evil.example"}) {
            Handshake h = handshake("/ws?token=" + TOKEN, self, origin);
            assertEquals(h.status, 403, origin);
        }
        assertEquals(hub.adds.get(), 0);
    }

    @Test
    public void missingOrWrongTokenIsRefused() throws Exception {
        String origin = "http://" + self;
        assertEquals(handshake("/ws", self, origin).status, 403);
        assertEquals(handshake("/ws?token=", self, origin).status, 403);
        assertEquals(handshake("/ws?token=" + TOKEN.substring(1), self, origin).status, 403);
        assertEquals(handshake("/ws?token=" + AccessPolicy.newToken(), self, origin).status, 403);
        assertEquals(handshake("/ws?other=" + TOKEN, self, origin).status, 403);
        assertEquals(hub.adds.get(), 0);
    }

    @Test
    public void foreignHostIsRefused() throws Exception {
        // DNS rebinding: a hostile name resolved to 127.0.0.1 makes the page same-origin with itself, not with us
        assertEquals(handshake("/ws?token=" + TOKEN, "evil.example:" + port, "http://evil.example:" + port).status, 403);
        assertEquals(get("/", "evil.example:" + port), 403);
        assertEquals(get("/state?token=" + TOKEN, "evil.example:" + port), 403);
        assertEquals(hub.adds.get(), 0);
    }

    @Test
    public void gameDataEndpointsNeedTheToken() throws Exception {
        assertEquals(get("/state", self), 403);
        assertEquals(get("/metrics?token=wrong", self), 403);
        assertEquals(get("/state?token=" + TOKEN, self), 200);
        assertEquals(get("/metrics?token=" + TOKEN, self), 200);
    }

    @Test
    public void eachTokenOpensOnlyItsOwnSeat() throws Exception {
        String origin = "http://" + self;
        assertEquals(handshake("/ws?seat=0", self, origin).status, 403);
        assertEquals(get("/state?seat=0", self), 403);
        assertEquals(get("/state?seat=1&token=wrong", self), 403);
        assertEquals(handshake("/ws?token=" + SEAT1.substring(1), self, origin).status, 403);
        assertEquals(hub.seats, List.of(), "refused requests never reach the hub");
        // the spectator token cannot pick a seat
        assertEquals(handshake("/ws?token=" + TOKEN + "&seat=1", self, origin).status, 101);
        assertEquals(get("/state?token=" + TOKEN + "&seat=1", self), 200);
        // a seat token opens its seat, whatever seat parameter rides along
        assertEquals(handshake("/ws?token=" + SEAT1, self, origin).status, 101);
        assertEquals(handshake("/ws?seat=0&token=" + SEAT1, self, origin).status, 101);
        assertEquals(get("/state?token=" + SEAT1, self), 200);
        assertEquals(hub.seats, List.of(-1, -1, 1, 1, 1));
    }

    @Test
    public void seatTokenNeedsTheRightHostAndOrigin() throws Exception {
        assertEquals(handshake("/ws?token=" + SEAT1, "evil.example:" + port, "http://evil.example:" + port).status, 403);
        assertEquals(handshake("/ws?token=" + SEAT1, self, "http://evil.example").status, 403);
        assertEquals(get("/state?token=" + SEAT1, "evil.example:" + port), 403);
        assertEquals(hub.adds.get(), 0);
    }

    @Test
    public void viewerPageIsServedWithoutToken() throws Exception {
        assertEquals(get("/", self), 200);
        assertEquals(get("/missing.js", self), 404);
    }

    @Test
    public void tokensAreUrlSafeAndUnique() {
        String a = AccessPolicy.newToken();
        assertTrue(a.matches("[A-Za-z0-9_-]{43}"), a);
        assertNotEquals(a, AccessPolicy.newToken());
        AccessPolicy p = new AccessPolicy(a, 1);
        assertTrue(p.tokenValid(a));
        assertFalse(p.tokenValid(null));
        assertFalse(p.tokenValid(a + "x"));
        assertEquals(p.seatOf(a), Integer.valueOf(-1));
        String b = AccessPolicy.newToken();
        AccessPolicy seats = new AccessPolicy(Map.of(a, -1, b, 2), 1);
        assertEquals(seats.seatOf(b), Integer.valueOf(2));
        assertEquals(seats.seatOf(a), Integer.valueOf(-1));
        assertEquals(seats.seatOf(b + "x"), null);
    }

    private record Handshake(int status, String firstText) { }

    private Handshake handshake(String path, String host, String origin) throws IOException {
        try (Socket s = new Socket(InetAddress.getLoopbackAddress(), port)) {
            s.setSoTimeout(5000);
            OutputStream out = s.getOutputStream();
            out.write(RawHttp.upgradeRequest(path, host, origin));
            out.flush();
            InputStream in = s.getInputStream();
            int status = RawHttp.statusOf(RawHttp.readHead(in));
            return new Handshake(status, status == 101 ? RawHttp.readTextFrame(in) : null);
        }
    }

    private int get(String path, String host) throws IOException {
        String req = "GET " + path + " HTTP/1.1\r\nHost: " + host + "\r\nConnection: close\r\n\r\n";
        try (Socket s = new Socket(InetAddress.getLoopbackAddress(), port)) {
            s.setSoTimeout(5000);
            s.getOutputStream().write(req.getBytes(StandardCharsets.US_ASCII));
            s.getOutputStream().flush();
            return RawHttp.statusOf(RawHttp.readHead(s.getInputStream()));
        }
    }
}
