package forge.web.desktop;

import java.awt.Component;

import javax.swing.SpringLayout;

import forge.Singletons;
import forge.toolbox.FCheckBox;
import forge.toolbox.FDigitalClock;
import forge.toolbox.FSkin;
import forge.view.FNavigationBar;

/**
 * The "Use the new match screen" checkbox, added at runtime to Forge's menu bar (the navigation bar
 * at the top of the window), left of the clock. No upstream Swing file is edited. Call on the EDT once
 * the main window exists.
 */
final class MatchScreenToggle {

    static final String LABEL = "Use the new match screen";

    private MatchScreenToggle() { }

    static FCheckBox install(MatchScreenPref pref) {
        FNavigationBar bar = Singletons.getView().getNavigationBar();
        FCheckBox box = new FCheckBox(LABEL, pref.enabled());
        box.setFont(FSkin.getFont(12));
        box.setFocusable(false);
        box.setToolTipText("<html>On: matches started from the lobby open in the web match screen, in your browser.<br>"
                + "Off: they open in Forge's classic match screen.</html>");
        box.addActionListener(e -> pref.set(box.isSelected()));
        bar.add(box);
        SpringLayout layout = (SpringLayout) bar.getLayout();
        Component anchor = clock(bar);
        if (anchor != null) {
            layout.putConstraint(SpringLayout.EAST, box, -12, SpringLayout.WEST, anchor);
        } else {
            layout.putConstraint(SpringLayout.EAST, box, -200, SpringLayout.EAST, bar);
        }
        layout.putConstraint(SpringLayout.SOUTH, box, -2, SpringLayout.SOUTH, bar);
        bar.revalidate();
        bar.repaint();
        return box;
    }

    private static Component clock(FNavigationBar bar) {
        for (Component c : bar.getComponents()) {
            if (c instanceof FDigitalClock) {
                return c;
            }
        }
        return null;
    }
}
