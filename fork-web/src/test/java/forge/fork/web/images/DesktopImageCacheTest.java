package forge.fork.web.images;

import static org.testng.Assert.assertEquals;
import static org.testng.Assert.assertFalse;
import static org.testng.Assert.assertTrue;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Map;

import org.testng.annotations.Test;

/** The isolated profile's pics folder becomes a link to the desktop's, never losing files. */
public class DesktopImageCacheTest {

    private static final String LINUX = "Linux";

    @Test
    public void desktopFolderPerOs() {
        assertEquals(DesktopImageCache.desktopPics("/home/u", "Linux"), Paths.get("/home/u/.cache/forge/pics"));
        assertEquals(DesktopImageCache.desktopPics("/Users/u", "Mac OS X"), Paths.get("/Users/u/Library/Caches/Forge/pics"));
        assertEquals(DesktopImageCache.desktopPics("/h", "Windows 11", Map.of("LOCALAPPDATA", "/L", "APPDATA", "/A")::get),
                Paths.get("/L/Forge/Cache/pics"));
        assertEquals(DesktopImageCache.desktopPics("/h", "Windows 11", Map.of("APPDATA", "/A")::get), Paths.get("/A/Forge/Cache/pics"));
        assertEquals(DesktopImageCache.desktopPics("/h", "Windows 11", Map.<String, String>of()::get),
                Paths.get("/h/.forge/Forge/Cache/pics"));
    }

    @Test
    public void freshProfileLinksToTheDesktopFolderAndCreatesIt() throws Exception {
        Path home = Files.createTempDirectory("forge-web-home");
        Path desktop = Files.createTempDirectory("forge-web-desktop").resolve("pics");
        DesktopImageCache.link(home, desktop, LINUX);
        Path link = home.resolve(".cache/forge/pics");
        assertTrue(Files.isSymbolicLink(link));
        assertTrue(Files.isDirectory(desktop));
        Files.writeString(desktop.resolve("x.jpg"), "x");
        assertTrue(Files.exists(link.resolve("x.jpg")));
        // idempotent
        DesktopImageCache.link(home, desktop, LINUX);
        assertTrue(Files.isSameFile(link, desktop));
    }

    @Test
    public void emptyFolderTreeIsReplacedButFilesAreKept() throws Exception {
        Path desktop = Files.createTempDirectory("forge-web-desktop");
        Path empty = Files.createTempDirectory("forge-web-home");
        Files.createDirectories(empty.resolve(".cache/forge/pics/cards"));
        Files.createDirectories(empty.resolve(".cache/forge/pics/tokens"));
        DesktopImageCache.link(empty, desktop, LINUX);
        assertTrue(Files.isSymbolicLink(empty.resolve(".cache/forge/pics")));

        Path used = Files.createTempDirectory("forge-web-home");
        Path own = used.resolve(".cache/forge/pics/cards/M19/Island.full.jpg");
        Files.createDirectories(own.getParent());
        Files.writeString(own, "mine");
        String said = DesktopImageCache.link(used, desktop, LINUX);
        assertFalse(Files.isSymbolicLink(used.resolve(".cache/forge/pics")));
        assertEquals(Files.readString(own), "mine");
        assertTrue(said.contains("not linked"), said);
    }

    @Test
    public void linkToAnotherFolderIsRepointed() throws Exception {
        Path home = Files.createTempDirectory("forge-web-home");
        Path first = Files.createTempDirectory("forge-web-a");
        Path second = Files.createTempDirectory("forge-web-b");
        DesktopImageCache.link(home, first, LINUX);
        DesktopImageCache.link(home, second, LINUX);
        assertTrue(Files.isSameFile(home.resolve(".cache/forge/pics"), second));
        assertTrue(Files.isDirectory(first), "the old target is left alone");
    }

    /** A profile link whose old --image-cache folder was deleted is repointed, not reported as an error. */
    @Test
    public void danglingProfileLinkIsRepointed() throws Exception {
        Path home = Files.createTempDirectory("forge-web-home");
        Path old = Files.createTempDirectory("forge-web-old");
        Path desktop = Files.createTempDirectory("forge-web-desktop");
        DesktopImageCache.link(home, old, LINUX);
        Files.delete(old);
        String said = DesktopImageCache.link(home, desktop, LINUX);
        assertEquals(said, "image cache " + desktop);
        assertTrue(Files.isSameFile(home.resolve(".cache/forge/pics"), desktop));
    }

    /** --image-cache <home>/.cache/forge/pics, or --home ~ with no desktop cache yet: never a self-link. */
    @Test
    public void targetThatIsTheProfileFolderIsUsedAsIs() throws Exception {
        for (boolean exists : new boolean[] {false, true}) {
            Path home = Files.createTempDirectory("forge-web-home");
            Path pics = home.resolve(".cache/forge/pics");
            if (exists) {
                Files.createDirectories(pics.resolve("cards"));
            }
            for (int run = 0; run < 2; run++) {
                String said = DesktopImageCache.link(home, home.resolve(".cache/forge/../forge/pics"), LINUX);
                assertFalse(Files.isSymbolicLink(pics), said);
                assertTrue(Files.isDirectory(pics), said);
                assertEquals(said, "image cache " + pics);
            }
            Files.createDirectories(pics.resolve("cards/M19"));
            assertTrue(Files.isDirectory(pics.resolve("cards/M19")));
        }
    }

    /** --home ~ where the user made ~/.cache/forge/pics a symlink (cache on another disk): the link is kept as it is. */
    @Test
    public void targetThatIsTheProfileFolderKeepsAUserSymlink() throws Exception {
        Path home = Files.createTempDirectory("forge-web-home");
        Path big = Files.createTempDirectory("forge-web-big");
        Files.createDirectories(big.resolve("cards"));
        Files.writeString(big.resolve("cards/x.jpg"), "x");
        Path pics = home.resolve(".cache/forge/pics");
        Files.createDirectories(pics.getParent());
        Files.createSymbolicLink(pics, big);

        for (int run = 0; run < 2; run++) {
            String said = DesktopImageCache.link(home, DesktopImageCache.desktopPics(home.toString(), LINUX), LINUX);
            assertTrue(Files.isSymbolicLink(pics), said);
            assertEquals(Files.readSymbolicLink(pics), big, said);
            assertEquals(Files.readString(pics.resolve("cards/x.jpg")), "x", said);
            assertEquals(said, "image cache " + pics);
        }
    }

    /** A symlink there whose target is gone is reported and left alone, never deleted. */
    @Test
    public void targetThatIsTheProfileFolderLeavesADanglingSymlink() throws Exception {
        Path home = Files.createTempDirectory("forge-web-home");
        Path gone = Files.createTempDirectory("forge-web-gone");
        Files.delete(gone);
        Path pics = home.resolve(".cache/forge/pics");
        Files.createDirectories(pics.getParent());
        Files.createSymbolicLink(pics, gone);

        String said = DesktopImageCache.link(home, pics, LINUX);
        assertTrue(Files.isSymbolicLink(pics), said);
        assertEquals(Files.readSymbolicLink(pics), gone, said);
        assertTrue(said.contains("cannot use"), said);
    }

    @Test
    public void targetInsideTheProfileFolderIsRefused() throws Exception {
        Path home = Files.createTempDirectory("forge-web-home");
        Path pics = home.resolve(".cache/forge/pics");
        String said = DesktopImageCache.link(home, pics.resolve("sub"), LINUX);
        assertFalse(Files.isSymbolicLink(pics), said);
        assertTrue(said.contains("cannot link"), said);
    }

    @Test
    public void macOsLinksTheEnginesCacheFolder() throws Exception {
        Path home = Files.createTempDirectory("forge-web-home");
        Path desktop = Files.createTempDirectory("forge-web-desktop");
        String said = DesktopImageCache.link(home, desktop, "Mac OS X");
        Path link = home.resolve("Library/Caches/Forge/pics");
        assertTrue(Files.isSymbolicLink(link), said);
        assertTrue(Files.isSameFile(link, desktop));
        assertFalse(Files.exists(home.resolve(".cache")), "no Linux-layout link on macOS");
        assertEquals(said, "image cache " + desktop);
    }

    /** On Windows the engine's cache comes from %LOCALAPPDATA%, not user.home: nothing to link. */
    @Test
    public void windowsUsesTheDesktopCacheAndIgnoresTheOverride() throws Exception {
        Path home = Files.createTempDirectory("forge-web-home");
        Path local = Files.createTempDirectory("forge-web-localappdata");
        Map<String, String> env = Map.of("LOCALAPPDATA", local.toString());
        Path engine = local.resolve("Forge/Cache/pics");

        String said = DesktopImageCache.link(home, engine, "Windows 11", env::get);
        assertEquals(said, "image cache " + engine);

        Path other = Files.createTempDirectory("forge-web-other");
        said = DesktopImageCache.link(home, other, "Windows 11", env::get);
        assertTrue(said.startsWith("image cache " + engine), said);
        assertTrue(said.contains("--image-cache is not supported"), said);

        try (var s = Files.list(home)) {
            assertEquals(s.count(), 0L, "nothing created in the profile");
        }
        assertFalse(Files.exists(engine), "the desktop folder is the engine's to create");
    }

    /** Without %APPDATA%/%LOCALAPPDATA% the engine falls back to user.home, so the link goes there. */
    @Test
    public void windowsWithoutAppDataLinksUnderTheProfile() throws Exception {
        Path home = Files.createTempDirectory("forge-web-home");
        Path desktop = Files.createTempDirectory("forge-web-desktop");
        DesktopImageCache.link(home, desktop, "Windows 11", Map.<String, String>of()::get);
        Path link = home.resolve(".forge/Forge/Cache/pics");
        assertTrue(Files.isSymbolicLink(link));
        assertTrue(Files.isSameFile(link, desktop));
    }
}
