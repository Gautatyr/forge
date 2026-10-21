package forge.fork.desktop;

import static org.testng.Assert.assertFalse;
import static org.testng.Assert.assertTrue;

import java.nio.file.Files;
import java.nio.file.Path;

import org.testng.annotations.Test;

public class MatchScreenPrefTest {

    @Test
    public void defaultsToTheNewScreenWithoutWritingAnything() throws Exception {
        Path file = Files.createTempDirectory("forge-pref").resolve("preferences").resolve("fork-web.preferences");
        MatchScreenPref pref = new MatchScreenPref(file);
        assertTrue(pref.enabled());
        assertFalse(Files.exists(file));
    }

    @Test
    public void choiceIsSavedAndReadBack() throws Exception {
        Path file = Files.createTempDirectory("forge-pref").resolve("preferences").resolve("fork-web.preferences");
        new MatchScreenPref(file).set(false);
        assertTrue(Files.readString(file).contains("useNewMatchScreen=false"));
        assertFalse(new MatchScreenPref(file).enabled());
        new MatchScreenPref(file).set(true);
        assertTrue(new MatchScreenPref(file).enabled());
    }

    @Test
    public void unreadableValueFallsBackToTheDefault() throws Exception {
        Path file = Files.createTempDirectory("forge-pref").resolve("fork-web.preferences");
        Files.writeString(file, "useNewMatchScreen=maybe\n");
        assertTrue(new MatchScreenPref(file).enabled());
        Files.writeString(file, "\u0000garbage");
        assertTrue(new MatchScreenPref(file).enabled());
    }
}
