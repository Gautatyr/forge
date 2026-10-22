package forge.fork.web.images;

import java.io.File;
import java.nio.file.Paths;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import org.apache.commons.lang3.StringUtils;

import forge.ImageKeys;
import forge.StaticData;
import forge.card.CardEdition;
import forge.gui.FThreads;
import forge.item.PaperCard;
import forge.localinstance.properties.ForgeConstants;
import forge.fork.web.server.ImageSource;
import forge.util.ImageUtil;

/** {@link CardImages} over Forge's image cache ({@code ForgeConstants.CACHE_*_PICS_DIR}) and fetcher. */
public final class ForgeImages {

    /** One request waits at most this long for a download (Scryfall is rate-limited; a cold 4-player game queues ~200). */
    private static final long DOWNLOAD_TIMEOUT_MS = 90_000;

    private static final String[][] SPEC_FACES = {
        {ImageKeys.SPECFACE_W, "white"}, {ImageKeys.SPECFACE_U, "blue"}, {ImageKeys.SPECFACE_B, "black"},
        {ImageKeys.SPECFACE_R, "red"}, {ImageKeys.SPECFACE_G, "green"},
    };

    private ForgeImages() { }

    /** After {@code FModel.initialize}. */
    public static ImageSource create() {
        HeadlessImageFetcher fetcher = new HeadlessImageFetcher();
        ExecutorService io = Executors.newFixedThreadPool(2, r -> {
            Thread t = new Thread(r, "web-images");
            t.setDaemon(true);
            return t;
        });
        // French downloads block (rate limiter, HTTP): own pool, so English reads on io never wait behind them
        ExecutorService downloads = Executors.newFixedThreadPool(2, r -> {
            Thread t = new Thread(r, "web-images-fr");
            t.setDaemon(true);
            return t;
        });
        CardImages english = new CardImages(ForgeImages::locate, fetcher::fetch,
                () -> Paths.get(ForgeConstants.CACHE_DIR, "pics"), FThreads::invokeInEdtLater, io, DOWNLOAD_TIMEOUT_MS);
        return new LocalizedImages(english, ForgeImages::frenchUrl, new ScryfallDownloader(),
                Paths.get(ForgeConstants.CACHE_DIR, "web-pics", "fr"), FThreads::invokeInEdtLater, io, downloads, DOWNLOAD_TIMEOUT_MS);
    }

    /**
     * The Scryfall URL of the French printing for a card view key ({@code c:...}, back face and
     * specialize faces as in {@link #locate}), or null (not a card, unknown card, no collector number).
     * Run on the EDT (card database lookups).
     */
    static String frenchUrl(String key) {
        boolean back = key.endsWith(ImageKeys.BACKFACE_POSTFIX);
        String k = back ? key.substring(0, key.length() - ImageKeys.BACKFACE_POSTFIX.length()) : key;
        String spec = "";
        for (String[] s : SPEC_FACES) {
            if (k.endsWith(s[0])) {
                spec = s[1];
                k = k.substring(0, k.length() - s[0].length());
            }
        }
        if (!k.startsWith(ImageKeys.CARD_PREFIX)) {
            return null;
        }
        PaperCard pc = ImageUtil.getPaperCardFromImageKey(k);
        if (pc == null || StringUtils.isBlank(pc.getCollectorNumber())) {
            return null;
        }
        CardEdition ed = StaticData.instance().getEditions().get(pc.getEdition());
        if (ed == null || StringUtils.isBlank(ed.getScryfallCode())) {
            return null;
        }
        String face = back ? "back" : spec;
        return ForgeConstants.URL_PIC_SCRYFALL_DOWNLOAD + ImageUtil.getScryfallDownloadUrl(pc, face, ed.getScryfallCode(), "fr", false);
    }

    /**
     * The cached file for a view image key, as the desktop {@code ImageCache} resolves it: a card key
     * ({@code c:Name|SET|art}, {@code $alt} for the back face, {@code $wspec}... for specialize faces)
     * goes through its {@link PaperCard}; a token key ({@code t:...}) goes to {@link ImageKeys} as is.
     * Run on the EDT.
     */
    static File locate(String key) {
        boolean back = key.endsWith(ImageKeys.BACKFACE_POSTFIX);
        String k = back ? key.substring(0, key.length() - ImageKeys.BACKFACE_POSTFIX.length()) : key;
        String spec = "";
        for (String[] s : SPEC_FACES) {
            if (k.endsWith(s[0])) {
                spec = s[1];
                k = k.substring(0, k.length() - s[0].length());
            }
        }
        if (!k.startsWith(ImageKeys.CARD_PREFIX)) {
            return ImageKeys.getImageFile(k);
        }
        PaperCard pc = ImageUtil.getPaperCardFromImageKey(k);
        if (pc == null) {
            return null;
        }
        String file = back ? pc.getCardAltImageKey() : !spec.isEmpty() ? ImageUtil.getImageKey(pc, spec, true) : pc.getCardImageKey();
        return StringUtils.isBlank(file) ? null : ImageKeys.getImageFile(file);
    }
}
