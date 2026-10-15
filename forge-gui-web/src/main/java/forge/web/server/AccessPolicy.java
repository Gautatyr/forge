package forge.web.server;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

import forge.web.bridge.GameStream;

/**
 * Who may talk to the loopback server. Any page in the user's browser can reach 127.0.0.1, so:
 * <ul>
 * <li>{@code Host} must name the loopback server (blocks DNS rebinding);</li>
 * <li>a WebSocket upgrade must come from the server's own page ({@code Origin}) and carry a
 * per-launch token; a request without {@code Origin} is a non-browser client and needs the token only;</li>
 * <li>game data over HTTP ({@code /state}, {@code /metrics}) needs a token.</li>
 * </ul>
 * Each token is bound to one viewer: a seat (index in the game's player list) or
 * {@link GameStream#SPECTATOR}. The seat a client sees and acts for comes from its token only.
 */
public final class AccessPolicy {

    private static final SecureRandom RANDOM = new SecureRandom();

    private final Map<String, Integer> seatsByToken;
    private final byte[][] tokens;
    private final int[] seats;
    private final int port;
    private final Set<String> hosts;
    private final Set<String> origins;

    /** One spectator token. */
    public AccessPolicy(String token, int port) {
        this(Map.of(token, GameStream.SPECTATOR), port);
    }

    /** @param seatsByToken token to seat ({@link GameStream#SPECTATOR} for the spectator view) */
    public AccessPolicy(Map<String, Integer> seatsByToken, int port) {
        this.seatsByToken = new LinkedHashMap<>(seatsByToken);
        this.tokens = new byte[seatsByToken.size()][];
        this.seats = new int[seatsByToken.size()];
        int i = 0;
        for (Map.Entry<String, Integer> e : this.seatsByToken.entrySet()) {
            tokens[i] = e.getKey().getBytes(StandardCharsets.UTF_8);
            seats[i] = e.getValue();
            i++;
        }
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
        return seatOf(candidate) != null;
    }

    /** The seat bound to this token, {@link GameStream#SPECTATOR} for the spectator token, null if no token matches. */
    public Integer seatOf(String candidate) {
        if (candidate == null) {
            return null;
        }
        byte[] c = candidate.getBytes(StandardCharsets.UTF_8);
        Integer found = null;
        for (int i = 0; i < tokens.length; i++) {
            // compare against every token, constant time each: no early exit on a match
            if (MessageDigest.isEqual(tokens[i], c)) {
                found = seats[i];
            }
        }
        return found;
    }

    /** The page for the first (spectator) token. */
    public String pageUrl() {
        return pageUrl(seatsByToken.keySet().iterator().next());
    }

    /** The page to open: the token rides in the fragment, which the browser never sends to a server. */
    public String pageUrl(String token) {
        return "http://127.0.0.1:" + port + "/#token=" + token;
    }
}
