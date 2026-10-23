package forge.fork.web.images;

import static org.testng.Assert.assertEquals;
import static org.testng.Assert.assertFalse;
import static org.testng.Assert.assertSame;
import static org.testng.Assert.assertTrue;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;

import org.testng.annotations.Test;

import forge.fork.web.images.ScryfallDownloader.Response;

/** French image verdicts from Scryfall's card record; HTTP is faked. */
public class ScryfallDownloaderTest {

    private static final String IMAGE_URL = "https://api.scryfall.test/cards/mir/128/fr?format=image&version=normal&face=front";
    private static final byte[] PNG = CardImagesTest.PNG;

    private static byte[] record(String status) {
        return ("{\"object\":\"card\",\"lang\":\"fr\"" + (status == null ? "" : ",\"image_status\":\"" + status + "\"") + "}").getBytes();
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
            assertEquals(log, List.of("application/json https://api.scryfall.test/cards/mir/128/fr"));
        }
    }

    @Test
    public void realScanIsDownloadedWithImageAccept() {
        for (String status : new String[] {"highres_scan", "lowres", null}) {
            List<String> log = new ArrayList<>();
            byte[] out = new ScryfallDownloader(http(new Response(200, null, record(status)), new Response(200, null, PNG), log))
                    .download(IMAGE_URL);
            assertEquals(out, PNG, String.valueOf(status));
            assertEquals(log, List.of("application/json https://api.scryfall.test/cards/mir/128/fr", "image/* " + IMAGE_URL));
        }
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
