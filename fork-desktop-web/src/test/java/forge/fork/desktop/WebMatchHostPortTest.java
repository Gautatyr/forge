package forge.fork.desktop;

import static org.testng.Assert.assertEquals;
import static org.testng.Assert.assertFalse;
import static org.testng.Assert.assertNotEquals;
import static org.testng.Assert.assertTrue;
import static org.testng.Assert.expectThrows;

import java.io.IOException;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.nio.file.Path;

import org.testng.annotations.Test;

import forge.fork.web.seat.WebSeats;

/**
 * The launcher's fixed port (issue #153): a new launch keeps the browser origin, so the page's saved settings
 * survive; a taken port falls back to a free one; an explicit port is never second-guessed.
 */
public class WebMatchHostPortTest {

    private static final Path NO_ROOT = Path.of("none");

    private static WebMatchHost host(int port, boolean fallback) {
        return new WebMatchHost(new WebMatchHost.Options(port, NO_ROOT, WebSeats.Timeouts.DEFAULT, () -> null, fallback), url -> { });
    }

    private static int freePort() throws IOException {
        try (ServerSocket s = new ServerSocket(0, 1, InetAddress.getLoopbackAddress())) {
            return s.getLocalPort();
        }
    }

    @Test
    public void launcherOptionsDefaultToTheFixedPortWithFallbackAndHonourAnExplicitOne() {
        WebMatchHost.Options def = WebMatchHost.Options.launcher(null, NO_ROOT, WebSeats.Timeouts.DEFAULT);
        assertEquals(def.port(), WebMatchHost.DEFAULT_PORT);
        assertTrue(def.fallbackToFreePort());
        WebMatchHost.Options explicit = WebMatchHost.Options.launcher("5123", NO_ROOT, WebSeats.Timeouts.DEFAULT);
        assertEquals(explicit.port(), 5123);
        assertFalse(explicit.fallbackToFreePort());
        WebMatchHost.Options any = WebMatchHost.Options.launcher("0", NO_ROOT, WebSeats.Timeouts.DEFAULT);
        assertEquals(any.port(), 0);
        assertFalse(any.fallbackToFreePort());
    }

    @Test
    public void twoLaunchesOnTheSameFixedPortShareTheOriginButNotTheSeatToken() throws IOException {
        int port = freePort();
        WebMatchHost first = host(port, true);
        first.start();
        int firstPort = first.port();
        String firstUrl = first.seatUrl(0);
        first.stop();
        WebMatchHost second = host(port, true);
        second.start();
        try {
            assertEquals(firstPort, port);
            assertEquals(second.port(), port, "the second launch keeps the origin");
            assertTrue(second.seatUrl(0).startsWith("http://127.0.0.1:" + port + "/"));
            assertNotEquals(second.seatUrl(0), firstUrl, "the seat token is per launch");
        } finally {
            second.stop();
        }
    }

    @Test
    public void aTakenPortFallsBackToAFreePortWhenAllowed() throws IOException {
        try (ServerSocket taken = new ServerSocket(0, 1, InetAddress.getLoopbackAddress())) {
            WebMatchHost h = host(taken.getLocalPort(), true);
            h.start();
            try {
                assertNotEquals(h.port(), taken.getLocalPort());
                assertTrue(h.port() > 0);
            } finally {
                h.stop();
            }
        }
    }

    @Test
    public void aTakenExplicitPortFails() throws IOException {
        try (ServerSocket taken = new ServerSocket(0, 1, InetAddress.getLoopbackAddress())) {
            WebMatchHost h = host(taken.getLocalPort(), false);
            expectThrows(RuntimeException.class, h::start);
        }
    }
}
