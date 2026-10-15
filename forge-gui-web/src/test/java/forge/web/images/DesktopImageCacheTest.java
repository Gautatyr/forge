package forge.web.images;

import static org.testng.Assert.assertEquals;
import static org.testng.Assert.assertFalse;
import static org.testng.Assert.assertTrue;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;

import org.testng.annotations.Test;

/** The isolated profile's pics folder becomes a link to the desktop's, never losing files. */
public class DesktopImageCacheTest {

    @Test
    public void desktopFolderPerOs() {
        assertEquals(DesktopImageCache.desktopPics("/home/u", "Linux"), Paths.get("/home/u/.cache/forge/pics"));
        assertEquals(DesktopImageCache.desktopPics("/Users/u", "Mac OS X"), Paths.get("/Users/u/Library/Caches/Forge/pics"));
    }

    @Test
    public void freshProfileLinksToTheDesktopFolderAndCreatesIt() throws Exception {
        Path home = Files.createTempDirectory("forge-web-home");
        Path desktop = Files.createTempDirectory("forge-web-desktop").resolve("pics");
        DesktopImageCache.link(home, desktop);
        Path link = home.resolve(".cache/forge/pics");
        assertTrue(Files.isSymbolicLink(link));
        assertTrue(Files.isDirectory(desktop));
        Files.writeString(desktop.resolve("x.jpg"), "x");
        assertTrue(Files.exists(link.resolve("x.jpg")));
        // idempotent
        DesktopImageCache.link(home, desktop);
        assertTrue(Files.isSameFile(link, desktop));
    }

    @Test
    public void emptyFolderTreeIsReplacedButFilesAreKept() throws Exception {
        Path desktop = Files.createTempDirectory("forge-web-desktop");
        Path empty = Files.createTempDirectory("forge-web-home");
        Files.createDirectories(empty.resolve(".cache/forge/pics/cards"));
        Files.createDirectories(empty.resolve(".cache/forge/pics/tokens"));
        DesktopImageCache.link(empty, desktop);
        assertTrue(Files.isSymbolicLink(empty.resolve(".cache/forge/pics")));

        Path used = Files.createTempDirectory("forge-web-home");
        Path own = used.resolve(".cache/forge/pics/cards/M19/Island.full.jpg");
        Files.createDirectories(own.getParent());
        Files.writeString(own, "mine");
        String said = DesktopImageCache.link(used, desktop);
        assertFalse(Files.isSymbolicLink(used.resolve(".cache/forge/pics")));
        assertEquals(Files.readString(own), "mine");
        assertTrue(said.contains("not linked"), said);
    }

    @Test
    public void linkToAnotherFolderIsRepointed() throws Exception {
        Path home = Files.createTempDirectory("forge-web-home");
        Path first = Files.createTempDirectory("forge-web-a");
        Path second = Files.createTempDirectory("forge-web-b");
        DesktopImageCache.link(home, first);
        DesktopImageCache.link(home, second);
        assertTrue(Files.isSameFile(home.resolve(".cache/forge/pics"), second));
        assertTrue(Files.isDirectory(first), "the old target is left alone");
    }
}
