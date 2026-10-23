package forge.fork.web.images;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

import forge.gui.GuiBase;
import forge.util.ScryfallRateLimiter;

/**
 * Blocking Scryfall French image download with Forge's rate limiter, user agent and cooldown; timeouts as
 * {@link HeadlessImageFetcher}. Scryfall answers {@code /cards/<set>/<n>/fr?format=image} with HTTP 200 and a
 * "Localized Image Not Available" banner picture when it has no French scan, so the card record (same URL
 * without the query, {@code image_status}) is read first: {@code placeholder} and {@code missing} are
 * {@link #MISSING}. That is two paced API calls per printing; the image itself redirects to the unthrottled CDN.
 */
final class ScryfallDownloader implements LocalizedImages.Downloader {

    private static final int CONNECT_TIMEOUT_MS = 10_000;
    private static final int READ_TIMEOUT_MS = 30_000;
    private static final int MAX_JSON_BYTES = 256 * 1024;
    private static final String ACCEPT_JSON = "application/json;q=0.9,*/*;q=0.8";
    private static final String ACCEPT_IMAGE = "image/*;q=0.9,*/*;q=0.8";

    /** One HTTP GET: status code, Retry-After header, body (null when not read or over {@code maxBytes}). */
    record Response(int code, String retryAfter, byte[] body) {
    }

    /** The HTTP seam, so tests need no network. Throws IOException on transport errors. */
    interface Http {
        Response get(String url, String accept, int maxBytes) throws IOException;
    }

    private final Http http;

    ScryfallDownloader() {
        this(ScryfallDownloader::httpGet);
    }

    ScryfallDownloader(Http http) {
        this.http = http;
    }

    @Override
    public byte[] download(String url) {
        try {
            if (ScryfallRateLimiter.shouldSkip(url)) {
                return FAILED;
            }
            ScryfallRateLimiter.acquire(url);
            Response card = http.get(cardRecordUrl(url), ACCEPT_JSON, MAX_JSON_BYTES);
            byte[] verdict = failOrMissing(card, url);
            if (verdict != null) {
                return verdict;
            }
            if (card.body() == null) {
                return FAILED;
            }
            if (!hasRealImage(card.body())) {
                return MISSING;
            }
            ScryfallRateLimiter.acquire(url);
            Response image = http.get(url, ACCEPT_IMAGE, (int) CardImages.MAX_BYTES);
            verdict = failOrMissing(image, url);
            if (verdict != null) {
                return verdict;
            }
            return image.body() == null ? FAILED : image.body();
        } catch (IOException | RuntimeException e) {
            System.err.println("[web] french image download failed: " + e.getMessage());
            return FAILED;
        }
    }

    /** Null when the response is a 200; MISSING for 404; FAILED (with the rate limit noted) otherwise. */
    private static byte[] failOrMissing(Response r, String url) {
        if (r.code() == HttpURLConnection.HTTP_OK) {
            return null;
        }
        if (r.code() == HttpURLConnection.HTTP_NOT_FOUND) {
            return MISSING;
        }
        ScryfallRateLimiter.noteIfRateLimited(r.code(), url, r.retryAfter());
        return FAILED;
    }

    /** The card record URL of an image URL: the same path without the query. */
    static String cardRecordUrl(String imageUrl) {
        int q = imageUrl.indexOf('?');
        return q < 0 ? imageUrl : imageUrl.substring(0, q);
    }

    /**
     * Whether a Scryfall card record carries a real scan in its language. Anything unparseable or without an
     * {@code image_status} counts as real (the old behaviour); only {@code placeholder} and {@code missing} are not.
     */
    static boolean hasRealImage(byte[] cardJson) {
        try {
            JsonObject o = JsonParser.parseString(new String(cardJson, StandardCharsets.UTF_8)).getAsJsonObject();
            if (!o.has("image_status") || o.get("image_status").isJsonNull()) {
                return true;
            }
            String status = o.get("image_status").getAsString();
            return !"placeholder".equals(status) && !"missing".equals(status);
        } catch (RuntimeException e) {
            return true;
        }
    }

    private static Response httpGet(String url, String accept, int maxBytes) throws IOException {
        HttpURLConnection http = (HttpURLConnection) new URL(url).openConnection();
        try {
            http.setConnectTimeout(CONNECT_TIMEOUT_MS);
            http.setReadTimeout(READ_TIMEOUT_MS);
            http.setRequestProperty("Accept", accept);
            http.setRequestProperty("User-Agent", GuiBase.getInterface().getUserAgent());
            int code = http.getResponseCode();
            String retryAfter = http.getHeaderField("Retry-After");
            if (code != HttpURLConnection.HTTP_OK) {
                return new Response(code, retryAfter, null);
            }
            try (InputStream in = http.getInputStream()) {
                ByteArrayOutputStream out = new ByteArrayOutputStream();
                byte[] buf = new byte[8192];
                for (int n; (n = in.read(buf)) > 0; ) {
                    out.write(buf, 0, n);
                    if (out.size() > maxBytes) {
                        return new Response(code, retryAfter, null);
                    }
                }
                return new Response(code, retryAfter, out.toByteArray());
            }
        } finally {
            http.disconnect();
        }
    }
}
