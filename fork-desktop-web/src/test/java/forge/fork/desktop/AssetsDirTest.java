package forge.fork.desktop;

import java.io.File;

import org.testng.Assert;
import org.testng.annotations.Test;

public class AssetsDirTest {

    @Test
    public void unsetKeepsDesktopDefault() {
        Assert.assertEquals(GuiDesktopWeb.assetsDir(null, "../forge-gui/"), "../forge-gui/");
        Assert.assertEquals(GuiDesktopWeb.assetsDir("  ", ""), "");
    }

    @Test
    public void configuredFolderEndsWithSeparator() {
        Assert.assertEquals(GuiDesktopWeb.assetsDir("/opt/forge/app/", "x"), "/opt/forge/app/");
        Assert.assertEquals(GuiDesktopWeb.assetsDir("C:\\Forge\\app\\", "x"), "C:\\Forge\\app\\");
        Assert.assertEquals(GuiDesktopWeb.assetsDir("/opt/forge/app", "x"), "/opt/forge/app" + File.separator);
    }
}
