package forge.web.images;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.stream.Stream;

/**
 * Shares the desktop app's card image folder with the isolated web profile: the profile's
 * {@code <home>/.cache/forge/pics} becomes a symlink to the desktop's {@code pics} folder, so Forge's
 * own {@code ImageKeys}/{@code ImageFetcher} read and fill the same cache. Only {@code pics} is
 * shared; {@code ~/.forge} (preferences, decks) stays untouched. Call before {@code FModel.initialize}.
 */
public final class DesktopImageCache {

    private DesktopImageCache() { }

    /** The desktop app's {@code pics} folder for this OS and real home (as {@code ForgeProfileProperties} derives it). */
    public static Path desktopPics(String realHome, String osName) {
        String os = osName == null ? "" : osName.toLowerCase(Locale.ROOT);
        if (os.contains("windows")) {
            String local = System.getenv("LOCALAPPDATA");
            String app = System.getenv("APPDATA");
            String root = local != null && !local.isEmpty() ? local : app != null && !app.isEmpty() ? app : realHome + "/.forge";
            return Paths.get(root, "Forge", "Cache", "pics");
        }
        if (os.contains("mac os x")) {
            return Paths.get(realHome, "Library", "Caches", "Forge", "pics");
        }
        return Paths.get(realHome, ".cache", "forge", "pics");
    }

    /**
     * Points {@code <profileHome>/.cache/forge/pics} at {@code target} (created if missing). An
     * existing folder there is replaced only if it holds no files; otherwise it is kept and used.
     *
     * @return a one-line description of the cache in use
     */
    public static String link(Path profileHome, Path target) {
        Path link = profileHome.resolve(".cache").resolve("forge").resolve("pics");
        try {
            Files.createDirectories(target);
            if (Files.isSymbolicLink(link)) {
                if (Files.isSameFile(link, target)) {
                    return "image cache " + target;
                }
                Files.delete(link);
            } else if (Files.exists(link, LinkOption.NOFOLLOW_LINKS)) {
                if (holdsFiles(link)) {
                    return "image cache " + link + " (own files; not linked to " + target + ")";
                }
                deleteTree(link);
            }
            Files.createDirectories(link.getParent());
            Files.createSymbolicLink(link, target);
            return "image cache " + target;
        } catch (IOException | UnsupportedOperationException e) {
            return "image cache " + link + " (cannot link to " + target + ": " + e.getMessage() + ")";
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
