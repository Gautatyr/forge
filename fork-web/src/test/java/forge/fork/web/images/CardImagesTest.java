package forge.fork.web.images;

import static org.testng.Assert.assertEquals;
import static org.testng.Assert.assertFalse;
import static org.testng.Assert.assertNull;
import static org.testng.Assert.assertSame;
import static org.testng.Assert.assertTrue;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.function.Function;

import org.testng.annotations.AfterMethod;
import org.testng.annotations.BeforeMethod;
import org.testng.annotations.Test;

import forge.fork.web.server.ImageSource.Image;

/** Lookup, download-on-miss, key validation and folder confinement, without the engine. */
public class CardImagesTest {

    static final byte[] JPEG = {(byte) 0xff, (byte) 0xd8, (byte) 0xff, (byte) 0xe0, 0, 0x10, 'J', 'F', 'I', 'F'};
    static final byte[] PNG = {(byte) 0x89, 'P', 'N', 'G', '\r', '\n', 0x1a, '\n', 0, 0};

    private Path root;
    private ExecutorService edt;
    private ExecutorService io;
    private final List<String> located = new CopyOnWriteArrayList<>();
    private final List<String> fetched = new CopyOnWriteArrayList<>();

    @BeforeMethod
    public void setUp() throws IOException {
        root = Files.createTempDirectory("forge-web-pics");
        edt = Executors.newSingleThreadExecutor();
        io = Executors.newSingleThreadExecutor();
        located.clear();
        fetched.clear();
    }

    @AfterMethod(alwaysRun = true)
    public void tearDown() {
        edt.shutdownNow();
        io.shutdownNow();
    }

    /** Key "c:Name|SET|1" lives at root/Name.jpg. */
    private File byName(String key) {
        located.add(key);
        return root.resolve(key.substring(2).split("\\|")[0] + ".jpg").toFile();
    }

    private CardImages images(Function<String, File> locate, CardImages.Fetcher fetcher, long timeoutMs) {
        return new CardImages(locate, fetcher, () -> root, edt, io, timeoutMs);
    }

    private CardImages images(CardImages.Fetcher fetcher) {
        return images(this::byName, fetcher, 5_000);
    }

    private CardImages.Fetcher never() {
        return key -> {
            fetched.add(key);
            return CompletableFuture.completedFuture(false);
        };
    }

    private static Image get(CompletableFuture<Image> f) throws Exception {
        return f.get(10, TimeUnit.SECONDS);
    }

    @Test
    public void cachedImageIsServedWithItsSniffedTypeAndNoDownload() throws Exception {
        Files.write(root.resolve("Island.jpg"), JPEG);
        Files.write(root.resolve("Goblin.jpg"), PNG); // Forge writes PNGs under .jpg names
        CardImages images = images(never());
        Image island = get(images.find("c:Island|M19|1"));
        assertEquals(island.bytes(), JPEG);
        assertEquals(island.contentType(), "image/jpeg");
        assertEquals(get(images.find("c:Goblin|M19|1")).contentType(), "image/png");
        assertEquals(fetched, List.of());
    }

    @Test
    public void missDownloadsOnceThenServesTheNewFile() throws Exception {
        CompletableFuture<Boolean> download = new CompletableFuture<>();
        CompletableFuture<Void> started = new CompletableFuture<>();
        CardImages images = images(key -> {
            fetched.add(key);
            started.complete(null);
            return download;
        });
        CompletableFuture<Image> a = images.find("c:Forest|M19|1$alt");
        CompletableFuture<Image> b = images.find("c:Forest|M19|1$alt");
        assertSame(a, b, "concurrent requests for one key share one lookup");
        started.get(5, TimeUnit.SECONDS);
        assertFalse(a.isDone(), "waits for the download");
        Files.write(root.resolve("Forest.jpg"), JPEG);
        download.complete(true);
        assertEquals(get(a).bytes(), JPEG);
        assertEquals(fetched, List.of("c:Forest|M19|1$alt"), "the fetcher gets the view key as is");
        assertEquals(get(images.find("c:Forest|M19|1$alt")).bytes(), JPEG);
        assertEquals(fetched.size(), 1, "a later request finds the cached file");
    }

    @Test
    public void failedOrMissingDownloadAnswersNull() throws Exception {
        CardImages images = images(never());
        assertNull(get(images.find("c:Nothing|M19|1")));
        CardImages broken = images(key -> CompletableFuture.failedFuture(new IllegalStateException("boom")));
        assertNull(get(broken.find("c:Nothing|M19|1")));
        CardImages throwing = images(key -> {
            throw new IllegalStateException("boom");
        });
        assertNull(get(throwing.find("c:Nothing|M19|1")));
    }

    @Test
    public void stalledDownloadTimesOut() throws Exception {
        CardImages images = images(this::byName, key -> new CompletableFuture<>(), 200);
        long t0 = System.nanoTime();
        assertNull(get(images.find("c:Slow|M19|1")));
        assertTrue(System.nanoTime() - t0 < TimeUnit.SECONDS.toNanos(5));
        // the next request starts over instead of reusing the finished one
        Files.write(root.resolve("Slow.jpg"), JPEG);
        assertEquals(get(images.find("c:Slow|M19|1")).bytes(), JPEG);
    }

    @Test
    public void invalidKeysNeverReachTheCache() throws Exception {
        CardImages images = images(never());
        String[] bad = {null, "", "c:", "x:Island", "Island", "/etc/passwd", "t:../../etc/passwd", "c:..|M19|1",
            "t:a/b", "t:a\\b", "c:Is\nland", "c:" + "a".repeat(CardImages.MAX_KEY)};
        for (String key : bad) {
            assertNull(get(images.find(key)), String.valueOf(key));
        }
        assertEquals(located, List.of());
        assertEquals(fetched, List.of());
        assertTrue(CardImages.validKey("c:Fire // Ice|MH2|1"), "split card names contain '/'");
        assertTrue(CardImages.validKey("t:hidden"));
        assertTrue(CardImages.validKey("t:r_1_1_goblin|C17|1"));
    }

    @Test
    public void filesOutsideTheCacheFolderAreNeverServed() throws Exception {
        Path outside = Files.createTempFile("forge-web-secret", ".jpg");
        Files.write(outside, JPEG);
        Files.createSymbolicLink(root.resolve("Escape.jpg"), outside);
        Files.write(root.resolve("NotAnImage.jpg"), "plain text".getBytes());
        Files.createDirectories(root.resolve("Folder.jpg"));
        CardImages images = images(never());
        assertNull(get(images.find("c:Escape|M19|1")), "symlink out of the folder");
        assertNull(get(images.find("c:NotAnImage|M19|1")), "not a JPEG or PNG");
        assertNull(get(images.find("c:Folder|M19|1")), "a directory");
        CardImages direct = images(key -> outside.toFile(), never(), 5_000);
        assertNull(get(direct.find("c:Island|M19|1")), "located path outside the folder");
    }

    @Test
    public void cacheFolderMayItselfBeASymlink() throws Exception {
        Path real = Files.createTempDirectory("forge-web-desktop-pics");
        Files.write(real.resolve("Plains.jpg"), JPEG);
        Path link = Files.createTempDirectory("forge-web-profile").resolve("pics");
        Files.createSymbolicLink(link, real);
        CardImages images = new CardImages(key -> link.resolve("Plains.jpg").toFile(), never(), () -> link, edt, io, 5_000);
        assertEquals(get(images.find("c:Plains|M19|1")).bytes(), JPEG);
        assertFalse(images.find("c:Plains|M19|1").isCompletedExceptionally());
    }
}
