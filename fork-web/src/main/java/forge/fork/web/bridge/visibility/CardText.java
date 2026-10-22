package forge.fork.web.bridge.visibility;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import forge.StaticData;
import forge.card.CardRules;
import forge.card.ICardFace;
import forge.localinstance.properties.ForgeConstants;

/**
 * Card names, type lines and oracle text in a language other than English, per card, read from
 * Forge's {@code cardnames-<locale>.txt}. Own tables: {@code forge.util.CardTranslation} holds one
 * process-wide language, and seats here differ. Every lookup returns {@code null} (English stays)
 * when the card has no translation, or when the card's current type line or text is not its printed
 * one (an effect changed it, so the printed translation would be wrong).
 */
public final class CardText {

    /** One file line: translated name, type line and oracle text (null when the line lacks them). */
    private record Entry(String name, String type, String oracle) { }

    private static final Map<String, Map<String, Entry>> TABLES = new HashMap<>();

    private CardText() { }

    /** Wire language code to the locale of Forge's file; null for English and anything unknown. */
    public static String locale(String lang) {
        return "fr".equals(lang) ? "fr-FR" : null;
    }

    private static synchronized Map<String, Entry> table(String locale) {
        return TABLES.computeIfAbsent(locale, CardText::read);
    }

    private static Map<String, Entry> read(String locale) {
        Map<String, Entry> m = new HashMap<>();
        Path file = Paths.get(ForgeConstants.LANG_DIR + "cardnames-" + locale + ".txt");
        List<String> lines;
        try {
            lines = Files.readAllLines(file, StandardCharsets.UTF_8);
        } catch (IOException e) {
            System.err.println("[web] no card translations: " + file);
            return m;
        }
        for (String line : lines) {
            String[] f = line.split("\\|");
            if (f.length < 2 || f[1].isEmpty()) {
                continue;
            }
            String key = f[0];
            int variant = key.indexOf('$');
            if (variant > 0) {
                key = key.substring(0, variant).trim() + " $" + key.substring(variant + 1).trim();
            }
            String oracle = null;
            if (f.length >= 4) {
                // as forge.util.CardTranslation reads it: the engine's oracle text separates lines with CRLF CRLF
                oracle = f[3].replace("//Level_2//\\n", "").replace("//Level_3//\\n", "")
                        .replace("\\n", "\r\n\r\n").replace("VERT", "|").trim();
            }
            Entry e = new Entry(f[1], f.length >= 3 && !f[2].isEmpty() ? f[2] : null, oracle);
            m.put(key, e);
            if (variant > 0) {
                m.putIfAbsent(key.substring(0, key.indexOf(" $")), e);
            }
        }
        return m;
    }

    private static Entry entry(String locale, String oracleName, String variant) {
        Map<String, Entry> t = table(locale);
        Entry e = variant == null || variant.isEmpty() ? null : t.get(oracleName + " $" + variant);
        return e != null ? e : t.get(oracleName);
    }

    /** The translated name of a card, or null. Both faces of a split card are translated. */
    public static String name(String locale, String oracleName, String variant) {
        Entry e = entry(locale, oracleName, variant);
        if (e != null) {
            return e.name;
        }
        int split = oracleName.indexOf(" // ");
        if (split > 0) {
            Entry l = entry(locale, oracleName.substring(0, split), null);
            Entry r = entry(locale, oracleName.substring(split + 4), null);
            if (l != null || r != null) {
                return (l != null ? l.name : oracleName.substring(0, split)) + " // "
                        + (r != null ? r.name : oracleName.substring(split + 4));
            }
        }
        return null;
    }

    /** The translated type line, or null; only when {@code english} is the printed type line. */
    public static String type(String locale, String oracleName, String variant, String english) {
        Entry e = entry(locale, oracleName, variant);
        ICardFace face = e == null || e.type == null ? null : printed(oracleName);
        return face != null && face.getType().toString().equals(english) ? e.type : null;
    }

    /** The translated oracle text, or null; only when {@code english} is the printed text. */
    public static String oracle(String locale, String oracleName, String variant, String english) {
        Entry e = entry(locale, oracleName, variant);
        ICardFace face = e == null || e.oracle == null ? null : printed(oracleName);
        if (face == null || face.getOracleText() == null) {
            return null;
        }
        String printed = face.getOracleText().replace("\\n", "\r\n\r\n").trim();
        return printed.equals(english) ? e.oracle : null;
    }

    private static ICardFace printed(String oracleName) {
        try {
            StaticData data = StaticData.instance();
            CardRules rules = data == null ? null : data.getCommonCards().getRules(oracleName, true);
            if (rules == null) {
                return null;
            }
            if (rules.getOtherPart() != null && oracleName.equals(rules.getOtherPart().getName())) {
                return rules.getOtherPart();
            }
            return rules.getMainPart();
        } catch (RuntimeException e) {
            return null;
        }
    }
}
