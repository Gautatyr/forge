package forge.fork.desktop;

import forge.GuiDesktop;
import forge.Singletons;
import forge.gamemodes.match.HostedMatch;

/**
 * Forge's desktop GUI, except that matches are {@link WebHostedMatch}es: a lobby match's human plays in
 * the web match screen when {@link MatchScreenPref} is on. Everything else (lobby, deck editor, Swing
 * match screen) is the unchanged desktop app.
 */
public final class GuiDesktopWeb extends GuiDesktop {

    private final WebMatchHost host;
    private volatile MatchScreenPref pref;

    public GuiDesktopWeb(WebMatchHost host) {
        this.host = host;
    }

    WebMatchHost host() {
        return host;
    }

    /** Read on first use: its path comes from {@code ForgeConstants}, which needs this GUI installed first. */
    MatchScreenPref pref() {
        MatchScreenPref p = pref;
        if (p == null) {
            synchronized (this) {
                if (pref == null) {
                    pref = MatchScreenPref.inUserProfile();
                }
                p = pref;
            }
        }
        return p;
    }

    /** System property: the packaged app's install folder (holds {@code res/}); unset when run from the repo. */
    static final String ASSETS_PROPERTY = "forge.assets.dir";

    @Override
    public String getAssetsDir() {
        return assetsDir(System.getProperty(ASSETS_PROPERTY), super.getAssetsDir());
    }

    /** The packaged app passes its folder; the value must end with a separator ({@code ForgeConstants} appends {@code res/}). */
    static String assetsDir(String configured, String fallback) {
        if (configured == null || configured.isBlank()) {
            return fallback;
        }
        return configured.endsWith("/") || configured.endsWith("\\") ? configured : configured + java.io.File.separator;
    }

    @Override
    public HostedMatch hostMatch() {
        final HostedMatch match = new WebHostedMatch(host, () -> pref().enabled());
        Singletons.getControl().addMatch(match);
        return match;
    }
}
