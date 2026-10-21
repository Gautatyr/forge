package forge.fork.web.images;

import static org.testng.Assert.assertEquals;
import static org.testng.Assert.assertFalse;
import static org.testng.Assert.assertNotEquals;
import static org.testng.Assert.assertNull;
import static org.testng.Assert.assertTrue;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;

import org.testng.annotations.BeforeClass;
import org.testng.annotations.Test;

import forge.game.Game;
import forge.game.card.Card;
import forge.game.card.CardView;
import forge.game.zone.ZoneType;
import forge.gui.FThreads;
import forge.item.PaperCard;
import forge.localinstance.properties.ForgeConstants;
import forge.localinstance.properties.ForgePreferences.FPref;
import forge.model.FModel;
import forge.util.ImageUtil;
import forge.fork.web.bridge.visibility.TestEngine;
import forge.fork.web.server.ImageSource.Image;

/** View image keys from real engine cards resolve to the files Forge's desktop cache layout uses. */
public class ForgeImagesTest {

    @BeforeClass
    public void boot() {
        TestEngine.boot();
    }

    private static Path write(String relativeToPics) throws Exception {
        Path p = Paths.get(ForgeConstants.CACHE_DIR, "pics").resolve(relativeToPics);
        Files.createDirectories(p.getParent());
        Files.write(p, CardImagesTest.JPEG);
        return p;
    }

    private static Path cardFile(String cardImageKey) throws Exception {
        return write("cards/" + cardImageKey + ".jpg");
    }

    @Test
    public void bothFacesOfADoubleFacedCardResolveToTheirOwnFiles() throws Exception {
        Game game = TestEngine.newGame(2);
        Card delver = TestEngine.add("Delver of Secrets", game.getPlayers().get(0), ZoneType.Battlefield);
        CardView.CardStateView front = delver.getView().getCurrentState();
        CardView.CardStateView back = delver.getView().getAlternateState();
        String frontKey = front.getTrackableImageKey();
        String backKey = back.getTrackableImageKey();
        assertTrue(frontKey.startsWith("c:Delver of Secrets|"), frontKey);
        assertTrue(backKey.endsWith("$alt"), backKey);

        PaperCard pc = ImageUtil.getPaperCardFromImageKey(frontKey);
        Path frontFile = cardFile(pc.getCardImageKey());
        Path backFile = cardFile(pc.getCardAltImageKey());
        assertNotEquals(frontFile, backFile);

        assertEquals(ForgeImages.locate(frontKey).toPath().toRealPath(), frontFile.toRealPath());
        assertEquals(ForgeImages.locate(backKey).toPath().toRealPath(), backFile.toRealPath());
        assertTrue(CardImages.validKey(frontKey) && CardImages.validKey(backKey));
    }

    @Test
    public void tokenKeysUseTheTokenFolder() throws Exception {
        Path hidden = write("tokens/hidden.png");
        assertEquals(ForgeImages.locate("t:hidden").toPath().toRealPath(), hidden.toRealPath());
        Path soldier = write("tokens/w_1_1_soldier_TST.jpg");
        assertEquals(ForgeImages.locate("t:w_1_1_soldier|TST").toPath().toRealPath(), soldier.toRealPath());
    }

    @Test
    public void unknownCardsResolveToNothing() {
        assertNull(ForgeImages.locate("c:No Such Card Anywhere|XXX|1"));
    }

    @Test
    public void fullPathThroughTheEdtServesACachedCard() throws Exception {
        Game game = TestEngine.newGame(2);
        Card bear = TestEngine.add("Grizzly Bears", game.getPlayers().get(0), ZoneType.Hand);
        String key = bear.getView().getCurrentState().getTrackableImageKey();
        cardFile(ImageUtil.getPaperCardFromImageKey(key).getCardImageKey());
        Image img = ForgeImages.create().find(key).get(10, TimeUnit.SECONDS);
        assertEquals(img.bytes(), CardImagesTest.JPEG);
        assertEquals(img.contentType(), "image/jpeg");
    }

    @Test
    public void fetcherReportsAtOnceWhenItStartsNothing() throws Exception {
        HeadlessImageFetcher fetcher = new HeadlessImageFetcher();
        boolean was = FModel.getPreferences().getPrefBoolean(FPref.UI_ENABLE_ONLINE_IMAGE_FETCHER);
        try {
            FModel.getPreferences().setPref(FPref.UI_ENABLE_ONLINE_IMAGE_FETCHER, false);
            assertFalse(onEdt(fetcher, "c:Grizzly Bears|M10|1"), "fetching disabled");
            FModel.getPreferences().setPref(FPref.UI_ENABLE_ONLINE_IMAGE_FETCHER, true);
            assertFalse(onEdt(fetcher, "t:planechase"), "token key without a set: no URL");
        } finally {
            FModel.getPreferences().setPref(FPref.UI_ENABLE_ONLINE_IMAGE_FETCHER, was);
        }
    }

    private static boolean onEdt(HeadlessImageFetcher fetcher, String key) throws Exception {
        CompletableFuture<CompletableFuture<Boolean>> started = new CompletableFuture<>();
        FThreads.invokeInEdtLater(() -> started.complete(fetcher.fetch(key)));
        CompletableFuture<Boolean> done = started.get(5, TimeUnit.SECONDS);
        assertTrue(done.isDone(), "decided within the EDT call");
        return done.get();
    }
}
