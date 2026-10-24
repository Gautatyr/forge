package forge.fork.web.images;

import static org.testng.Assert.assertEquals;
import static org.testng.Assert.assertFalse;
import static org.testng.Assert.assertNull;
import static org.testng.Assert.assertSame;
import static org.testng.Assert.assertTrue;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;

import org.testng.annotations.AfterMethod;
import org.testng.annotations.Test;

import forge.fork.web.images.ScryfallDownloader.Response;
import forge.util.ScryfallRateLimiter;

/** French image verdicts from Scryfall's card record; HTTP is faked (the fake host counts as the Scryfall API). */
public class ScryfallDownloaderTest {

    private static final String API = "https://api.scryfall.com/cards/mir/128/fr";
    private static final String IMAGE_URL = API + "?format=image&version=normal&face=front";
    private static final byte[] PNG = CardImagesTest.PNG;
    private static final String CDN_FRONT = "https://cards.scryfall.io/normal/front/a/b/ab-uuid.jpg?1700000000";
    private static final String CDN_BACK = "https://cards.scryfall.io/normal/back/a/b/ab-uuid.jpg?1700000000";

    /** The cooldown is JVM-global state of the (upstream) limiter and has no public reset. */
    @AfterMethod(alwaysRun = true)
    public void clearCooldown() throws Exception {
        java.lang.reflect.Field f = ScryfallRateLimiter.class.getDeclaredField("cooldownUntil");
        f.setAccessible(true);
        f.set(null, null);
    }

    private static byte[] record(String status) {
        return ("{\"object\":\"card\",\"lang\":\"fr\"" + (status == null ? "" : ",\"image_status\":\"" + status + "\"") + "}").getBytes();
    }

    /** A real-scan record with extra JSON members. */
    private static byte[] recordWith(String members) {
        return ("{\"object\":\"card\",\"image_status\":\"highres_scan\"," + members + "}").getBytes();
    }

    private static boolean isCdn(String url) {
        return url.startsWith("https://cards.scryfall.io/");
    }

    /** Answers the record URL (no query) with {@code card}, the image URL with {@code image}; logs "accept url". */
    private static ScryfallDownloader.Http http(Response card, Response image, List<String> log) {
        return (url, accept, max) -> {
            log.add(accept.split(";")[0] + " " + url);
            return url.contains("?") ? image : card;
        };
    }

    @Test
    public void placeholderAndMissingAreMissingAndNoImageIsRequested() {
        for (String status : new String[] {"placeholder", "missing"}) {
            List<String> log = new ArrayList<>();
            byte[] out = new ScryfallDownloader(http(new Response(200, null, record(status)), new Response(200, null, PNG), log))
                    .download(IMAGE_URL);
            assertSame(out, LocalizedImages.Downloader.MISSING, status);
            assertEquals(log, List.of("application/json " + API));
        }
    }

    @Test
    public void realScanWithoutImageUrisIsDownloadedFromTheApiImageUrl() {
        for (String status : new String[] {"highres_scan", "lowres", null}) {
            List<String> log = new ArrayList<>();
            byte[] out = new ScryfallDownloader(http(new Response(200, null, record(status)), new Response(200, null, PNG), log))
                    .download(IMAGE_URL);
            assertEquals(out, PNG, String.valueOf(status));
            assertEquals(log, List.of("application/json " + API, "image/* " + IMAGE_URL));
        }
    }

    /** Item 5: the record's own CDN url is used, so the one API call is the record. */
    @Test
    public void imageComesFromTheRecordsCdnUrlSoACardCostsOneApiCall() {
        List<String> log = new ArrayList<>();
        byte[] rec = recordWith("\"image_uris\":{\"small\":\"https://cards.scryfall.io/small/x.jpg\",\"normal\":\"" + CDN_FRONT + "\"}");
        ScryfallDownloader.Http h = (url, accept, max) -> {
            log.add(accept.split(";")[0] + " " + url);
            return isCdn(url) ? new Response(200, null, PNG) : new Response(200, null, rec);
        };
        assertEquals(new ScryfallDownloader(h).download(IMAGE_URL), PNG);
        assertEquals(log, List.of("application/json " + API, "image/* " + CDN_FRONT));
    }

    @Test
    public void faceAndVersionSelectTheRecordsImage() {
        byte[] rec = recordWith("\"card_faces\":[{\"image_uris\":{\"normal\":\"" + CDN_FRONT
                + "\",\"art_crop\":\"https://cards.scryfall.io/art_crop/f.jpg\"}},{\"image_uris\":{\"normal\":\"" + CDN_BACK
                + "\",\"art_crop\":\"https://cards.scryfall.io/art_crop/b.jpg\"}}]");
        String base = "https://api.scryfall.com/cards/a/1/fr?format=image";
        assertEquals(ScryfallDownloader.cdnImageUrl(rec, base + "&version=normal&face=front"), CDN_FRONT);
        assertEquals(ScryfallDownloader.cdnImageUrl(rec, base + "&version=normal&face=back"), CDN_BACK);
        assertEquals(ScryfallDownloader.cdnImageUrl(rec, base + "&version=art_crop&face=back"), "https://cards.scryfall.io/art_crop/b.jpg");
        assertEquals(ScryfallDownloader.cdnImageUrl(rec, base + "&version=normal"), CDN_FRONT, "no face: the front");
    }

    @Test
    public void unusableImageUrisFallBackToTheApiImageUrl() {
        String api = "https://api.scryfall.com/cards/a/1/fr?format=image&version=normal";
        assertNull(ScryfallDownloader.cdnImageUrl(recordWith("\"x\":1"), api), "no image_uris");
        assertNull(ScryfallDownloader.cdnImageUrl(recordWith("\"image_uris\":{\"normal\":\"https://evil.test/x.jpg\"}"), api), "not the CDN");
        assertNull(ScryfallDownloader.cdnImageUrl(recordWith("\"image_uris\":{\"normal\":\"http://cards.scryfall.io/x.jpg\"}"), api), "not https");
        assertNull(ScryfallDownloader.cdnImageUrl(recordWith("\"image_uris\":{\"normal\":\"https://cards.scryfall.io.evil.test/x.jpg\"}"), api), "host lookalike");
        assertNull(ScryfallDownloader.cdnImageUrl(recordWith("\"image_uris\":{\"normal\":\"https://cards.scryfall.io@evil.test/x.jpg\"}"), api), "userinfo trick");
        assertNull(ScryfallDownloader.cdnImageUrl(recordWith("\"image_uris\":{\"large\":\"" + CDN_FRONT + "\"}"), api), "version missing");
        assertNull(ScryfallDownloader.cdnImageUrl("not json".getBytes(), api));
        List<String> log = new ArrayList<>();
        byte[] rec = recordWith("\"image_uris\":{\"normal\":\"https://evil.test/x.jpg\"}");
        assertEquals(new ScryfallDownloader(http(new Response(200, null, rec), new Response(200, null, PNG), log)).download(IMAGE_URL), PNG);
        assertEquals(log.get(1), "image/* " + IMAGE_URL, "old path: the API image url, which redirects to the CDN");
    }

    @Test
    public void cdnImageMissingAfterARealRecordIsTransientNotRemembered() {
        byte[] rec = recordWith("\"image_uris\":{\"normal\":\"" + CDN_FRONT + "\"}");
        ScryfallDownloader.Http h = (url, accept, max) -> isCdn(url) ? new Response(404, null, null) : new Response(200, null, rec);
        assertSame(new ScryfallDownloader(h).download(IMAGE_URL), LocalizedImages.Downloader.FAILED);
    }

    /** Item 7: the record call answers 429; the cooldown starts and the next card makes no call at all. */
    @Test
    public void rateLimitedRecordStartsTheCooldownAndLaterDownloadsMakeNoCall() {
        AtomicInteger calls = new AtomicInteger();
        ScryfallDownloader d = new ScryfallDownloader((url, accept, max) -> {
            calls.incrementAndGet();
            return new Response(429, "60", null);
        });
        assertSame(d.download(IMAGE_URL), LocalizedImages.Downloader.FAILED);
        assertTrue(ScryfallRateLimiter.isCoolingDown(), "429 on the record call starts the cooldown");
        assertSame(d.download("https://api.scryfall.com/cards/m10/1/fr?format=image&version=normal"), LocalizedImages.Downloader.FAILED);
        assertEquals(calls.get(), 1, "no second call while cooling down");
    }

    /** Item 7: another thread hits a 429 while this one reads the record: its API image call is not made. */
    @Test
    public void secondApiCallAfterAnotherThreadsRateLimitIsNotMade() {
        List<String> log = new ArrayList<>();
        byte[] rec = recordWith("\"image_uris\":{\"normal\":\"https://evil.test/x.jpg\"}"); // no usable CDN url: the API image call
        ScryfallDownloader d = new ScryfallDownloader((url, accept, max) -> {
            log.add(url);
            ScryfallRateLimiter.noteRateLimited(url, 60); // another thread's 429, arriving meanwhile
            return new Response(200, null, rec);
        });
        assertSame(d.download(IMAGE_URL), LocalizedImages.Downloader.FAILED);
        assertEquals(log, List.of(API), "the API image call is not made");
    }

    /** The CDN is not the API: a cooldown never blocks it. */
    @Test
    public void cdnImageIsFetchedDuringTheCooldown() {
        byte[] rec = recordWith("\"image_uris\":{\"normal\":\"" + CDN_FRONT + "\"}");
        ScryfallDownloader d = new ScryfallDownloader((url, accept, max) -> {
            if (isCdn(url)) {
                return new Response(200, null, PNG);
            }
            ScryfallRateLimiter.noteRateLimited(url, 60);
            return new Response(200, null, rec);
        });
        assertEquals(d.download(IMAGE_URL), PNG);
    }

    @Test
    public void unknownPrintingIsMissing() {
        byte[] out = new ScryfallDownloader(http(new Response(404, null, null), new Response(200, null, PNG), new ArrayList<>()))
                .download(IMAGE_URL);
        assertSame(out, LocalizedImages.Downloader.MISSING);
    }

    @Test
    public void imageNotFoundAfterRealRecordIsMissing() {
        byte[] out = new ScryfallDownloader(http(new Response(200, null, record("lowres")), new Response(404, null, null), new ArrayList<>()))
                .download(IMAGE_URL);
        assertSame(out, LocalizedImages.Downloader.MISSING);
    }

    @Test
    public void serverErrorsAndTransportFailuresAreTransient() {
        assertSame(new ScryfallDownloader(http(new Response(500, null, null), null, new ArrayList<>())).download(IMAGE_URL),
                LocalizedImages.Downloader.FAILED);
        assertSame(new ScryfallDownloader(http(new Response(200, null, record("lowres")), new Response(503, null, null), new ArrayList<>()))
                .download(IMAGE_URL), LocalizedImages.Downloader.FAILED);
        assertSame(new ScryfallDownloader((u, a, m) -> {
            throw new IOException("down");
        }).download(IMAGE_URL), LocalizedImages.Downloader.FAILED);
        // oversized or unreadable body
        assertSame(new ScryfallDownloader(http(new Response(200, null, null), null, new ArrayList<>())).download(IMAGE_URL),
                LocalizedImages.Downloader.FAILED);
    }

    @Test
    public void unparseableRecordCountsAsRealAndStatusParsing() {
        assertTrue(ScryfallDownloader.hasRealImage("not json".getBytes()));
        assertTrue(ScryfallDownloader.hasRealImage("[]".getBytes()));
        assertTrue(ScryfallDownloader.hasRealImage("{\"image_status\":null}".getBytes()));
        assertFalse(ScryfallDownloader.hasRealImage(record("placeholder")));
        assertEquals(ScryfallDownloader.cardRecordUrl("https://x/cards/a/1/fr"), "https://x/cards/a/1/fr");
    }
}
