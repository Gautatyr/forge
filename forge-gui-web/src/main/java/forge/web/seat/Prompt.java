package forge.web.seat;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;

import forge.deck.CardPool;
import forge.game.GameEntityView;
import forge.game.card.CardView;
import forge.game.player.DelayedReveal;
import forge.game.spellability.SpellAbilityView;
import forge.gamemodes.net.ProtocolMethod;
import forge.gui.interfaces.IGuiGame;
import forge.item.PaperCard;
import forge.util.FSerializableFunction;
import forge.web.bridge.SeatRefs;

/**
 * One of the 13 answer-needing {@link ProtocolMethod}s, held with its original Java arguments.
 * {@link #toJson} renders it for one seat (labels rendered on the server, card references in the
 * seat's id space); {@link #decode} validates the client's reply against the held arguments and maps
 * it back to them, so nothing is deserialised from client types; {@link #fallback} is the engine
 * default used on timeout or disconnect.
 *
 * <p>Shapes and replies ({@code value} of {@code {"t":"reply","id","value"}}):
 * <ul>
 * <li>{@code choose}: array of choice indices, unique, size within [min, max]</li>
 * <li>{@code confirm}: boolean</li>
 * <li>{@code order}: {@code {"order":[indices into source then dest], "remember":bool}} (the new dest list);
 * {@code manipulateCardList}: the full permutation as an array; {@code sideboard}: indices of the new main deck</li>
 * <li>{@code distribute}: array of amounts, one per target, summing to {@code amount}; null to skip when allowed</li>
 * <li>{@code text}: string, or null to cancel</li>
 * </ul>
 */
abstract class Prompt {

    /** A reply that does not fit the prompt; the prompt stays open. */
    static final class BadReply extends Exception {
        private static final long serialVersionUID = 1L;

        BadReply(String message) {
            super(message);
        }
    }

    final ProtocolMethod method;

    private Prompt(ProtocolMethod method) {
        this.method = method;
    }

    abstract String shape();

    /** Shape-specific fields. Runs under the stream's lock: no engine calls that may block. */
    abstract void fill(JsonObject j, SeatRefs refs);

    abstract Object decode(JsonElement value) throws BadReply;

    abstract Object fallback();

    final JsonObject toJson(long id, SeatRefs refs) {
        JsonObject j = new JsonObject();
        j.addProperty("t", "prompt");
        j.addProperty("id", id);
        j.addProperty("method", method.name());
        j.addProperty("shape", shape());
        fill(j, refs);
        return j;
    }

    /** The prompt for a server-to-client method that needs an answer, or null if {@code m} needs none. */
    @SuppressWarnings({"unchecked", "rawtypes"})
    static Prompt of(ProtocolMethod m, Object[] a) {
        switch (m) {
            case getChoices: {
                int min = (Integer) a[1];
                int max = (Integer) a[2];
                List<Object> choices = list(a[3]);
                boolean reveal = min < 0 && max < 0; // AbstractGuiGame.reveal: nothing to pick, acknowledge
                Choose p = new Choose(m, str(a[0]), choices, reveal ? 0 : clamp(min, choices.size()),
                        reveal ? 0 : Math.max(0, Math.min(max < 0 ? choices.size() : max, choices.size())),
                        (FSerializableFunction) a[5], null, null, false) {
                    @Override
                    Object result(List<Object> picked) {
                        return picked;
                    }
                };
                p.selected = a[4] == null ? List.of() : list(a[4]);
                return p;
            }
            case chooseSingleEntityForEffect: {
                List<Object> options = list(a[1]);
                boolean optional = (Boolean) a[3];
                return new Choose(m, str(a[0]), options, optional || options.isEmpty() ? 0 : 1, Math.min(1, options.size()),
                        null, (DelayedReveal) a[2], null, false) {
                    @Override
                    Object result(List<Object> picked) {
                        return picked.isEmpty() ? null : picked.get(0);
                    }
                };
            }
            case chooseEntitiesForEffect: {
                List<Object> options = list(a[1]);
                return new Choose(m, str(a[0]), options, clamp((Integer) a[2], options.size()),
                        Math.min(Math.max(0, (Integer) a[3]), options.size()), null, (DelayedReveal) a[4], null, false) {
                    @Override
                    Object result(List<Object> picked) {
                        return new ArrayList<GameEntityView>((List) picked);
                    }
                };
            }
            case getAbilityToPlay: {
                List<Object> abilities = list(a[1]);
                return new Choose(m, null, abilities, 0, Math.min(1, abilities.size()), null, null, (CardView) a[0], true) {
                    @Override
                    Object result(List<Object> picked) {
                        return picked.isEmpty() ? null : picked.get(0);
                    }
                };
            }
            case showOptionDialog: {
                List<Object> options = list(a[3]);
                int def = (Integer) a[4];
                Choose p = new Choose(m, str(a[0]), options, options.isEmpty() ? 0 : 1, Math.min(1, options.size()), null, null, null, false) {
                    @Override
                    Object result(List<Object> picked) {
                        return picked.isEmpty() ? def : options.indexOf(picked.get(0));
                    }

                    @Override
                    Object fallback() {
                        return def;
                    }
                };
                p.title = str(a[1]);
                p.defaultIndex = def;
                return p;
            }
            case confirm: {
                List<String> options = a[3] == null ? null : (List<String>) a[3];
                return new Confirm(m, str(a[1]), null, (CardView) a[0],
                        options != null && options.size() > 0 ? options.get(0) : null,
                        options != null && options.size() > 1 ? options.get(1) : null, (Boolean) a[2]);
            }
            case showConfirmDialog:
                return new Confirm(m, str(a[0]), str(a[1]), null, str(a[2]), str(a[3]), (Boolean) a[4]);
            case order:
                return new Order(str(a[0]), str(a[1]), (Integer) a[2], (Integer) a[3], list(a[4]),
                        a[5] == null ? List.of() : list(a[5]), (CardView) a[6], (Boolean) a[8]);
            case manipulateCardList:
                return new Manipulate(str(a[0]), list(a[1]), list(a[2]), (Boolean) a[3], (Boolean) a[4], (Boolean) a[5]);
            case sideboard:
                return new Sideboard((CardPool) a[0], (CardPool) a[1], str(a[2]));
            case assignCombatDamage:
                return Distribute.combat((CardView) a[0], (List<CardView>) a[1], (Integer) a[2], (GameEntityView) a[3], (Boolean) a[5]);
            case assignGenericAmount:
                return Distribute.generic((CardView) a[0], (Map<Object, Integer>) a[1], (Integer) a[2], (Boolean) a[3], str(a[4]));
            case showInputDialog:
                return new Text(str(a[0]), str(a[1]), str(a[3]), a[4] == null ? null : (List<String>) a[4], (Boolean) a[5]);
            default:
                return null;
        }
    }

    // --- choose N of a list ---

    abstract static class Choose extends Prompt {
        final String message;
        final List<Object> items;
        final int min;
        final int max;
        @SuppressWarnings("rawtypes")
        final FSerializableFunction display;
        final DelayedReveal reveal;
        final CardView card;
        final boolean checkPlayable;
        List<Object> selected = List.of();
        String title;
        int defaultIndex = -1;

        @SuppressWarnings("rawtypes")
        Choose(ProtocolMethod m, String message, List<Object> items, int min, int max, FSerializableFunction display,
                DelayedReveal reveal, CardView card, boolean checkPlayable) {
            super(m);
            this.message = message;
            this.items = items;
            this.min = min;
            this.max = Math.max(min, max);
            this.display = display;
            this.reveal = reveal;
            this.card = card;
            this.checkPlayable = checkPlayable;
        }

        abstract Object result(List<Object> picked);

        @Override
        String shape() {
            return "choose";
        }

        @Override
        void fill(JsonObject j, SeatRefs refs) {
            j.addProperty("message", message);
            if (title != null) {
                j.addProperty("title", title);
            }
            j.addProperty("min", min);
            j.addProperty("max", max);
            if (card != null) {
                j.add("card", WireArgs.encode(card, refs));
            }
            JsonArray cs = new JsonArray();
            for (int i = 0; i < items.size(); i++) {
                JsonObject c = WireArgs.choice(i, items.get(i), display, refs);
                if (checkPlayable && items.get(i) instanceof SpellAbilityView sa && !sa.canPlay()) {
                    c.addProperty("disabled", true);
                }
                cs.add(c);
            }
            j.add("choices", cs);
            if (!selected.isEmpty()) {
                JsonArray s = new JsonArray();
                for (Object o : selected) {
                    int i = items.indexOf(o);
                    if (i >= 0) {
                        s.add(i);
                    }
                }
                j.add("selected", s);
            }
            if (defaultIndex >= 0) {
                j.addProperty("default", defaultIndex);
            }
            if (reveal != null) {
                JsonObject r = new JsonObject();
                r.addProperty("message", reveal.getMessagePrefix());
                JsonArray rc = new JsonArray();
                int i = 0;
                for (CardView c : reveal.getCards()) {
                    rc.add(WireArgs.choice(i++, c, null, refs));
                }
                r.add("cards", rc);
                j.add("reveal", r);
            }
        }

        @Override
        Object decode(JsonElement v) throws BadReply {
            List<Integer> idx = indices(v, items.size());
            if (idx.size() < min || idx.size() > max) {
                throw new BadReply("pick between " + min + " and " + max);
            }
            List<Object> picked = new ArrayList<>();
            for (int i : idx) {
                if (checkPlayable && items.get(i) instanceof SpellAbilityView sa && !sa.canPlay()) {
                    throw new BadReply("choice " + i + " is disabled");
                }
                picked.add(items.get(i));
            }
            return result(picked);
        }

        @Override
        Object fallback() {
            return result(new ArrayList<>(items.subList(0, Math.min(min, items.size()))));
        }
    }

    // --- yes / no ---

    static final class Confirm extends Prompt {
        final String message;
        final String title;
        final CardView card;
        final String yes;
        final String no;
        final boolean defaultYes;

        Confirm(ProtocolMethod m, String message, String title, CardView card, String yes, String no, boolean defaultYes) {
            super(m);
            this.message = message;
            this.title = title;
            this.card = card;
            this.yes = yes;
            this.no = no;
            this.defaultYes = defaultYes;
        }

        @Override
        String shape() {
            return "confirm";
        }

        @Override
        void fill(JsonObject j, SeatRefs refs) {
            j.addProperty("message", message);
            if (title != null) {
                j.addProperty("title", title);
            }
            if (card != null) {
                j.add("card", WireArgs.encode(card, refs));
            }
            j.addProperty("yes", yes == null ? "Yes" : yes);
            j.addProperty("no", no == null ? "No" : no);
            j.addProperty("default", defaultYes);
        }

        @Override
        Object decode(JsonElement v) throws BadReply {
            if (v == null || !v.isJsonPrimitive() || !v.getAsJsonPrimitive().isBoolean()) {
                throw new BadReply("expected a boolean");
            }
            return v.getAsBoolean();
        }

        @Override
        Object fallback() {
            return defaultYes;
        }
    }

    // --- order / move between two lists ---

    static final class Order extends Prompt {
        final String title;
        final String top;
        final int remainingMin;
        final int remainingMax;
        final List<Object> all = new ArrayList<>();
        final int sourceCount;
        final CardView card;
        final boolean remember;

        Order(String title, String top, int remainingMin, int remainingMax, List<Object> source, List<Object> dest,
                CardView card, boolean remember) {
            super(ProtocolMethod.order);
            this.title = title;
            this.top = top;
            this.all.addAll(source);
            this.all.addAll(dest);
            this.sourceCount = source.size();
            // negative bound: none (AbstractGuiGame.many passes -1)
            this.remainingMin = remainingMin < 0 ? 0 : Math.min(remainingMin, all.size());
            this.remainingMax = remainingMax < 0 ? all.size() : Math.max(this.remainingMin, Math.min(remainingMax, all.size()));
            this.card = card;
            this.remember = remember;
        }

        @Override
        String shape() {
            return "order";
        }

        @Override
        void fill(JsonObject j, SeatRefs refs) {
            j.addProperty("message", title);
            j.addProperty("destLabel", top);
            if (card != null) {
                j.add("card", WireArgs.encode(card, refs));
            }
            JsonArray cs = new JsonArray();
            for (int i = 0; i < all.size(); i++) {
                JsonObject c = WireArgs.choice(i, all.get(i), null, refs);
                c.addProperty("inDest", i >= sourceCount);
                cs.add(c);
            }
            j.add("choices", cs);
            // the reply's order lists the dest items; between these many choices stay out of it
            j.addProperty("remainingMin", remainingMin);
            j.addProperty("remainingMax", remainingMax);
            j.addProperty("rememberOption", remember);
        }

        @Override
        Object decode(JsonElement v) throws BadReply {
            if (v == null || !v.isJsonObject()) {
                throw new BadReply("expected {order, remember}");
            }
            List<Integer> idx = indices(v.getAsJsonObject().get("order"), all.size());
            int remaining = all.size() - idx.size();
            if (remaining < remainingMin || remaining > remainingMax) {
                throw new BadReply("leave between " + remainingMin + " and " + remainingMax + " out");
            }
            List<Object> out = new ArrayList<>();
            for (int i : idx) {
                out.add(all.get(i));
            }
            JsonElement r = v.getAsJsonObject().get("remember");
            boolean rem = remember && r != null && r.isJsonPrimitive() && r.getAsJsonPrimitive().isBoolean() && r.getAsBoolean();
            return new IGuiGame.OrderResult<>(out, rem);
        }

        @Override
        Object fallback() {
            // dest as given, then source; the last remainingMin stay out
            List<Object> out = new ArrayList<>(all.subList(sourceCount, all.size()));
            out.addAll(all.subList(0, sourceCount));
            return new IGuiGame.OrderResult<>(new ArrayList<>(out.subList(0, all.size() - remainingMin)), false);
        }
    }

    static final class Manipulate extends Prompt {
        final String title;
        final List<Object> cards;
        final Set<Object> movable;
        final boolean toTop;
        final boolean toBottom;
        final boolean toAnywhere;

        Manipulate(String title, List<Object> cards, List<Object> movable, boolean toTop, boolean toBottom, boolean toAnywhere) {
            super(ProtocolMethod.manipulateCardList);
            this.title = title;
            this.cards = cards;
            this.movable = new HashSet<>(movable);
            this.toTop = toTop;
            this.toBottom = toBottom;
            this.toAnywhere = toAnywhere;
        }

        @Override
        String shape() {
            return "order";
        }

        @Override
        void fill(JsonObject j, SeatRefs refs) {
            j.addProperty("message", title);
            JsonArray cs = new JsonArray();
            for (int i = 0; i < cards.size(); i++) {
                JsonObject c = WireArgs.choice(i, cards.get(i), null, refs);
                c.addProperty("movable", movable.contains(cards.get(i)));
                cs.add(c);
            }
            j.add("choices", cs);
            j.addProperty("permutation", true);
            j.addProperty("toTop", toTop);
            j.addProperty("toBottom", toBottom);
            j.addProperty("toAnywhere", toAnywhere);
        }

        @Override
        Object decode(JsonElement v) throws BadReply {
            List<Integer> idx = indices(v, cards.size());
            if (idx.size() != cards.size()) {
                throw new BadReply("expected a permutation of all " + cards.size() + " cards");
            }
            List<Object> out = new ArrayList<>();
            for (int pos = 0; pos < idx.size(); pos++) {
                int i = idx.get(pos);
                if (i != pos && !movable.contains(cards.get(i))) {
                    throw new BadReply("card " + i + " may not move");
                }
                out.add(cards.get(i));
            }
            return out;
        }

        @Override
        Object fallback() {
            return new ArrayList<>(cards);
        }
    }

    static final class Sideboard extends Prompt {
        final List<PaperCard> all = new ArrayList<>();
        final int mainCount;
        final String message;

        Sideboard(CardPool sideboard, CardPool main, String message) {
            super(ProtocolMethod.sideboard);
            if (main != null) {
                all.addAll(main.toFlatList());
            }
            mainCount = all.size();
            if (sideboard != null) {
                all.addAll(sideboard.toFlatList());
            }
            this.message = message;
        }

        @Override
        String shape() {
            return "order";
        }

        @Override
        void fill(JsonObject j, SeatRefs refs) {
            j.addProperty("message", message);
            JsonArray cs = new JsonArray();
            for (int i = 0; i < all.size(); i++) {
                JsonObject c = WireArgs.choice(i, all.get(i), null, refs);
                c.addProperty("inDest", i < mainCount);
                cs.add(c);
            }
            j.add("choices", cs);
            j.addProperty("destLabel", "Main deck");
        }

        @Override
        Object decode(JsonElement v) throws BadReply {
            List<PaperCard> out = new ArrayList<>();
            for (int i : indices(v, all.size())) {
                out.add(all.get(i));
            }
            return out;
        }

        @Override
        Object fallback() {
            return null; // PlayerControllerHuman keeps the current main deck
        }
    }

    // --- distribute an amount ---

    static final class Distribute extends Prompt {
        final CardView card;
        final int amount;
        final List<Object> targets;
        /** Per-target maximum, or null for none. */
        final List<Integer> maxima;
        final boolean atLeastOne;
        final boolean maySkip;
        final String label;
        /** Combat: the defender is the last target and the reply maps it to a null key. */
        final boolean combatDefender;

        private Distribute(ProtocolMethod m, CardView card, int amount, List<Object> targets, List<Integer> maxima,
                boolean atLeastOne, boolean maySkip, String label, boolean combatDefender) {
            super(m);
            this.card = card;
            this.amount = amount;
            this.targets = targets;
            this.maxima = maxima;
            this.atLeastOne = atLeastOne;
            this.maySkip = maySkip;
            this.label = label;
            this.combatDefender = combatDefender;
        }

        static Distribute combat(CardView attacker, List<CardView> blockers, int damage, GameEntityView defender, boolean maySkip) {
            List<Object> t = new ArrayList<>(blockers);
            if (defender != null) {
                t.add(defender);
            }
            return new Distribute(ProtocolMethod.assignCombatDamage, attacker, damage, t, null, false, maySkip, "damage", defender != null);
        }

        static Distribute generic(CardView source, Map<Object, Integer> targets, int amount, boolean atLeastOne, String label) {
            List<Object> t = new ArrayList<>(targets.keySet());
            List<Integer> max = new ArrayList<>();
            for (Object k : t) {
                Integer x = targets.get(k);
                max.add(x == null ? amount : x);
            }
            return new Distribute(ProtocolMethod.assignGenericAmount, source, amount, t, max, atLeastOne, false, label, false);
        }

        @Override
        String shape() {
            return "distribute";
        }

        @Override
        void fill(JsonObject j, SeatRefs refs) {
            if (card != null) {
                j.add("card", WireArgs.encode(card, refs));
            }
            j.addProperty("amount", amount);
            j.addProperty("amountLabel", label);
            j.addProperty("atLeastOne", atLeastOne);
            j.addProperty("maySkip", maySkip);
            JsonArray cs = new JsonArray();
            for (int i = 0; i < targets.size(); i++) {
                JsonObject c = WireArgs.choice(i, targets.get(i), null, refs);
                if (maxima != null) {
                    c.addProperty("max", maxima.get(i));
                }
                if (combatDefender && i == targets.size() - 1) {
                    c.addProperty("defender", true);
                }
                cs.add(c);
            }
            j.add("choices", cs);
        }

        @Override
        Object decode(JsonElement v) throws BadReply {
            if (v == null || v.isJsonNull()) {
                if (maySkip) {
                    return null; // combat: assign another attacker's damage first
                }
                throw new BadReply("amounts required");
            }
            if (!v.isJsonArray() || v.getAsJsonArray().size() != targets.size()) {
                throw new BadReply("expected " + targets.size() + " amounts");
            }
            int[] amounts = new int[targets.size()];
            int sum = 0;
            for (int i = 0; i < amounts.length; i++) {
                amounts[i] = intOf(v.getAsJsonArray().get(i));
                int lo = atLeastOne ? 1 : 0;
                int hi = maxima == null ? amount : maxima.get(i);
                if (amounts[i] < lo || amounts[i] > hi) {
                    throw new BadReply("amount " + i + " outside [" + lo + ", " + hi + "]");
                }
                sum += amounts[i];
            }
            if (sum != amount) {
                throw new BadReply("amounts must sum to " + amount);
            }
            return toMap(amounts);
        }

        @Override
        Object fallback() {
            int[] amounts = new int[targets.size()];
            int left = amount;
            if (atLeastOne) {
                for (int i = 0; i < amounts.length && left > 0; i++) {
                    amounts[i] = 1;
                    left--;
                }
            }
            for (int i = 0; i < amounts.length && left > 0; i++) {
                int room = (maxima == null ? amount : maxima.get(i)) - amounts[i];
                int add = Math.min(room, left);
                amounts[i] += add;
                left -= add;
            }
            return toMap(amounts);
        }

        private Object toMap(int[] amounts) {
            if (method == ProtocolMethod.assignCombatDamage) {
                Map<CardView, Integer> out = new HashMap<>();
                for (int i = 0; i < amounts.length; i++) {
                    boolean defender = combatDefender && i == amounts.length - 1;
                    if (amounts[i] > 0 || !defender) {
                        out.put(defender ? null : (CardView) targets.get(i), amounts[i]);
                    }
                }
                return out;
            }
            Map<Object, Integer> out = new LinkedHashMap<>();
            for (int i = 0; i < amounts.length; i++) {
                out.put(targets.get(i), amounts[i]);
            }
            return out;
        }
    }

    // --- text or number ---

    static final class Text extends Prompt {
        final String message;
        final String title;
        final String initial;
        final List<String> options;
        final boolean numeric;

        Text(String message, String title, String initial, List<String> options, boolean numeric) {
            super(ProtocolMethod.showInputDialog);
            this.message = message;
            this.title = title;
            this.initial = initial;
            this.options = options;
            this.numeric = numeric;
        }

        @Override
        String shape() {
            return "text";
        }

        @Override
        void fill(JsonObject j, SeatRefs refs) {
            j.addProperty("message", message);
            if (title != null) {
                j.addProperty("title", title);
            }
            j.addProperty("initial", initial);
            if (options != null) {
                JsonArray o = new JsonArray();
                options.forEach(o::add);
                j.add("options", o);
            }
            j.addProperty("numeric", numeric);
        }

        @Override
        Object decode(JsonElement v) throws BadReply {
            if (v == null || v.isJsonNull()) {
                return null; // cancel
            }
            if (!v.isJsonPrimitive() || !v.getAsJsonPrimitive().isString()) {
                throw new BadReply("expected a string or null");
            }
            String s = v.getAsString();
            if (s.length() > 1000) {
                throw new BadReply("too long");
            }
            if (options != null && !options.isEmpty() && !options.contains(s)) {
                throw new BadReply("not one of the options");
            }
            if (numeric && !s.matches("-?\\d{1,9}")) {
                throw new BadReply("expected a number");
            }
            return s;
        }

        @Override
        Object fallback() {
            if (options != null && !options.isEmpty()) {
                return options.contains(initial) ? initial : options.get(0);
            }
            if (numeric) {
                // a non-numeric default would make AbstractGuiGame.getInteger ask again forever: cancel instead
                return initial != null && initial.matches("-?\\d{1,9}") ? initial : null;
            }
            return initial;
        }
    }

    // --- helpers ---

    private static String str(Object o) {
        return o == null ? null : o.toString();
    }

    private static int clamp(int min, int size) {
        return Math.max(0, Math.min(min, size));
    }

    @SuppressWarnings("unchecked")
    private static List<Object> list(Object o) {
        List<Object> l = new ArrayList<>();
        if (o instanceof Iterable<?> it) {
            for (Object x : it) {
                l.add(x);
            }
        }
        return l;
    }

    private static int intOf(JsonElement e) throws BadReply {
        if (e == null || !e.isJsonPrimitive() || !e.getAsJsonPrimitive().isNumber()) {
            throw new BadReply("expected an integer");
        }
        double d = e.getAsDouble();
        if (d != Math.rint(d) || Math.abs(d) > Integer.MAX_VALUE) {
            throw new BadReply("expected an integer");
        }
        return (int) d;
    }

    /** Unique indices in [0, size). */
    static List<Integer> indices(JsonElement v, int size) throws BadReply {
        if (v == null || !v.isJsonArray()) {
            throw new BadReply("expected an array of indices");
        }
        List<Integer> out = new ArrayList<>();
        Set<Integer> seen = new HashSet<>();
        for (JsonElement e : v.getAsJsonArray()) {
            int i = intOf(e);
            if (i < 0 || i >= size || !seen.add(i)) {
                throw new BadReply("bad or repeated index " + i);
            }
            out.add(i);
        }
        return out;
    }
}
