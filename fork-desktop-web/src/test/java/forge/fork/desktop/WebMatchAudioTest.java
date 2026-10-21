package forge.fork.desktop;

import static org.testng.Assert.assertEquals;

import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

import org.testng.annotations.BeforeMethod;
import org.testng.annotations.Test;

import forge.fork.web.seat.WebSeats;

/**
 * Music and sounds of a web match (playtest 1): Forge pauses its music when its window loses focus to
 * another application (FFrame), and the browser is that application during a web match.
 */
public class WebMatchAudioTest {

    private final List<String> calls = new ArrayList<>();
    private boolean webMatch;
    private boolean windowActive = true;

    @BeforeMethod
    public void reset() {
        calls.clear();
        webMatch = false;
        windowActive = true;
    }

    private WebMatchAudio audio() {
        return new WebMatchAudio(() -> webMatch, () -> windowActive, new WebMatchAudio.Music() {
            @Override public void resume() { calls.add("resume"); }
            @Override public void pause() { calls.add("pause"); }
            @Override public void menus() { calls.add("menus"); }
        });
    }

    @Test
    public void keepsTheMusicPlayingWhenTheBrowserTakesFocusDuringAWebMatch() {
        WebMatchAudio a = audio();
        webMatch = true;
        windowActive = false;
        a.windowDeactivated(); // after FFrame paused the music
        assertEquals(calls, List.of("resume"));
    }

    @Test
    public void leavesForgesFocusRuleAloneOutsideAWebMatch() {
        WebMatchAudio a = audio();
        webMatch = false;
        windowActive = false;
        a.windowDeactivated();
        assertEquals(calls, List.of());
    }

    @Test
    public void backToTheLobbyPlaysTheMenuMusicPausedWhileForgeIsNotFocused() {
        WebMatchAudio a = audio();
        windowActive = false;
        a.webMatchOver();
        assertEquals(calls, List.of("menus", "pause"));
        calls.clear();
        windowActive = true;
        a.webMatchOver();
        assertEquals(calls, List.of("menus"));
    }

    @Test
    public void theHostReportsTheRunningWebMatchAndItsEnd() {
        WebMatchHost host = new WebMatchHost(new WebMatchHost.Options(0, Path.of("none"), WebSeats.Timeouts.DEFAULT, () -> null), url -> { });
        List<String> over = new ArrayList<>();
        host.setOnWebMatchOver(() -> over.add("over"));
        WebHostedMatch m = new WebHostedMatch(host, () -> true);
        host.webMatchStarted(m);
        assertEquals(host.webMatchRunning(), true);
        host.matchOver(m);
        assertEquals(host.webMatchRunning(), false);
        assertEquals(over, List.of("over"));
        host.matchOver(m); // already handed back: no second call
        assertEquals(over, List.of("over"));
    }
}
