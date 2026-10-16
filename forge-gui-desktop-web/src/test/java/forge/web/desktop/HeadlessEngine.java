package forge.web.desktop;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.function.Supplier;

import forge.gamemodes.match.HostedMatch;

/** Boots the engine once per test JVM, headless, with an isolated profile under target/. */
final class HeadlessEngine {

    /** What {@code hostMatch()} returns; a test sets it before pressing Start. */
    static volatile Supplier<HostedMatch> matches = HostedMatch::new;
    private static boolean booted;

    private HeadlessEngine() { }

    static synchronized void boot() {
        if (booted) {
            return;
        }
        String assets = Files.isDirectory(Paths.get("../forge-gui/res")) ? "../forge-gui/" : "forge-gui/";
        LobbyRun.boot(Path.of("target", "forge-home-test"), assets, () -> matches.get(), false); // full card database: Commander deck generation needs it
        booted = true;
    }
}
