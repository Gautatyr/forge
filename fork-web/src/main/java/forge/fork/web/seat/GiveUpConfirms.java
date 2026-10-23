package forge.fork.web.seat;

import java.util.List;
import java.util.regex.Pattern;

import forge.util.Localizer;

/**
 * Engine yes/no questions whose Yes gives up what the seat was doing (U8, Space-default safety): the page never answers
 * them with Space. The engine passes no role with a confirmation ({@code confirmAction} drops its
 * {@code PlayerActionConfirmMode} before the GUI), so these questions are named by their message keys and matched
 * against the engine's message in the current language: no English words, and every card using these effects is covered.
 */
final class GiveUpConfirms {

    /**
     * {@code lblCancelSearchUpToSelectNumCards}: ChangeZoneEffect, the seat chose nothing in a search.
     * {@code lblCancelChooseConfirm}: ChooseCardEffect and CopyPermanentEffect, the seat chose nothing in an optional choice.
     */
    static final List<String> YES_GIVES_UP = List.of("lblCancelSearchUpToSelectNumCards", "lblCancelChooseConfirm");

    /** Stands for each placeholder of a message; a private-use character no message contains. */
    private static final String HOLE = "";

    private GiveUpConfirms() { }

    /** The whole message is one of {@link #YES_GIVES_UP}, with any placeholder values. */
    static boolean yesGivesUp(String message) {
        if (message == null || message.isEmpty()) {
            return false;
        }
        String m = message.trim();
        for (String key : YES_GIVES_UP) {
            if (pattern(key).matcher(m).matches()) {
                return true;
            }
        }
        return false;
    }

    /** The key's message in the current language, each placeholder matching any text. */
    private static Pattern pattern(String key) {
        String template = Localizer.getInstance().getMessage(key, HOLE, HOLE, HOLE, HOLE).trim();
        StringBuilder re = new StringBuilder();
        String[] parts = template.split(HOLE, -1);
        for (int i = 0; i < parts.length; i++) {
            if (i > 0) {
                re.append(".+?");
            }
            re.append(Pattern.quote(parts[i]));
        }
        return Pattern.compile(re.toString(), Pattern.DOTALL);
    }
}
