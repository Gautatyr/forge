package forge.fork.web.images;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.function.UnaryOperator;
import java.util.stream.Stream;

/**
 * Shares the desktop app's card image folder with the isolated web profile: the engine's {@code pics}
 * folder under the profile ({@link #desktopPics} with the profile as home) becomes a symlink to the
 * desktop's {@code pics} folder, so Forge's own {@code ImageKeys}/{@code ImageFetcher} read and fill the
 * same cache. Only {@code pics} is shared. Call before {@code FModel.initialize}, while
 * {@code user.home} is still the real home.
 */
public final class DesktopImageCache {

    private DesktopImageCache() { }

    /** The engine's {@code pics} folder for this OS and home, as {@code ForgeProfileProperties.getDefaultDirs} derives it. */
    public static Path desktopPics(String home, String osName) {
        return desktopPics(home, osName, System::getenv);
    }

    static Path desktopPics(String home, String osName, UnaryOperator<String> env) {
        String os = osName == null ? "" : osName.toLowerCase(Locale.ROOT);
        if (os.contains("windows")) {
            String app = env.apply("APPDATA");
            String appRoot = app != null && !app.isEmpty() ? app : home + "/.forge";
            String local = env.apply("LOCALAPPDATA");
            String cacheRoot = local != null && !local.isEmpty() ? local : appRoot;
            return Paths.get(cacheRoot, "Forge", "Cache", "pics");
        }
        if (os.contains("mac os x")) {
            return Paths.get(home, "Library", "Caches", "Forge", "pics");
        }
        return Paths.get(home, ".cache", "forge", "pics");
    }

    /** {@link #link(Path, Path, String, UnaryOperator)} with the process environment. */
    public static String link(Path profileHome, Path target, String osName) {
        return link(profileHome, target, osName, System::getenv);
    }

    /**
     * Points the engine's {@code pics} folder under {@code profileHome} at {@code target} (created if
     * missing). An existing folder there is replaced only if it holds no files; otherwise it is kept and
     * used. A target that is that folder itself is used as it is (never a self-link; a symlink there is
     * kept). When the
     * engine's folder does not derive from the home (Windows with {@code %LOCALAPPDATA%}/{@code %APPDATA%}),
     * it already is the desktop's: nothing is linked and {@code target} is ignored.
     *
     * @return a one-line description of the cache in use
     */
    static String link(Path profileHome, Path target, String osName, UnaryOperator<String> env) {
        Path home = profileHome.toAbsolutePath().normalize();
        Path link = desktopPics(home.toString(), osName, env).toAbsolutePath().normalize();
        Path to = target.toAbsolutePath().normalize();
        if (!link.startsWith(home)) {
            return "image cache " + link
                    + (to.equals(link) ? "" : " (the desktop app's; --image-cache is not supported on this OS)");
        }
        String inside = "image cache " + link + " (cannot link to " + to + ": it is inside " + link + ")";
        try {
            if (to.equals(link)) {
                // used as it is: a symlink there may be the user's own (e.g. --home ~), never delete it
                if (Files.isSymbolicLink(link) && !Files.isDirectory(link)) {
                    return "image cache " + link + " (cannot use: symlink to " + Files.readSymbolicLink(link)
                            + ", which is not a folder)";
                }
                Files.createDirectories(link);
                return "image cache " + link;
            }
            if (to.startsWith(link)) {
                return inside;
            }
            Files.createDirectories(to);
            if (Files.isSymbolicLink(link)) {
                if (Files.exists(link) && Files.isSameFile(link, to)) {
                    return "image cache " + to;
                }
                Files.delete(link); // the profile's own link, repointed (dangling or elsewhere)
            } else if (Files.exists(link, LinkOption.NOFOLLOW_LINKS)) {
                // the same folder reached through another path (a symlinked parent): use it as it is
                if (Files.isSameFile(link, to)) {
                    return "image cache " + link;
                }
                if (to.toRealPath().startsWith(link.toRealPath())) {
                    return inside;
                }
                if (holdsFiles(link)) {
                    return "image cache " + link + " (own files; not linked to " + to + ")";
                }
                deleteTree(link);
            }
            Files.createDirectories(link.getParent());
            Files.createSymbolicLink(link, to);
            return "image cache " + to;
        } catch (IOException | UnsupportedOperationException e) {
            return "image cache " + link + " (cannot link to " + to + ": " + e.getMessage() + ")";
        }
    }

    private static boolean holdsFiles(Path dir) throws IOException {
        try (Stream<Path> s = Files.walk(dir)) {
            return s.anyMatch(p -> !Files.isDirectory(p, LinkOption.NOFOLLOW_LINKS));
        }
    }

    private static void deleteTree(Path dir) throws IOException {
        List<Path> all;
        try (Stream<Path> s = Files.walk(dir)) {
            all = s.sorted(Comparator.reverseOrder()).toList();
        }
        for (Path p : all) {
            Files.delete(p);
        }
    }
}
