package forge.fork.web.images;

import java.awt.image.BufferedImage;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLConnection;
import java.util.concurrent.CompletableFuture;

import javax.imageio.ImageIO;

import forge.gui.FThreads;
import forge.localinstance.properties.ForgeConstants;
import forge.util.BuildInfo;
import forge.util.ImageFetcher;
import forge.util.ScryfallRateLimiter;
import forge.util.TextUtil;

/**
 * Forge's {@link ImageFetcher} (same sources, URLs and cache paths as the desktop app) with a
 * headless download task: {@code SwingImageFetcher}'s, minus Swing, plus connect/read timeouts.
 * {@link #fetch} reports whether this call started a download and when it ends.
 */
final class HeadlessImageFetcher extends ImageFetcher {

    private static final int CONNECT_TIMEOUT_MS = 10_000;
    private static final int READ_TIMEOUT_MS = 30_000;

    /** EDT-confined: the completion handed to the download task {@link #fetchImage} creates, if any. */
    private CompletableFuture<Boolean> starting;

    /**
     * Must run on the EDT. Completes false at once when the fetcher starts nothing (no URL, already
     * tried, rate-limited, joined another key's download); otherwise when the download ends.
     */
    CompletableFuture<Boolean> fetch(String key) {
        FThreads.assertExecutedByEdt(true);
        CompletableFuture<Boolean> done = new CompletableFuture<>();
        starting = done;
        try {
            fetchImage(key, () -> { });
        } finally {
            if (starting == done) {
                starting = null;
                done.complete(false);
            }
        }
        return done;
    }

    @Override
    protected Runnable getDownloadTask(String[] urls, String destPath, Runnable notifyObservers) {
        CompletableFuture<Boolean> done = starting;
        starting = null;
        return () -> {
            boolean ok = false;
            try {
                ok = download(urls, destPath);
                if (ok) {
                    FThreads.invokeInEdtLater(notifyObservers);
                }
            } finally {
                if (done != null) {
                    done.complete(ok);
                }
            }
        };
    }

    private static boolean download(String[] urls, String destPath) {
        for (String url : urls) {
            try {
                if (doFetch(url, destPath)) {
                    return true;
                }
            } catch (IOException e) {
                System.err.println("[web] image download failed [" + destPath + "]: " + e.getMessage());
            }
        }
        return false;
    }

    /** {@code SwingImageFetcher.SwingDownloadTask.doFetch}, with timeouts and without the Swing notify. */
    private static boolean doFetch(String urlToDownload, String destPath) throws IOException {
        if (disableHostedDownload && urlToDownload.startsWith(ForgeConstants.URL_CARDFORGE)) {
            return false;
        }
        if (ScryfallRateLimiter.shouldSkip(urlToDownload)) {
            return false;
        }
        boolean isScryfallUrl = urlToDownload.startsWith(ForgeConstants.URL_PIC_SCRYFALL_DOWNLOAD)
                || urlToDownload.startsWith(ForgeConstants.URL_SCRYFALL_CDN);
        String newdespath = urlToDownload.contains(".fullborder.jpg") || isScryfallUrl
                ? TextUtil.fastReplace(destPath, ".full.jpg", ".fullborder.jpg") : destPath;
        if (!newdespath.contains(".full") && !newdespath.contains(".artcrop") && isScryfallUrl
                && !destPath.startsWith(ForgeConstants.CACHE_TOKEN_PICS_DIR)) {
            newdespath = newdespath.replace(".jpg", ".fullborder.jpg");
        }
        URL url = new URL(urlToDownload);
        ScryfallRateLimiter.acquire(urlToDownload);

        URLConnection connection = url.openConnection();
        connection.setConnectTimeout(CONNECT_TIMEOUT_MS);
        connection.setReadTimeout(READ_TIMEOUT_MS);
        connection.setRequestProperty("Accept", "*/*");
        connection.setRequestProperty("User-Agent", BuildInfo.getUserAgent());
        if (connection instanceof HttpURLConnection http) {
            int code = http.getResponseCode();
            if (code != HttpURLConnection.HTTP_OK) {
                ScryfallRateLimiter.noteIfRateLimited(code, urlToDownload, http.getHeaderField("Retry-After"));
                http.disconnect();
                return false;
            }
        }
        BufferedImage image;
        try (InputStream is = connection.getInputStream()) {
            image = ImageIO.read(is);
        }
        if (image == null) {
            return false;
        }
        // temporary file first, so nothing reads a partial download
        File tmp = new File(newdespath + ".tmp");
        tmp.getParentFile().mkdirs();
        if (ImageIO.write(image, "jpg", tmp)) {
            return tmp.renameTo(new File(newdespath));
        }
        if (ImageIO.write(image, "png", tmp)) {
            return tmp.renameTo(new File(newdespath.replace(".jpg", ".png")));
        }
        tmp.delete();
        return false;
    }
}
