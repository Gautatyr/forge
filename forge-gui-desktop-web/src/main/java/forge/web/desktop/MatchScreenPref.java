package forge.web.desktop;

import java.io.IOException;
import java.io.Reader;
import java.io.Writer;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Properties;

import forge.localinstance.properties.ForgeConstants;

/**
 * "Use the new match screen": lobby matches open in the web match screen (default) or in Forge's
 * Swing match screen. Kept in a fork-owned file beside Forge's preferences, never in
 * {@code forge.preferences} (an upstream file format).
 */
public final class MatchScreenPref {

    static final String FILE_NAME = "fork-web.preferences";
    static final String KEY = "useNewMatchScreen";

    private final Path file;
    private volatile boolean enabled;

    public MatchScreenPref(Path file) {
        this.file = file;
        this.enabled = read(file);
    }

    /** The file in the user's Forge profile ({@code <user dir>/preferences/fork-web.preferences}). */
    public static MatchScreenPref inUserProfile() {
        return new MatchScreenPref(Paths.get(ForgeConstants.USER_PREFS_DIR, FILE_NAME));
    }

    public boolean enabled() {
        return enabled;
    }

    /** Applies at once; written to the file (a write failure is logged, the choice still holds for this run). */
    public void set(boolean on) {
        enabled = on;
        Properties p = new Properties();
        p.setProperty(KEY, Boolean.toString(on));
        try {
            Files.createDirectories(file.getParent());
            try (Writer w = Files.newBufferedWriter(file, StandardCharsets.UTF_8)) {
                p.store(w, "Forge fork: lobby matches in the web match screen");
            }
        } catch (IOException e) {
            System.err.println("[web] cannot save " + file + ": " + e);
        }
    }

    private static boolean read(Path file) {
        if (!Files.isRegularFile(file)) {
            return true;
        }
        Properties p = new Properties();
        try (Reader r = Files.newBufferedReader(file, StandardCharsets.UTF_8)) {
            p.load(r);
        } catch (IOException | IllegalArgumentException e) {
            System.err.println("[web] cannot read " + file + ": " + e);
            return true;
        }
        String v = p.getProperty(KEY, "").trim();
        return !"false".equalsIgnoreCase(v);
    }
}
