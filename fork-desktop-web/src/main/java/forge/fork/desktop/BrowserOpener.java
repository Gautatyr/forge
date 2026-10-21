package forge.fork.desktop;

import java.awt.Desktop;
import java.net.URI;
import java.util.List;
import java.util.Locale;

/** Opens a URL in the system browser, off the caller's thread: AWT {@link Desktop} when it can, else the OS opener. */
final class BrowserOpener {

    private BrowserOpener() { }

    static void open(String url) {
        System.out.println("[web] opening the match screen: " + url);
        Thread t = new Thread(() -> {
            try {
                if (Desktop.isDesktopSupported() && Desktop.getDesktop().isSupported(Desktop.Action.BROWSE)) {
                    Desktop.getDesktop().browse(URI.create(url));
                    return;
                }
            } catch (Exception | LinkageError e) {
                System.err.println("[web] AWT browse failed (" + e + "), trying the OS opener");
            }
            try {
                new ProcessBuilder(command(url)).inheritIO().start();
            } catch (Exception e) {
                System.err.println("[web] cannot open a browser (" + e + "); open this URL yourself: " + url);
            }
        }, "web-browser-open");
        t.setDaemon(true);
        t.start();
    }

    private static List<String> command(String url) {
        String os = System.getProperty("os.name", "").toLowerCase(Locale.ROOT);
        if (os.contains("win")) {
            return List.of("rundll32", "url.dll,FileProtocolHandler", url);
        }
        if (os.contains("mac")) {
            return List.of("open", url);
        }
        return List.of("xdg-open", url);
    }
}
