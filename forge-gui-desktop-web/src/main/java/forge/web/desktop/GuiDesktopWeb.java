package forge.web.desktop;

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

    @Override
    public HostedMatch hostMatch() {
        final HostedMatch match = new WebHostedMatch(host, () -> pref().enabled());
        Singletons.getControl().addMatch(match);
        return match;
    }
}
