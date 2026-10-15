package forge.web.bridge.visibility;

import static org.testng.Assert.assertFalse;
import static org.testng.Assert.assertTrue;

import java.util.List;

import org.testng.annotations.Test;

public class ZoneOrderTest {

    @Test
    public void additionsAndRemovalsAreNotReorders() {
        assertFalse(ZoneOrder.reordered(List.of(1, 2, 3, 4), List.of(2, 3, 4)), "draw from the top");
        assertFalse(ZoneOrder.reordered(List.of(1, 2, 3), List.of(9, 1, 2, 3, 8)), "put on top and bottom");
        assertFalse(ZoneOrder.reordered(List.of(1, 2, 3), List.of(1, 3)), "removal from the middle");
        assertFalse(ZoneOrder.reordered(List.of(), List.of(5, 6)), "new zone");
        assertFalse(ZoneOrder.reordered(List.of(1), List.of(1)));
    }

    @Test
    public void relativeOrderChangesAreReorders() {
        assertTrue(ZoneOrder.reordered(List.of(1, 2, 3), List.of(3, 2, 1)));
        assertTrue(ZoneOrder.reordered(List.of(1, 2, 3), List.of(2, 1, 3)));
        assertTrue(ZoneOrder.reordered(List.of(1, 2, 3, 4), List.of(9, 4, 3)), "survivors swapped among new cards");
    }
}
