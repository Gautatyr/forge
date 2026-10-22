package forge.fork.web.images;

import static org.testng.Assert.assertEquals;
import static org.testng.Assert.assertFalse;
import static org.testng.Assert.assertTrue;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.stream.Stream;

import org.testng.annotations.AfterMethod;
import org.testng.annotations.BeforeMethod;
import org.testng.annotations.Test;

import forge.fork.web.server.ImageSource;
import forge.fork.web.server.ImageSource.Image;

/** French printing selection, English fallback and the separate cache; downloads are mocked. */
public class LocalizedImagesTest {

    private static final byte[] EN = CardImagesTest.JPEG;
    private static final byte[] FR = CardImagesTest.PNG;
    private static final String KEY = "c:Grizzly Bears|M10|1";

    private Path cache;
    private ExecutorService edt;
    private ExecutorService io;
    private final List<String> englishAsked = new CopyOnWriteArrayList<>();
    private final List<String> urlsAsked = new CopyOnWriteArrayList<>();
    private volatile byte[] answer;

    @BeforeMethod
    public void setUp() throws IOException {
        cache = Files.createTempDirectory("forge-web-fr");
        edt = Executors.newSingleThreadExecutor();
        io = Executors.newFixedThreadPool(3);
        englishAsked.clear();
        urlsAsked.clear();
        answer = FR;
    }

    @AfterMethod(alwaysRun = true)
    public void tearDown() {
        edt.shutdownNow();
        io.shutdownNow();
    }

    private LocalizedImages images() {
        ImageSource english = key -> {
            englishAsked.add(key);
            return CompletableFuture.completedFuture(new Image(EN, "image/jpeg"));
        };
        return new LocalizedImages(english, k -> k.startsWith("c:Nowhere") ? null : "https://scry.test/" + k,
                url -> {
                    urlsAsked.add(url);
                    return answer;
                }, cache, edt, io, 5_000);
    }

    private static Image get(CompletableFuture<Image> f) throws Exception {
        return f.get(10, TimeUnit.SECONDS);
    }

    @Test
    public void frenchPrintingIsServedAndCachedApartFromEnglish() throws Exception {
        LocalizedImages l = images();
        Image first = get(l.find(KEY, "fr"));
        assertEquals(first.bytes(), FR);
        assertEquals(first.contentType(), "image/png");
        assertEquals(urlsAsked, List.of("https://scry.test/" + KEY));
        assertTrue(englishAsked.isEmpty());
        assertTrue(Files.isRegularFile(l.fileOf(KEY)));
        assertTrue(l.fileOf(KEY).startsWith(cache), "inside the bridge's own folder");
        // a fresh instance reads the file: no download
        assertEquals(get(images().find(KEY, "fr")).bytes(), FR);
        assertEquals(urlsAsked.size(), 1);
        // English is untouched
        assertEquals(get(l.find(KEY, "en")).bytes(), EN);
        assertEquals(get(l.find(KEY)).bytes(), EN);
        assertEquals(get(l.find(KEY, null)).bytes(), EN);
        assertEquals(englishAsked.size(), 3);
        assertEquals(urlsAsked.size(), 1);
    }

    @Test
    public void noFrenchPrintingFallsBackToEnglishAndIsNotAskedAgain() throws Exception {
        answer = LocalizedImages.Downloader.MISSING;
        LocalizedImages l = images();
        assertEquals(get(l.find(KEY, "fr")).bytes(), EN);
        assertEquals(get(l.find(KEY, "fr")).bytes(), EN);
        assertEquals(urlsAsked.size(), 1, "a 404 is remembered");
        try (Stream<Path> files = Files.list(cache)) {
            assertEquals(files.count(), 0);
        }
    }

    @Test
    public void transientFailureFallsBackButIsRetried() throws Exception {
        answer = LocalizedImages.Downloader.FAILED;
        LocalizedImages l = images();
        assertEquals(get(l.find(KEY, "fr")).bytes(), EN);
        answer = FR;
        assertEquals(get(l.find(KEY, "fr")).bytes(), FR);
        assertEquals(urlsAsked.size(), 2);
    }

    @Test
    public void garbageDownloadIsNotServedOrCached() throws Exception {
        answer = new byte[] {1, 2, 3, 4, 5, 6, 7, 8, 9, 10};
        LocalizedImages l = images();
        assertEquals(get(l.find(KEY, "fr")).bytes(), EN);
        assertFalse(Files.exists(l.fileOf(KEY)));
    }

    @Test
    public void cardWithoutUrlFallsBack() throws Exception {
        assertEquals(get(images().find("c:Nowhere|XXX|1", "fr")).bytes(), EN);
        assertTrue(urlsAsked.isEmpty());
    }

    @Test
    public void onlyCardKeysAreLocalized() throws Exception {
        LocalizedImages l = images();
        for (String key : new String[] {"t:hidden", "t:w_1_1_soldier|TST", "c:../../x|a|1", "x"}) {
            get(l.find(key, "fr"));
        }
        assertTrue(urlsAsked.isEmpty(), "face-down, token and invalid keys never reach Scryfall: " + urlsAsked);
        assertEquals(englishAsked.size(), 4, "all answered by the English source, which applies its own key checks");
    }

    @Test
    public void concurrentRequestsShareOneDownload() throws Exception {
        CompletableFuture<Boolean> gate = new CompletableFuture<>();
        ImageSource english = key -> CompletableFuture.completedFuture(new Image(EN, "image/jpeg"));
        LocalizedImages l = new LocalizedImages(english, k -> "https://scry.test/" + k, url -> {
            urlsAsked.add(url);
            gate.join();
            return FR;
        }, cache, edt, io, 5_000);
        CompletableFuture<Image> a = l.find(KEY, "fr");
        CompletableFuture<Image> b = l.find(KEY, "fr");
        gate.complete(true);
        assertEquals(get(a).bytes(), FR);
        assertEquals(get(b).bytes(), FR);
        assertEquals(urlsAsked.size(), 1);
    }
}
