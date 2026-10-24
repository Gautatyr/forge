package forge.fork.desktop;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.HashMap;
import java.util.Map;
import java.util.function.Consumer;

import javax.swing.SwingUtilities;

import forge.Singletons;
import forge.error.ExceptionHandler;
import forge.gui.GuiBase;
import forge.fork.web.seat.WebSeats;

/**
 * Launcher: Forge's desktop app (lobby, deck selection, deck editor) whose lobby matches open in the web
 * match screen, in the system browser, while "Use the new match screen" (menu bar checkbox) is on. The
 * bridge server runs in this process on 127.0.0.1. Uses the normal Forge profile (decks, preferences).
 * Unlike upstream's {@code forge.view.Main}, no crash reporting (Sentry) is set up.
 *
 * <pre>
 * --port P         bridge port (default 47321, fixed so the page's saved settings survive a restart; a free
 *                  port when taken; 0: always a free port)
 * --web-root DIR   built frontend to serve (default: fork-web/frontend/dist, found from the working dir)
 * --no-browser     print the match screen URL instead of opening the browser
 * </pre>
 * Run from the {@code fork-desktop-web} directory (assets are found in {@code ../forge-gui/}): {@code make play}.
 */
public final class Main {

    private Main() { }

    public static void main(String[] args) {
        Thread.setDefaultUncaughtExceptionHandler((t, ex) -> {
            System.err.println("Uncaught exception in thread " + t.getName() + ":");
            ex.printStackTrace();
        });
        Map<String, String> opt = parse(args);
        System.setProperty("java.util.Arrays.useLegacyMergeSort", "true");
        System.setProperty("sun.java2d.d3d", "false");

        Consumer<String> openPage = opt.containsKey("no-browser")
                ? url -> System.out.println("[web] open the match screen at " + url)
                : BrowserOpener::open;
        WebMatchHost host = new WebMatchHost(WebMatchHost.Options.launcher(opt.get("port"),
                webRoot(opt.get("web-root")), WebSeats.Timeouts.DEFAULT), openPage);
        GuiDesktopWeb gui = new GuiDesktopWeb(host);
        GuiBase.setInterface(gui);
        ExceptionHandler.registerErrorHandling();
        GuiBase.logHWInfo();

        Singletons.initializeOnce(true);
        Singletons.getControl().initialize();
        installToggle(gui, 20);
    }

    /** After the main window is built (queued on the EDT by {@code FControl.initialize}). */
    private static void installToggle(GuiDesktopWeb gui, int tries) {
        SwingUtilities.invokeLater(() -> {
            if (Singletons.getView().getNavigationBar() == null) {
                if (tries > 0) {
                    installToggle(gui, tries - 1);
                } else {
                    System.err.println("[web] no menu bar: the match screen toggle is not shown");
                }
                return;
            }
            MatchScreenToggle.install(gui.pref());
            WebMatchAudio.install(Singletons.getView().getFrame(), gui.host());
        });
    }

    static Path webRoot(String arg) {
        if (arg != null) {
            return Paths.get(arg).toAbsolutePath();
        }
        for (String p : new String[] {"../fork-web/frontend/dist", "fork-web/frontend/dist"}) {
            if (Files.isDirectory(Paths.get(p))) {
                return Paths.get(p).toAbsolutePath();
            }
        }
        return Paths.get("../fork-web/frontend/dist").toAbsolutePath();
    }

    private static Map<String, String> parse(String[] args) {
        Map<String, String> m = new HashMap<>();
        for (int i = 0; i < args.length; i++) {
            if (!args[i].startsWith("--")) {
                continue;
            }
            String k = args[i].substring(2);
            if (i + 1 < args.length && !args[i + 1].startsWith("--")) {
                m.put(k, args[++i]);
            } else {
                m.put(k, "true");
            }
        }
        return m;
    }
}
