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
    private ExecutorService dl;
    private final List<String> englishAsked = new CopyOnWriteArrayList<>();
    private final List<String> urlsAsked = new CopyOnWriteArrayList<>();
    private volatile byte[] answer;

    @BeforeMethod
    public void setUp() throws IOException {
        cache = Files.createTempDirectory("forge-web-fr");
        edt = Executors.newSingleThreadExecutor();
        io = Executors.newFixedThreadPool(3);
        dl = Executors.newFixedThreadPool(3);
        englishAsked.clear();
        urlsAsked.clear();
        answer = FR;
    }

    @AfterMethod(alwaysRun = true)
    public void tearDown() {
        edt.shutdownNow();
        io.shutdownNow();
        dl.shutdownNow();
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
                }, cache, edt, io, dl, 5_000);
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
            assertEquals(files.filter(f -> f.toString().endsWith(".img")).count(), 0);
        }
    }

    /** Item 6: the "no French scan" verdict survives a restart (same cache folder), with no further Scryfall call. */
    @Test
    public void noFrenchVerdictSurvivesARestart() throws Exception {
        answer = LocalizedImages.Downloader.MISSING;
        assertEquals(get(images().find(KEY, "fr")).bytes(), EN);
        assertEquals(urlsAsked.size(), 1);
        LocalizedImages restarted = images();
        assertEquals(get(restarted.find(KEY, "fr")).bytes(), EN);
        assertEquals(get(restarted.find(KEY, "fr")).bytes(), EN);
        assertEquals(get(images().find(KEY, "fr")).bytes(), EN);
        assertEquals(urlsAsked.size(), 1, "no Scryfall call after a restart");
        // another card is unaffected
        answer = FR;
        assertEquals(get(images().find("c:Other|M10|1", "fr")).bytes(), FR);
        assertEquals(urlsAsked.size(), 2);
    }

    /** The verdict is only about the key it was noted for, and transient failures leave none. */
    @Test
    public void transientFailureLeavesNoVerdict() throws Exception {
        answer = LocalizedImages.Downloader.FAILED;
        get(images().find(KEY, "fr"));
        answer = FR;
        assertEquals(get(images().find(KEY, "fr")).bytes(), FR);
        assertEquals(urlsAsked.size(), 2);
    }

    /** A verdict file is only a marker: whatever it holds, and an unwritable folder, cannot break serving. */
    @Test
    public void verdictFilesAreMarkersAndWriteFailuresAreHarmless() throws Exception {
        answer = LocalizedImages.Downloader.MISSING;
        LocalizedImages l = images();
        get(l.find(KEY, "fr"));
        Path verdict = l.noFrenchFileOf(KEY);
        assertTrue(Files.isRegularFile(verdict));
        assertTrue(verdict.startsWith(cache));
        Files.write(verdict, new byte[] {1, 2, 3, (byte) 0xff}); // corrupted: still a verdict
        assertEquals(get(images().find(KEY, "fr")).bytes(), EN);
        assertEquals(urlsAsked.size(), 1);
        // the cache folder cannot be written (a file stands in its place): French fails soft, English is served
        Path blocked = Files.createTempFile("forge-web-fr-blocked", "");
        LocalizedImages b = new LocalizedImages(key -> CompletableFuture.completedFuture(new Image(EN, "image/jpeg")),
                k -> "https://scry.test/" + k, url -> LocalizedImages.Downloader.MISSING, blocked, edt, io, dl, 5_000);
        assertEquals(get(b.find(KEY, "fr")).bytes(), EN);
        Files.deleteIfExists(blocked);
    }

    /** Several instances (threads, restarts) noting the same verdict at once is harmless. */
    @Test
    public void concurrentVerdictWritersAreHarmless() throws Exception {
        answer = LocalizedImages.Downloader.MISSING;
        List<CompletableFuture<Image>> all = new java.util.ArrayList<>();
        for (int i = 0; i < 8; i++) {
            all.add(images().find(KEY, "fr"));
        }
        for (CompletableFuture<Image> f : all) {
            assertEquals(get(f).bytes(), EN);
        }
        assertEquals(get(images().find(KEY, "fr")).bytes(), EN);
        int asked = urlsAsked.size();
        assertEquals(get(images().find(KEY, "fr")).bytes(), EN);
        assertEquals(urlsAsked.size(), asked);
        try (Stream<Path> files = Files.list(cache)) {
            assertEquals(files.filter(f -> f.toString().endsWith(".nofr")).count(), 1);
        }
    }

    /** The one-off stale-placeholder cleanup still drops old images; a verdict (only the new code writes them) stays. */
    @Test
    public void staleImageCleanupStillWorksWithVerdictsPresent() throws Exception {
        answer = LocalizedImages.Downloader.MISSING;
        LocalizedImages probe = images();
        get(probe.find(KEY, "fr"));
        Files.deleteIfExists(cache.resolve(LocalizedImages.CHECKED_MARKER));
        String other = "c:Other|M10|1";
        Files.write(probe.fileOf(other), FR); // a banner an earlier version cached
        LocalizedImages l = images();
        assertFalse(Files.exists(l.fileOf(other)));
        assertTrue(Files.exists(l.noFrenchFileOf(KEY)));
        assertTrue(Files.exists(cache.resolve(LocalizedImages.CHECKED_MARKER)));
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
    public void imagesCachedBeforePlaceholderDetectionAreDroppedOnce() throws Exception {
        LocalizedImages probe = images();
        Files.deleteIfExists(cache.resolve(LocalizedImages.CHECKED_MARKER));
        Files.write(probe.fileOf(KEY), FR); // a banner an earlier version cached
        Files.write(cache.resolve("keep.txt"), new byte[] {1});
        LocalizedImages l = images();
        assertFalse(Files.exists(l.fileOf(KEY)), "unvetted cached file dropped");
        assertTrue(Files.exists(cache.resolve("keep.txt")), "only .img files are touched");
        assertEquals(get(l.find(KEY, "fr")).bytes(), FR);
        assertEquals(urlsAsked.size(), 1, "re-downloaded, vetted by the downloader");
        // vetted files survive the next start
        assertEquals(get(images().find(KEY, "fr")).bytes(), FR);
        assertEquals(urlsAsked.size(), 1);
    }

    /** The real downloader over a fake HTTP seam: a placeholder record means English, remembered, no image request. */
    @Test
    public void placeholderRecordFallsBackToEnglishAndIsRememberedWithoutImageRequest() throws Exception {
        List<String> requests = new CopyOnWriteArrayList<>();
        LocalizedImages l = new LocalizedImages(key -> CompletableFuture.completedFuture(new Image(EN, "image/jpeg")),
                k -> "https://scry.test/cards/mir/128/fr?format=image&version=normal",
                new ScryfallDownloader((url, accept, max) -> {
                    requests.add(url);
                    return new ScryfallDownloader.Response(200, null,
                            "{\"object\":\"card\",\"lang\":\"fr\",\"image_status\":\"placeholder\"}".getBytes());
                }), cache, edt, io, dl, 5_000);
        assertEquals(get(l.find(KEY, "fr")).bytes(), EN);
        assertEquals(get(l.find(KEY, "fr")).bytes(), EN);
        assertEquals(requests, List.of("https://scry.test/cards/mir/128/fr"), "one record lookup, never the image, never again");
        assertFalse(Files.exists(l.fileOf(KEY)));
    }

    @Test
    public void realFrenchRecordIsServedFrench() throws Exception {
        LocalizedImages l = new LocalizedImages(key -> CompletableFuture.completedFuture(new Image(EN, "image/jpeg")),
                k -> "https://scry.test/cards/m10/1/fr?format=image&version=normal",
                new ScryfallDownloader((url, accept, max) -> url.contains("?")
                        ? new ScryfallDownloader.Response(200, null, FR)
                        : new ScryfallDownloader.Response(200, null, "{\"image_status\":\"lowres\"}".getBytes())),
                cache, edt, io, dl, 5_000);
        assertEquals(get(l.find(KEY, "fr")).bytes(), FR);
        assertTrue(Files.exists(l.fileOf(KEY)));
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
        }, cache, edt, io, dl, 5_000);
        CompletableFuture<Image> a = l.find(KEY, "fr");
        CompletableFuture<Image> b = l.find(KEY, "fr");
        gate.complete(true);
        assertEquals(get(a).bytes(), FR);
        assertEquals(get(b).bytes(), FR);
        assertEquals(urlsAsked.size(), 1);
    }

    @Test
    public void blockedFrenchDownloadsDoNotDelayEnglishReads() throws Exception {
        CompletableFuture<Boolean> gate = new CompletableFuture<>();
        ExecutorService oneIo = Executors.newFixedThreadPool(1);
        ExecutorService oneDl = Executors.newFixedThreadPool(1);
        try {
            ImageSource english = key -> CompletableFuture.supplyAsync(() -> new Image(EN, "image/jpeg"), oneIo);
            LocalizedImages l = new LocalizedImages(english, k -> "https://scry.test/" + k, url -> {
                gate.join();
                return FR;
            }, cache, edt, oneIo, oneDl, 60_000);
            for (int i = 0; i < 5; i++) {
                l.find("c:Cold" + i + "|M10|1", "fr");
            }
            Thread.sleep(300);
            assertEquals(l.find(KEY, "en").get(2, TimeUnit.SECONDS).bytes(), EN, "English not queued behind French downloads");
        } finally {
            gate.complete(true);
            oneIo.shutdownNow();
            oneDl.shutdownNow();
        }
    }

    @Test
    public void frenchBackstopFallsBackToEnglish() throws Exception {
        CompletableFuture<Boolean> gate = new CompletableFuture<>();
        ImageSource english = key -> CompletableFuture.completedFuture(new Image(EN, "image/jpeg"));
        LocalizedImages l = new LocalizedImages(english, k -> "https://scry.test/" + k, url -> {
            gate.join();
            return FR;
        }, cache, edt, io, dl, 0);
        try {
            // French never answers within timeout + 5 s backstop: English does
            assertEquals(l.find(KEY, "fr").get(12, TimeUnit.SECONDS).bytes(), EN);
        } finally {
            gate.complete(true);
        }
    }

    @Test
    public void unknownCardsAreNotRemembered() throws Exception {
        LocalizedImages l = images();
        for (int i = 0; i < 3; i++) {
            get(l.find("c:Nowhere" + i + "|XXX|1", "fr"));
        }
        java.lang.reflect.Field f = LocalizedImages.class.getDeclaredField("noFrench");
        f.setAccessible(true);
        assertTrue(((java.util.Set<?>) f.get(l)).isEmpty());
    }
}
