package forge.fork.web.images;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executor;
import java.util.concurrent.TimeUnit;
import java.util.function.Function;
import java.util.function.Supplier;

import forge.fork.web.server.ImageSource;

/**
 * Serves view image keys from an image cache folder, downloading a missing image once.
 * Lookups and downloads start on {@code edt} (Forge's {@code ImageKeys}/{@code ImageFetcher} are
 * EDT-confined); file reads run on {@code io}. Concurrent requests for one key share one lookup.
 */
public final class CardImages implements ImageSource {

    /** Longest accepted key; view keys are a card name, a set code and an art index. */
    static final int MAX_KEY = 300;
    /** Larger files are not served (a full card scan is well under 1 MB). */
    static final long MAX_BYTES = 16L << 20;

    /** Starts a download for a key; completes true once a file was written, false if none will be. */
    public interface Fetcher {
        CompletableFuture<Boolean> fetch(String key);
    }

    private final Function<String, File> locate;
    private final Fetcher fetcher;
    private final Supplier<Path> root;
    private final Executor edt;
    private final Executor io;
    private final long timeoutMs;
    private final Map<String, CompletableFuture<Image>> pending = new ConcurrentHashMap<>();

    /**
     * @param locate    view key to cached file, or null (called on {@code edt})
     * @param fetcher   download on a miss (called on {@code edt})
     * @param root      the cache folder; a located file outside it is never served
     * @param timeoutMs how long one request may wait for a download
     */
    public CardImages(Function<String, File> locate, Fetcher fetcher, Supplier<Path> root,
                      Executor edt, Executor io, long timeoutMs) {
        this.locate = locate;
        this.fetcher = fetcher;
        this.root = root;
        this.edt = edt;
        this.io = io;
        this.timeoutMs = timeoutMs;
    }

    @Override
    public CompletableFuture<Image> find(String key) {
        if (!validKey(key)) {
            return CompletableFuture.completedFuture(null);
        }
        CompletableFuture<Image> mine = new CompletableFuture<>();
        CompletableFuture<Image> prior = pending.putIfAbsent(key, mine);
        if (prior != null) {
            return prior;
        }
        mine.whenComplete((r, e) -> pending.remove(key, mine));
        // backstop: whatever goes wrong below, the HTTP request gets an answer
        mine.completeOnTimeout(null, timeoutMs + 5_000, TimeUnit.MILLISECONDS);
        run(edt, mine, () -> {
            File cached = cached(key);
            if (cached != null) {
                read(cached, mine);
                return;
            }
            fetcher.fetch(key).orTimeout(timeoutMs, TimeUnit.MILLISECONDS).whenComplete((written, err) -> {
                if (!Boolean.TRUE.equals(written)) {
                    mine.complete(null);
                    return;
                }
                run(edt, mine, () -> {
                    File fetched = cached(key);
                    if (fetched == null) {
                        mine.complete(null);
                    } else {
                        read(fetched, mine);
                    }
                });
            });
        });
        return mine;
    }

    /** {@code c:} (card) and {@code t:} (token) keys only; nothing that could step out of a folder (also checked after lookup). */
    static boolean validKey(String key) {
        if (key == null || key.length() < 3 || key.length() > MAX_KEY) {
            return false;
        }
        if (!key.startsWith("c:") && !key.startsWith("t:")) {
            return false;
        }
        // '/' only in card keys ("Fire // Ice"), which map through the card database, never to a path
        if (key.contains("..") || key.indexOf('\\') >= 0 || (key.startsWith("t:") && key.indexOf('/') >= 0)) {
            return false;
        }
        for (int i = 0; i < key.length(); i++) {
            if (key.charAt(i) < 0x20 || key.charAt(i) == 0x7f) {
                return false;
            }
        }
        return true;
    }

    /** The located file if it is a regular file inside the cache folder (symlinks resolved). */
    private File cached(String key) {
        File f = locate.apply(key);
        if (f == null) {
            return null;
        }
        try {
            Path real = f.toPath().toRealPath();
            Path base = root.get().toRealPath();
            return real.startsWith(base) && Files.isRegularFile(real) && Files.size(real) <= MAX_BYTES ? real.toFile() : null;
        } catch (IOException e) {
            return null;
        }
    }

    private void read(File f, CompletableFuture<Image> out) {
        run(io, out, () -> {
            try {
                byte[] bytes = Files.readAllBytes(f.toPath());
                String type = contentType(bytes);
                out.complete(type == null ? null : new Image(bytes, type));
            } catch (IOException e) {
                out.complete(null);
            }
        });
    }

    /** From the file's magic bytes: Forge stores PNGs under {@code .jpg} names in places. */
    static String contentType(byte[] b) {
        if (b.length > 3 && (b[0] & 0xff) == 0xff && (b[1] & 0xff) == 0xd8 && (b[2] & 0xff) == 0xff) {
            return "image/jpeg";
        }
        if (b.length > 8 && (b[0] & 0xff) == 0x89 && b[1] == 'P' && b[2] == 'N' && b[3] == 'G') {
            return "image/png";
        }
        return null;
    }

    private static void run(Executor on, CompletableFuture<Image> out, Runnable task) {
        try {
            on.execute(() -> {
                try {
                    task.run();
                } catch (RuntimeException e) {
                    System.err.println("[web] image lookup failed: " + e);
                    out.complete(null);
                }
            });
        } catch (RuntimeException e) {
            out.complete(null);
        }
    }
}
