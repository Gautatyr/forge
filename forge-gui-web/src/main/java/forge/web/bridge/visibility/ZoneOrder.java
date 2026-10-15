package forge.web.bridge.visibility;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/** Detects a shuffle or reorder of a zone from two snapshots of its card ids. */
public final class ZoneOrder {

    private ZoneOrder() { }

    /**
     * True when cards present in both lists changed relative order. Cards drawn, milled or put on
     * top or bottom leave the survivors' order intact; a shuffle or a rearrangement does not.
     */
    public static boolean reordered(List<Integer> before, List<Integer> after) {
        Set<Integer> inAfter = new HashSet<>(after);
        Set<Integer> inBefore = new HashSet<>(before);
        List<Integer> a = new ArrayList<>();
        for (Integer id : before) {
            if (inAfter.contains(id)) {
                a.add(id);
            }
        }
        List<Integer> b = new ArrayList<>();
        for (Integer id : after) {
            if (inBefore.contains(id)) {
                b.add(id);
            }
        }
        return !a.equals(b);
    }
}
