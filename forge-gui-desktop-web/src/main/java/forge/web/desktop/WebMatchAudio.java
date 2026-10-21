package forge.web.desktop;

import java.awt.event.WindowAdapter;
import java.awt.event.WindowEvent;
import java.util.List;
import java.util.function.BooleanSupplier;

import javax.swing.JFrame;
import javax.swing.SwingUtilities;

import forge.game.event.GameEvent;
import forge.sound.MusicPlaylist;
import forge.sound.SoundSystem;

/**
 * Music and sounds of a web match, as in a Swing match (playtest 1).
 * <ul>
 *   <li>Sounds: a Swing match plays them from its {@code FControlGameEventHandler}; a web seat has
 *       none, so {@link #playSounds} gets the seat's game events ({@code WebSeats.setEventSink}).</li>
 *   <li>Music: {@code HostedMatch.startGame} starts the match playlist, but {@code FFrame} pauses all
 *       music when Forge's window loses focus to another application, which the browser is. During a
 *       web match the music resumes right after; when the match hands back to the lobby, the menu music
 *       plays (as {@code VMatchUI.onClosing}), paused if Forge's window is not focused.</li>
 * </ul>
 */
final class WebMatchAudio {

    /** What this class does to Forge's music ({@link SoundSystem} in the app). */
    interface Music {
        void resume();
        void pause();
        void menus();
    }

    private final BooleanSupplier webMatchRunning;
    private final BooleanSupplier windowActive;
    private final Music music;

    WebMatchAudio(BooleanSupplier webMatchRunning, BooleanSupplier windowActive, Music music) {
        this.webMatchRunning = webMatchRunning;
        this.windowActive = windowActive;
        this.music = music;
    }

    /** Forge's window lost focus (EDT, after {@code FFrame} paused the music). */
    void windowDeactivated() {
        if (webMatchRunning.getAsBoolean()) {
            music.resume();
        }
    }

    /** A web match handed back to the lobby (EDT). */
    void webMatchOver() {
        music.menus();
        if (!windowActive.getAsBoolean()) {
            music.pause();
        }
    }

    /** Forge's sound for each event, as {@code FControlGameEventHandler.receiveGameEvent} plays them. */
    static void playSounds(List<GameEvent> events) {
        for (GameEvent e : events) {
            SoundSystem.instance.receiveEvent(e);
        }
    }

    /** Wires the app's main window and the host to Forge's {@link SoundSystem} (EDT, once the window exists). */
    static void install(JFrame frame, WebMatchHost host) {
        SoundSystem sound = SoundSystem.instance;
        WebMatchAudio audio = new WebMatchAudio(host::webMatchRunning, frame::isActive, new Music() {
            @Override public void resume() { sound.resume(); }
            @Override public void pause() { sound.pause(); }
            @Override public void menus() { sound.setBackgroundMusic(MusicPlaylist.MENUS); }
        });
        frame.addWindowListener(new WindowAdapter() {
            @Override
            public void windowDeactivated(WindowEvent e) {
                // after every listener, FFrame's pause included
                SwingUtilities.invokeLater(audio::windowDeactivated);
            }
        });
        host.setOnWebMatchOver(() -> SwingUtilities.invokeLater(audio::webMatchOver));
        host.setEventSink(WebMatchAudio::playSounds);
    }
}
