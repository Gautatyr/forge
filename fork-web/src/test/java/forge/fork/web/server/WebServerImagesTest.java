package forge.fork.web.server;

import static org.testng.Assert.assertEquals;
import static org.testng.Assert.assertTrue;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.InetAddress;
import java.net.Socket;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CopyOnWriteArrayList;

import org.testng.annotations.AfterClass;
import org.testng.annotations.BeforeClass;
import org.testng.annotations.BeforeMethod;
import org.testng.annotations.Test;

/** {@code GET /img}: token-protected, key decoded from the query, cacheable hits, uncached misses. */
public class WebServerImagesTest {

    private static final String TOKEN = AccessPolicy.newToken();
    private static final byte[] JPEG = {(byte) 0xff, (byte) 0xd8, (byte) 0xff, 1, 2, 3};
    private static final String KEY = "c:Fire // Ice|MH2|1$alt";

    private final List<String> asked = new CopyOnWriteArrayList<>();
    private final List<String> langs = new CopyOnWriteArrayList<>();
    private volatile CompletableFuture<ImageSource.Image> next;
    private WebServer server;
    private String self;

    @BeforeClass
    public void start() throws Exception {
        ImageSource images = new ImageSource() {
            @Override
            public CompletableFuture<Image> find(String key) {
                asked.add(key);
                return next;
            }

            @Override
            public CompletableFuture<Image> find(String key, String lang) {
                langs.add(lang);
                return find(key);
            }
        };
        server = new WebServer(0, Files.createTempDirectory("forge-web-test"), new FakeHub(), TOKEN, images);
        server.start();
        self = "127.0.0.1:" + server.port();
    }

    @AfterClass(alwaysRun = true)
    public void stop() {
        server.stop();
    }

    @BeforeMethod
    public void reset() {
        asked.clear();
        langs.clear();
        next = CompletableFuture.completedFuture(new ImageSource.Image(JPEG, "image/jpeg"));
    }

    private static String img(String key, String token) {
        return "/img?key=" + URLEncoder.encode(key, StandardCharsets.UTF_8) + (token == null ? "" : "&token=" + token);
    }

    @Test
    public void imagesNeedTheToken() throws Exception {
        assertEquals(get(img(KEY, null)).status, 403);
        assertEquals(get(img(KEY, "wrong")).status, 403);
        assertEquals(asked, List.of(), "refused requests never reach the image source");
    }

    @Test
    public void langIsPassedOnAndTheTokenStillRequired() throws Exception {
        assertEquals(get(img(KEY, null) + "&lang=fr").status, 403);
        assertEquals(get(img(KEY, "wrong") + "&lang=fr").status, 403);
        assertEquals(asked, List.of(), "refused requests never reach the image source");
        assertEquals(get(img(KEY, TOKEN) + "&lang=fr").status, 200);
        assertEquals(get(img(KEY, TOKEN)).status, 200);
        assertEquals(get(img(KEY, TOKEN) + "&lang=fr&lang=en").status, 200);
        assertEquals(langs, java.util.Arrays.asList("fr", null, null));
    }

    @Test
    public void hitIsServedWithLongCachingAndTheDecodedKey() throws Exception {
        Response r = get(img(KEY, TOKEN));
        assertEquals(r.status, 200);
        assertEquals(r.header("content-type"), "image/jpeg");
        assertTrue(r.header("cache-control").contains("max-age=31536000"), r.header("cache-control"));
        assertEquals(r.body, JPEG);
        assertEquals(asked, List.of(KEY));
    }

    @Test
    public void missIs404AndNotCached() throws Exception {
        next = CompletableFuture.completedFuture(null);
        Response r = get(img("t:hidden", TOKEN));
        assertEquals(r.status, 404);
        assertEquals(r.header("cache-control"), "no-store");
        next = CompletableFuture.failedFuture(new IllegalStateException("boom"));
        assertEquals(get(img("t:hidden", TOKEN)).status, 404);
    }

    @Test
    public void slowImageDoesNotHoldOtherRequests() throws Exception {
        CompletableFuture<ImageSource.Image> slow = new CompletableFuture<>();
        next = slow;
        try (Socket pending = open(img("c:Slow|M19|1", TOKEN))) {
            next = CompletableFuture.completedFuture(new ImageSource.Image(JPEG, "image/jpeg"));
            assertEquals(get(img(KEY, TOKEN)).status, 200);
            assertEquals(get("/state?token=" + TOKEN).status, 200);
            slow.complete(new ImageSource.Image(JPEG, "image/jpeg"));
            assertEquals(read(pending).status, 200);
        }
    }

    @Test
    public void missingOrRepeatedKeyAsksForNull() throws Exception {
        next = CompletableFuture.completedFuture(null);
        assertEquals(get("/img?token=" + TOKEN).status, 404);
        assertEquals(get("/img?key=a&key=b&token=" + TOKEN).status, 404);
        assertEquals(asked, java.util.Arrays.asList(null, null));
    }

    private record Response(int status, String head, byte[] body) {
        String header(String name) {
            for (String line : head.split("\r\n")) {
                int c = line.indexOf(':');
                if (c > 0 && line.substring(0, c).trim().toLowerCase(Locale.ROOT).equals(name)) {
                    return line.substring(c + 1).trim();
                }
            }
            return null;
        }
    }

    private Socket open(String path) throws IOException {
        Socket s = new Socket(InetAddress.getLoopbackAddress(), server.port());
        s.setSoTimeout(5000);
        String req = "GET " + path + " HTTP/1.1\r\nHost: " + self + "\r\nConnection: close\r\n\r\n";
        s.getOutputStream().write(req.getBytes(StandardCharsets.US_ASCII));
        s.getOutputStream().flush();
        return s;
    }

    private static Response read(Socket s) throws IOException {
        InputStream in = s.getInputStream();
        String head = RawHttp.readHead(in);
        ByteArrayOutputStream body = new ByteArrayOutputStream();
        in.transferTo(body);
        return new Response(RawHttp.statusOf(head), head, body.toByteArray());
    }

    private Response get(String path) throws IOException {
        try (Socket s = open(path)) {
            return read(s);
        }
    }
}
