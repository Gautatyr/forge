package forge.web.desktop;

import java.awt.Component;
import java.awt.Container;
import java.awt.Dimension;
import java.awt.LayoutManager2;
import java.util.List;
import java.util.function.Predicate;

import javax.swing.AbstractButton;
import javax.swing.SpringLayout;

import forge.Singletons;
import forge.toolbox.FCheckBox;
import forge.toolbox.FDigitalClock;
import forge.toolbox.FSkin;
import forge.view.FNavigationBar;
import forge.view.FTitleBarBase;

/**
 * The "Use the new match screen" checkbox, added at runtime to Forge's menu bar (the navigation bar at the
 * top of the window). No upstream Swing file is edited: the bar keeps its own layout, wrapped by
 * {@link Placement}, which puts the checkbox in the free space between the tabs and the visible controls on
 * the right. Call on the EDT once the main window exists.
 */
final class MatchScreenToggle {

    static final String LABEL = "Use the new match screen";
    /** Labels tried in order until one fits; the last shows the checkbox alone (the tooltip explains it). */
    static final List<String> LABELS = List.of(LABEL, "New match screen", "");

    private MatchScreenToggle() { }

    static FCheckBox install(MatchScreenPref pref) {
        FNavigationBar bar = Singletons.getView().getNavigationBar();
        FCheckBox box = new FCheckBox(LABEL, pref.enabled());
        box.setFont(FSkin.getFont(12));
        box.setFocusable(false);
        box.setToolTipText("<html>Use the new match screen.<br>On: matches started from the lobby open in the web match screen, in your browser.<br>"
                + "Off: they open in Forge's classic match screen.</html>");
        box.addActionListener(e -> pref.set(box.isSelected()));
        bar.add(box);
        // left side: the Forge button and the tabs; right side: the window buttons and the clock (when shown)
        bar.setLayout(new Placement((SpringLayout) bar.getLayout(), box,
                c -> !(c instanceof FTitleBarBase.TitleBarButton) && !(c instanceof FDigitalClock)));
        bar.revalidate();
        bar.repaint();
        return box;
    }

    /**
     * The bar's own layout, then the box: right-aligned against the leftmost visible right-side component,
     * never over the rightmost visible left-side one, with the longest label of {@link #LABELS} that fits
     * (no room even for the bare checkbox: zero size). Recomputed on every layout pass (resize, tab opened
     * or closed, clock shown in full screen).
     */
    static final class Placement implements LayoutManager2 {
        static final int GAP = 12;

        private final SpringLayout delegate;
        private final AbstractButton box;
        private final Predicate<Component> leftSide;

        Placement(SpringLayout delegate, AbstractButton box, Predicate<Component> leftSide) {
            this.delegate = delegate;
            this.box = box;
            this.leftSide = leftSide;
        }

        @Override
        public void layoutContainer(Container parent) {
            delegate.layoutContainer(parent);
            int left = parent.getInsets().left;
            int right = parent.getWidth() - parent.getInsets().right;
            for (Component c : parent.getComponents()) {
                if (c == box || !c.isVisible()) {
                    continue;
                }
                if (leftSide.test(c)) {
                    left = Math.max(left, c.getX() + c.getWidth());
                } else {
                    right = Math.min(right, c.getX());
                }
            }
            Dimension pref = box.getPreferredSize();
            int room = right - left - 2 * GAP;
            for (String label : LABELS) {
                int w = width(label, pref.width);
                if (w <= room) {
                    if (!label.equals(box.getText())) {
                        box.setText(label); // revalidates: the next pass finds the same label
                    }
                    box.setBounds(right - GAP - w, parent.getHeight() - 2 - pref.height, w, pref.height);
                    return;
                }
            }
            box.setBounds(right, 0, 0, 0);
        }

        /** The box's width with {@code label}, from its preferred width with its current text. */
        private int width(String label, int prefWidth) {
            java.awt.FontMetrics fm = box.getFontMetrics(box.getFont());
            String current = box.getText() == null ? "" : box.getText();
            int base = prefWidth - (current.isEmpty() ? 0 : fm.stringWidth(current) + box.getIconTextGap());
            return base + (label.isEmpty() ? 0 : fm.stringWidth(label) + box.getIconTextGap());
        }

        @Override
        public void addLayoutComponent(Component comp, Object constraints) {
            delegate.addLayoutComponent(comp, constraints);
        }

        @Override
        public void addLayoutComponent(String name, Component comp) {
            delegate.addLayoutComponent(name, comp);
        }

        @Override
        public void removeLayoutComponent(Component comp) {
            delegate.removeLayoutComponent(comp);
        }

        @Override
        public Dimension preferredLayoutSize(Container parent) {
            return delegate.preferredLayoutSize(parent);
        }

        @Override
        public Dimension minimumLayoutSize(Container parent) {
            return delegate.minimumLayoutSize(parent);
        }

        @Override
        public Dimension maximumLayoutSize(Container target) {
            return delegate.maximumLayoutSize(target);
        }

        @Override
        public float getLayoutAlignmentX(Container target) {
            return delegate.getLayoutAlignmentX(target);
        }

        @Override
        public float getLayoutAlignmentY(Container target) {
            return delegate.getLayoutAlignmentY(target);
        }

        @Override
        public void invalidateLayout(Container target) {
            delegate.invalidateLayout(target);
        }
    }
}
