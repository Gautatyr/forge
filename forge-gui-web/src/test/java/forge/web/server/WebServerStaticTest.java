package forge.web.server;

import static org.testng.Assert.assertEquals;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;

import org.testng.annotations.AfterClass;
import org.testng.annotations.BeforeClass;
import org.testng.annotations.Test;

/** The built frontend (Vite's dist: index.html, hashed js/css, woff2 fonts) served from the web root. */
public class WebServerStaticTest {

    private WebServer server;
    private final HttpClient http = HttpClient.newHttpClient();

    @BeforeClass
    public void start() throws Exception {
        Path root = Files.createTempDirectory("forge-web-dist");
        Files.createDirectories(root.resolve("assets"));
        Files.writeString(root.resolve("index.html"), "<!doctype html><title>dist</title>");
        Files.writeString(root.resolve("assets/index-abc.js"), "export {}");
        Files.writeString(root.resolve("assets/index-abc.css"), "body{}");
        Files.write(root.resolve("assets/font-abc.woff2"), new byte[] {'w', 'O', 'F', '2'});
        server = new WebServer(0, root, new FakeHub(), Map.of(AccessPolicy.newToken(), -1));
        server.start();
    }

    @AfterClass(alwaysRun = true)
    public void stop() {
        server.stop();
    }

    private HttpResponse<String> get(String path) throws Exception {
        return http.send(HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + server.port() + path)).build(),
                HttpResponse.BodyHandlers.ofString());
    }

    @Test
    public void pageAndAssetsGetTheirTypes() throws Exception {
        HttpResponse<String> page = get("/");
        assertEquals(page.statusCode(), 200);
        assertEquals(page.body(), "<!doctype html><title>dist</title>");
        assertEquals(page.headers().firstValue("content-type").orElse(""), "text/html; charset=utf-8");
        assertEquals(get("/assets/index-abc.js").headers().firstValue("content-type").orElse(""), "text/javascript; charset=utf-8");
        assertEquals(get("/assets/index-abc.css").headers().firstValue("content-type").orElse(""), "text/css; charset=utf-8");
        HttpResponse<String> font = get("/assets/font-abc.woff2");
        assertEquals(font.statusCode(), 200);
        assertEquals(font.headers().firstValue("content-type").orElse(""), "font/woff2");
    }

    @Test
    public void pathsOutsideTheRootAreNotServed() throws Exception {
        assertEquals(get("/../../etc/passwd").statusCode(), 404);
        assertEquals(get("/assets/missing.js").statusCode(), 404);
    }
}
