package forge.web.server;

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

import org.testng.annotations.AfterClass;
import org.testng.annotations.BeforeClass;
import org.testng.annotations.BeforeMethod;
import org.testng.annotations.Test;

/** Origin, token and Host checks on a real loopback server (ephemeral port, fake stream). */
public class WebServerSecurityTest {

    private static final String TOKEN = AccessPolicy.newToken();

    private FakeHub hub;
    private WebServer server;
    private int port;
    private String self;

    @BeforeClass
    public void start() throws Exception {
        Path root = Files.createTempDirectory("forge-web-test");
        Files.writeString(root.resolve("index.html"), "<!doctype html><title>t</title>");
        hub = new FakeHub();
        server = new WebServer(0, root, hub, TOKEN);
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
