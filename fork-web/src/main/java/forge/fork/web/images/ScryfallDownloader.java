package forge.fork.web.images;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

import forge.gui.GuiBase;
import forge.util.ScryfallRateLimiter;

/** Blocking Scryfall image download with Forge's rate limiter, user agent and cooldown; timeouts as {@link HeadlessImageFetcher}. */
final class ScryfallDownloader implements LocalizedImages.Downloader {

    private static final int CONNECT_TIMEOUT_MS = 10_000;
    private static final int READ_TIMEOUT_MS = 30_000;

    @Override
    public byte[] download(String url) {
        try {
            if (ScryfallRateLimiter.shouldSkip(url)) {
                return FAILED;
            }
            ScryfallRateLimiter.acquire(url);
            HttpURLConnection http = (HttpURLConnection) new URL(url).openConnection();
            try {
                http.setConnectTimeout(CONNECT_TIMEOUT_MS);
                http.setReadTimeout(READ_TIMEOUT_MS);
                http.setRequestProperty("Accept", "*/*");
                http.setRequestProperty("User-Agent", GuiBase.getInterface().getUserAgent());
                int code = http.getResponseCode();
                if (code == HttpURLConnection.HTTP_NOT_FOUND) {
                    return MISSING;
                }
                if (code != HttpURLConnection.HTTP_OK) {
                    ScryfallRateLimiter.noteIfRateLimited(code, url, http.getHeaderField("Retry-After"));
                    return FAILED;
                }
                try (InputStream in = http.getInputStream()) {
                    ByteArrayOutputStream out = new ByteArrayOutputStream();
                    byte[] buf = new byte[8192];
                    for (int n; (n = in.read(buf)) > 0; ) {
                        out.write(buf, 0, n);
                        if (out.size() > CardImages.MAX_BYTES) {
                            return FAILED;
                        }
                    }
                    return out.toByteArray();
                }
            } finally {
                http.disconnect();
            }
        } catch (IOException | RuntimeException e) {
            System.err.println("[web] french image download failed: " + e.getMessage());
            return FAILED;
        }
    }
}
