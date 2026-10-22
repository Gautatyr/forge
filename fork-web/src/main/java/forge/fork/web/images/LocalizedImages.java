package forge.fork.web.images;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executor;
import java.util.concurrent.TimeUnit;
import java.util.function.Function;

import forge.fork.web.server.ImageSource;

/**
 * Serves the French printing of a card ({@code lang=fr}) from the bridge's own cache folder
 * ({@code cacheDir}, separate from the English {@code pics} cache), downloading it once. Whatever
 * goes wrong (no French printing, rate limit, timeout, bad file) falls back to {@code english}.
 * Only {@code c:} card keys are localized: face-down, token and other keys are always answered by
 * {@code english}, so the language never changes which key a viewer may obtain. A printing Scryfall
 * answered 404 for is remembered until restart; transient failures are not.
 */
public final class LocalizedImages implements ImageSource {

    /** One download. */
    public interface Downloader {
        /** Image bytes, {@link #MISSING} (Scryfall has no such printing) or {@link #FAILED} (try again later). Blocking. */
        byte[] download(String url);

        byte[] MISSING = new byte[0];
        byte[] FAILED = new byte[0];
    }

    private final ImageSource english;
    private final Function<String, String> urlOf;
    private final Downloader downloader;
    private final Path cacheDir;
    private final Executor edt;
    private final Executor io;
    private final long timeoutMs;
    private final Set<String> noFrench = ConcurrentHashMap.newKeySet();
    private final Map<String, CompletableFuture<Image>> pending = new ConcurrentHashMap<>();

    /**
     * @param urlOf  card view key to the Scryfall URL of its French printing, or null (called on {@code edt})
     * @param io     runs file reads and the (blocking, rate-limited) downloads
     */
    public LocalizedImages(ImageSource english, Function<String, String> urlOf, Downloader downloader,
                           Path cacheDir, Executor edt, Executor io, long timeoutMs) {
        this.english = english;
        this.urlOf = urlOf;
        this.downloader = downloader;
        this.cacheDir = cacheDir;
        this.edt = edt;
        this.io = io;
        this.timeoutMs = timeoutMs;
    }

    @Override
    public CompletableFuture<Image> find(String key) {
        return english.find(key);
    }

    @Override
    public CompletableFuture<Image> find(String key, String lang) {
        if (!"fr".equals(lang) || !CardImages.validKey(key) || !key.startsWith("c:") || noFrench.contains(key)) {
            return english.find(key);
        }
        CompletableFuture<Image> french = new CompletableFuture<>();
        // joiners share one lookup, English fallback included
        CompletableFuture<Image> result = new CompletableFuture<>();
        CompletableFuture<Image> prior = pending.putIfAbsent(key, result);
        if (prior != null) {
            return prior;
        }
        result.whenComplete((r, e) -> pending.remove(key, result));
        french.completeOnTimeout(null, timeoutMs + 5_000, TimeUnit.MILLISECONDS);
        french.thenCompose(img -> img != null ? CompletableFuture.completedFuture(img) : english.find(key))
                .whenComplete((img, err) -> {
                    if (err != null) {
                        result.complete(null);
                    } else {
                        result.complete(img);
                    }
                });
        try {
            io.execute(() -> {
                Image hit = cached(key);
                if (hit != null) {
                    french.complete(hit);
                } else {
                    miss(key, french);
                }
            });
        } catch (RuntimeException e) {
            french.complete(null);
        }
        return result;
    }

    private void miss(String key, CompletableFuture<Image> out) {
        try {
            edt.execute(() -> {
                String url;
                try {
                    url = urlOf.apply(key);
                } catch (RuntimeException e) {
                    url = null;
                }
                if (url == null) {
                    noFrench.add(key);
                    out.complete(null);
                    return;
                }
                String u = url;
                try {
                    io.execute(() -> out.complete(fetch(key, u)));
                } catch (RuntimeException e) {
                    out.complete(null);
                }
            });
        } catch (RuntimeException e) {
            out.complete(null);
        }
    }

    private Image fetch(String key, String url) {
        try {
            byte[] bytes = downloader.download(url);
            if (bytes == Downloader.MISSING) {
                noFrench.add(key);
                return null;
            }
            String type = bytes == null || bytes == Downloader.FAILED || bytes.length > CardImages.MAX_BYTES
                    ? null : CardImages.contentType(bytes);
            if (type == null) {
                return null;
            }
            Path file = fileOf(key);
            Path tmp = file.resolveSibling(file.getFileName() + ".tmp");
            Files.createDirectories(cacheDir);
            Files.write(tmp, bytes);
            Files.move(tmp, file, StandardCopyOption.REPLACE_EXISTING);
            return new Image(bytes, type);
        } catch (IOException | RuntimeException e) {
            System.err.println("[web] french image failed [" + key + "]: " + e);
            return null;
        }
    }

    private Image cached(String key) {
        try {
            Path f = fileOf(key);
            if (!Files.isRegularFile(f) || Files.size(f) > CardImages.MAX_BYTES) {
                return null;
            }
            byte[] bytes = Files.readAllBytes(f);
            String type = CardImages.contentType(bytes);
            return type == null ? null : new Image(bytes, type);
        } catch (IOException e) {
            return null;
        }
    }

    /** One flat file per key inside the cache folder: the key's SHA-256, never part of it. */
    Path fileOf(String key) {
        try {
            byte[] d = MessageDigest.getInstance("SHA-256").digest(key.getBytes(StandardCharsets.UTF_8));
            return cacheDir.resolve(HexFormat.of().formatHex(d) + ".img");
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
