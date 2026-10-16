package forge.web;

import java.io.File;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.function.Consumer;
import java.util.function.Supplier;

import org.jupnp.UpnpServiceConfiguration;

import forge.gamemodes.match.HostedMatch;
import forge.gui.download.GuiDownloadService;
import forge.gui.interfaces.IGuiBase;
import forge.gui.interfaces.IGuiGame;
import forge.item.PaperCard;
import forge.localinstance.skin.FSkinProp;
import forge.localinstance.skin.ISkinImage;
import forge.sound.IAudioClip;
import forge.sound.IAudioMusic;
import forge.util.BuildInfo;
import forge.util.FSerializableFunction;
import forge.util.ImageFetcher;

/**
 * {@link IGuiBase} for a headless server: no AWT, no Swing, no audio. A single daemon thread
 * stands in for the EDT so {@code FThreads.invokeInEdt*} keeps its ordering guarantees.
 * Dialogs log and return a non-destructive default (same contract as the desktop test harness).
 */
public final class HeadlessWebGui implements IGuiBase {

    private final String assetsDir;
    private final Supplier<IGuiGame> guiFactory;
    private final Supplier<HostedMatch> matchFactory;
    private volatile Thread edtThread;
    private final ExecutorService edt = Executors.newSingleThreadExecutor(r -> {
        Thread t = new Thread(r, "web-edt");
        t.setDaemon(true);
        edtThread = t;
        return t;
    });
    private final ImageFetcher imageFetcher = new ImageFetcher() {
        @Override
        protected Runnable getDownloadTask(String[] toArray, String destPath, Runnable notifyObservers) {
            return () -> { };
        }
    };

    public HeadlessWebGui(String assetsDir, Supplier<IGuiGame> guiFactory) {
        this(assetsDir, guiFactory, HostedMatch::new);
    }

    /** @param matchFactory what {@link #hostMatch()} returns (a launcher's own {@code HostedMatch}) */
    public HeadlessWebGui(String assetsDir, Supplier<IGuiGame> guiFactory, Supplier<HostedMatch> matchFactory) {
        this.assetsDir = assetsDir;
        this.guiFactory = guiFactory;
        this.matchFactory = matchFactory;
    }

    @Override public boolean isRunningOnDesktop() { return true; }
    @Override public boolean isLibgdxPort() { return false; }
    @Override public String getCurrentVersion() { return BuildInfo.getVersionString(); }
    @Override public String getAssetsDir() { return assetsDir; }
    @Override public ImageFetcher getImageFetcher() { return imageFetcher; }

    @Override public void invokeInEdtNow(Runnable runnable) { runnable.run(); }
    @Override public void invokeInEdtLater(Runnable runnable) { edt.execute(runnable); }

    @Override
    public void invokeInEdtAndWait(Runnable proc) {
        if (isGuiThread()) {
            proc.run();
            return;
        }
        try {
            edt.submit(proc).get();
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new RuntimeException(e);
        } catch (java.util.concurrent.ExecutionException e) {
            throw new RuntimeException(e.getCause());
        }
    }

    @Override
    public void runBackgroundTask(String message, Runnable task) {
        Thread t = new Thread(task, "web-bg");
        t.setDaemon(true);
        t.start();
    }

    @Override public boolean isGuiThread() { return Thread.currentThread() == edtThread; }

    @Override public ISkinImage getSkinIcon(FSkinProp skinProp) { return null; }
    @Override public ISkinImage getUnskinnedIcon(String path) { return null; }
    @Override public ISkinImage getCardArt(PaperCard card, boolean backFace) { return null; }
    @Override public ISkinImage createLayeredImage(PaperCard card, FSkinProp background, String overlayFilename, float opacity) { return null; }
    @Override public void clearImageCache() { }
    @Override public String encodeSymbols(String str, boolean formatReminderText) { return str; }
    @Override public int getAvatarCount() { return 0; }
    @Override public int getSleevesCount() { return 0; }
    @Override public float getScreenScale() { return 1f; }
    @Override public void preventSystemSleep(boolean preventSleep) { }
    @Override public void download(GuiDownloadService service, Consumer<Boolean> callback) { callback.accept(false); }
    @Override public void copyToClipboard(String text) { }
    @Override public void browseToUrl(String url) { }

    @Override public void showCardList(String title, String message, List<PaperCard> list) { log(title, message); }
    @Override public boolean showBoxedProduct(String title, String message, List<PaperCard> list) { log(title, message); return false; }
    @Override public void showBugReportDialog(String title, String text, boolean showExitAppBtn) { log(title, text); }
    @Override public void showImageDialog(ISkinImage image, String message, String title) { log(title, message); }

    @Override
    public int showOptionDialog(String message, String title, FSkinProp icon, List<String> options, int defaultOption) {
        log(title, message + " " + options + " -> dismissed");
        // -1, not defaultOption: index 0 often means "Yes", and a headless server must never auto-approve
        return -1;
    }

    @Override
    public String showInputDialog(String message, String title, FSkinProp icon, String initialInput, List<String> inputOptions, boolean isNumeric) {
        log(title, message);
        if (initialInput != null) { return initialInput; }
        if (inputOptions != null && !inputOptions.isEmpty()) { return inputOptions.get(0); }
        return isNumeric ? "0" : "";
    }

    @Override public String showFileDialog(String title, String defaultDir) { return null; }
    @Override public File getSaveFile(File defaultFile) { return null; }

    @Override
    public <T> List<T> order(String title, String top, int remainingObjectsMin, int remainingObjectsMax, List<T> sourceChoices, List<T> destChoices) {
        return new ArrayList<>(sourceChoices);
    }

    @Override
    public <T> List<T> getChoices(String message, int min, int max, Collection<T> choices, Collection<T> selected, FSerializableFunction<T, String> display) {
        List<T> l = new ArrayList<>(choices);
        return new ArrayList<>(l.subList(0, Math.min(min, l.size())));
    }

    @Override public PaperCard chooseCard(String title, String message, List<PaperCard> list) { return null; }

    @Override public boolean isSupportedAudioFormat(File file) { return false; }
    @Override public IAudioClip createAudioClip(String filename) { return null; }
    @Override public IAudioMusic createAudioMusic(String filename) { return null; }
    @Override public void startAltSoundSystem(String filename, boolean isSynchronized) { }
    @Override public void showSpellShop() { }
    @Override public void showBazaar() { }

    @Override public IGuiGame getNewGuiGame() { return guiFactory.get(); }
    @Override public HostedMatch hostMatch() { return matchFactory.get(); }
    @Override public UpnpServiceConfiguration getUpnpPlatformService() { return null; }
    @Override public boolean hasNetGame() { return false; }

    private static void log(String title, String message) {
        System.out.println("[web-gui] " + title + ": " + message);
    }
}
