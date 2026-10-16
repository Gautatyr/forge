package forge.web.desktop;

import static org.testng.Assert.assertEquals;
import static org.testng.Assert.assertTrue;

import java.awt.Dimension;
import java.awt.Font;
import java.awt.Rectangle;
import java.util.ArrayList;
import java.util.List;

import javax.swing.JButton;
import javax.swing.JCheckBox;
import javax.swing.JLabel;
import javax.swing.JPanel;
import javax.swing.SpringLayout;

import org.testng.annotations.Test;

/**
 * The toggle's place in a bar laid out like Forge's navigation bar (SpringLayout: Forge button and tabs from
 * the left, window buttons and the clock from the right): never over a tab or a visible right-side control,
 * the hidden clock reserves nothing, and the label shortens when the room shrinks.
 */
public class MatchScreenToggleTest {

    private static final int HEIGHT = 27;

    /** A bar of {@code width}: Forge button (100) + {@code tabs} tabs of 100, a hidden clock, 4 window buttons of 25. */
    private static final class Bar {
        final JPanel panel = new JPanel();
        final SpringLayout layout = new SpringLayout();
        final List<JLabel> left = new ArrayList<>();
        final List<JButton> right = new ArrayList<>();
        final JLabel clock = new JLabel("12:00 PM");
        final JCheckBox box = new JCheckBox(MatchScreenToggle.LABEL, true);

        Bar(int width, int tabs, boolean clockShown) {
            panel.setLayout(layout);
            for (int i = 0; i <= tabs; i++) {
                JLabel l = new JLabel(i == 0 ? "Forge" : "Tab " + i);
                l.setPreferredSize(new Dimension(100, 23));
                panel.add(l);
                layout.putConstraint(SpringLayout.WEST, l, 1, i == 0 ? SpringLayout.WEST : SpringLayout.EAST, i == 0 ? panel : left.get(i - 1));
                layout.putConstraint(SpringLayout.SOUTH, l, 0, SpringLayout.SOUTH, panel);
                left.add(l);
            }
            for (int i = 0; i < 4; i++) {
                JButton b = new JButton();
                b.setPreferredSize(new Dimension(25, 25));
                panel.add(b);
                layout.putConstraint(SpringLayout.EAST, b, 0, i == 0 ? SpringLayout.EAST : SpringLayout.WEST, i == 0 ? panel : right.get(i - 1));
                layout.putConstraint(SpringLayout.SOUTH, b, 0, SpringLayout.SOUTH, panel);
                right.add(b);
            }
            clock.setPreferredSize(new Dimension(90, 20));
            clock.setVisible(clockShown);
            panel.add(clock);
            layout.putConstraint(SpringLayout.EAST, clock, -6, SpringLayout.WEST, right.get(3));
            box.setFont(new Font(Font.SANS_SERIF, Font.PLAIN, 12));
            panel.add(box);
            panel.setLayout(new MatchScreenToggle.Placement(layout, box, c -> c instanceof JLabel && c != clock));
            panel.setSize(width, HEIGHT);
        }

        Rectangle layOut() {
            panel.doLayout();
            panel.doLayout(); // as Swing does after a label change revalidates
            return box.getBounds();
        }

        int leftEdge() {
            return left.get(left.size() - 1).getX() + left.get(left.size() - 1).getWidth();
        }

        int rightEdge() {
            return (clock.isVisible() ? clock : right.get(3)).getX();
        }
    }

    private static void assertClear(Bar bar, Rectangle b) {
        assertTrue(b.x >= bar.leftEdge(), "box " + b + " over the last tab (ends at " + bar.leftEdge() + ")");
        assertTrue(b.x + b.width <= bar.rightEdge(), "box " + b + " over the right-side controls (from " + bar.rightEdge() + ")");
    }

    @Test
    public void wideBarShowsTheFullLabelRightAligned() {
        Bar bar = new Bar(1366, 2, false);
        Rectangle b = bar.layOut();
        assertEquals(bar.box.getText(), MatchScreenToggle.LABEL);
        assertEquals(b.x + b.width, bar.right.get(3).getX() - MatchScreenToggle.Placement.GAP, "next to the window buttons");
        assertEquals(b.width, bar.box.getPreferredSize().width);
        assertTrue(b.y + b.height <= HEIGHT && b.y >= 0, String.valueOf(b));
        assertClear(bar, b);
    }

    @Test
    public void theHiddenClockReservesNoRoom() {
        Bar hidden = new Bar(1366, 2, false);
        Bar shown = new Bar(1366, 2, true);
        assertEquals(hidden.layOut().x + hidden.layOut().width, hidden.right.get(3).getX() - MatchScreenToggle.Placement.GAP);
        Rectangle s = shown.layOut();
        assertEquals(s.x + s.width, shown.clock.getX() - MatchScreenToggle.Placement.GAP, "left of the clock when it shows");
        assertClear(shown, s);
    }

    @Test
    public void narrowBarsShortenTheLabelAndNeverOverlap() {
        List<String> seen = new ArrayList<>();
        for (int width = 1200; width >= 300; width -= 2) {
            for (int tabs = 1; tabs <= 4; tabs++) {
                Bar bar = new Bar(width, tabs, false);
                Rectangle b = bar.layOut();
                if (b.width > 0) {
                    assertClear(bar, b);
                    assertEquals(b.width, bar.box.getPreferredSize().width, "laid out at the width of its label '" + bar.box.getText() + "'");
                }
                if (!seen.contains(bar.box.getText()) && b.width > 0) {
                    seen.add(bar.box.getText());
                }
            }
        }
        assertEquals(seen, MatchScreenToggle.LABELS, "every label in turn as the room shrinks");
    }

    @Test
    public void noRoomAtAllHidesTheBox() {
        Bar bar = new Bar(560, 4, false); // tabs end at 505, window buttons from 460
        Rectangle b = bar.layOut();
        assertEquals(b.width, 0);
        assertEquals(b.height, 0);
    }

    @Test
    public void theReviewedWindowNoLongerOverlapsTheDeckEditorTab() {
        // Forge opened at 614 px wide with Home + Deck Editor: the box used to start at x≈233, under the tab ending at ≈300
        Bar bar = new Bar(614, 2, false);
        Rectangle b = bar.layOut();
        assertTrue(b.width > 0, "room left for the box");
        assertClear(bar, b);
    }
}
