package forge.web.bridge;

import static org.testng.Assert.assertEquals;

import org.testng.annotations.Test;
import org.tinylog.configuration.Configuration;

/**
 * The delta engine logs every flush at INFO under the NETWORK tag. The module's own
 * tinylog.properties must win over forge-gui's and keep that tag off the console below WARN.
 * (tinylog's console writer holds the stdout stream it started with, so stdout cannot be captured here.)
 */
public class LoggingConfigTest {

    @Test
    public void networkTagIsOffTheConsoleBelowWarn() {
        assertEquals(Configuration.get("writerdefault"), "console");
        assertEquals(Configuration.get("writerdefault.tag"), "-, ENGINE, GUI, AI");
        assertEquals(Configuration.get("writerNetConsole"), "console");
        assertEquals(Configuration.get("writerNetConsole.tag"), "NETWORK");
        assertEquals(Configuration.get("writerNetConsole.level"), "warn");
    }
}
