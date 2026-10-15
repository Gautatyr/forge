package forge.web.server;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.Locale;
import java.util.Set;

/**
 * Who may talk to the loopback server. Any page in the user's browser can reach 127.0.0.1, so:
 * <ul>
 * <li>{@code Host} must name the loopback server (blocks DNS rebinding);</li>
 * <li>a WebSocket upgrade must come from the server's own page ({@code Origin}) and carry the
 * per-launch token; a request without {@code Origin} is a non-browser client and needs the token only;</li>
 * <li>game data over HTTP ({@code /state}, {@code /metrics}) needs the token.</li>
 * </ul>
 */
public final class AccessPolicy {

    private static final SecureRandom RANDOM = new SecureRandom();

    private final byte[] token;
    private final String tokenText;
    private final int port;
    private final Set<String> hosts;
    private final Set<String> origins;

    public AccessPolicy(String token, int port) {
        this.tokenText = token;
        this.token = token.getBytes(StandardCharsets.UTF_8);
        this.port = port;
        this.hosts = Set.of("127.0.0.1:" + port, "localhost:" + port);
        this.origins = Set.of("http://127.0.0.1:" + port, "http://localhost:" + port);
    }

    /** 256 random bits, URL-safe base64 without padding (43 chars). */
    public static String newToken() {
        byte[] b = new byte[32];
        RANDOM.nextBytes(b);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(b);
    }

    public boolean hostAllowed(String host) {
        return host != null && hosts.contains(host.toLowerCase(Locale.ROOT));
    }

    public boolean originAllowed(String origin) {
        return origin == null || origins.contains(origin.toLowerCase(Locale.ROOT));
    }

    public boolean tokenValid(String candidate) {
        return candidate != null && MessageDigest.isEqual(token, candidate.getBytes(StandardCharsets.UTF_8));
    }

    /** The page to open: the token rides in the fragment, which the browser never sends to a server. */
    public String pageUrl() {
        return "http://127.0.0.1:" + port + "/#token=" + tokenText;
    }
}
