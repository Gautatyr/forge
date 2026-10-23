package forge.fork.web.seat;

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
import forge.game.GameView;
import forge.game.card.CardView;
import forge.game.card.CardView.CardStateView;
import forge.game.card.CounterEnumType;
import forge.game.player.DelayedReveal;
import forge.game.player.PlayerView;
import forge.gamemodes.net.ProtocolMethod;
import forge.gui.interfaces.IGuiGame;
import forge.item.PaperCard;
import forge.util.Localizer;
import forge.util.FSerializableFunction;
import forge.fork.web.bridge.SeatRefs;

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
 * {@code manipulateCardList}: {@code {"top":[...],"bottom":[...]}} over the movable cards only, or with {@code toAnywhere}
 * the full permutation as an array (see {@link Manipulate}); {@code sideboard}: indices of the new main deck</li>
 * <li>{@code distribute}: array of amounts, one per target, summing to {@code amount}; null to skip when allowed;
 * combat damage follows {@code lethalOrder} with each choice's {@code lethal}</li>
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

    /** The methods {@link #of} has a shape for. */
    static final Set<ProtocolMethod> SHAPED = java.util.EnumSet.of(ProtocolMethod.getChoices, ProtocolMethod.chooseSingleEntityForEffect,
            ProtocolMethod.chooseEntitiesForEffect, ProtocolMethod.getAbilityToPlay, ProtocolMethod.showOptionDialog, ProtocolMethod.confirm,
            ProtocolMethod.showConfirmDialog, ProtocolMethod.order, ProtocolMethod.manipulateCardList, ProtocolMethod.sideboard,
            ProtocolMethod.assignCombatDamage, ProtocolMethod.assignGenericAmount, ProtocolMethod.showInputDialog);

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

    /**
     * The prompt for a server-to-client method that needs an answer, or null if {@code m} needs none.
     * {@code gv} (may be null: 10) gives the poison counters a player loses at.
     */
    @SuppressWarnings({"unchecked", "rawtypes"})
    static Prompt of(ProtocolMethod m, Object[] a, GameView gv) {
        switch (m) {
            case getChoices: {
                int min = (Integer) a[1];
                int max = (Integer) a[2];
                List<Object> choices = list(a[3]);
                boolean reveal = min < 0 && max < 0; // AbstractGuiGame.reveal: nothing to pick, acknowledge
                Choose p = new Choose(m, str(a[0]), choices, reveal ? 0 : clamp(min, choices.size()),
                        reveal ? 0 : Math.max(0, Math.min(max < 0 ? choices.size() : max, choices.size())),
                        (FSerializableFunction) a[5], null, null) {
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
                        null, (DelayedReveal) a[2], null) {
                    @Override
                    Object result(List<Object> picked) {
                        return picked.isEmpty() ? null : picked.get(0);
                    }
                };
            }
            case chooseEntitiesForEffect: {
                List<Object> options = list(a[1]);
                return new Choose(m, str(a[0]), options, clamp((Integer) a[2], options.size()),
                        Math.min(Math.max(0, (Integer) a[3]), options.size()), null, (DelayedReveal) a[4], null) {
                    @Override
                    Object result(List<Object> picked) {
                        return new ArrayList<GameEntityView>((List) picked);
                    }
                };
            }
            case getAbilityToPlay: {
                List<Object> abilities = list(a[1]);
                // nothing disabled, as CMatchUI without a trigger event: the engine passes only what it allows here
                // (an effect's cast ignores timing, so canPlay may be false for every ability it offers)
                return new Choose(m, null, abilities, 0, Math.min(1, abilities.size()), null, null, (CardView) a[0]) {
                    @Override
                    Object result(List<Object> picked) {
                        return picked.isEmpty() ? null : picked.get(0);
                    }
                };
            }
            case showOptionDialog: {
                List<Object> options = list(a[3]);
                int def = (Integer) a[4];
                Choose p = new Choose(m, str(a[0]), options, options.isEmpty() ? 0 : 1, Math.min(1, options.size()), null, null, null) {
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
                return Distribute.combat((CardView) a[0], (List<CardView>) a[1], (Integer) a[2], (GameEntityView) a[3], (Boolean) a[4],
                        (Boolean) a[5], gv == null ? 10 : gv.getPoisonCountersToLose());
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
        List<Object> selected = List.of();
        String title;
        int defaultIndex = -1;

        @SuppressWarnings("rawtypes")
        Choose(ProtocolMethod m, String message, List<Object> items, int min, int max, FSerializableFunction display,
                DelayedReveal reveal, CardView card) {
            super(m);
            this.message = message;
            this.items = items;
            this.min = min;
            this.max = Math.max(min, max);
            this.display = display;
            this.reveal = reveal;
            this.card = card;
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
                cs.add(WireArgs.choice(i, items.get(i), display, refs));
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
        /** Yes gives up what the seat was doing ({@link GiveUpConfirms}); read here, on the engine's thread. */
        final boolean yesGivesUp;

        Confirm(ProtocolMethod m, String message, String title, CardView card, String yes, String no, boolean defaultYes) {
            super(m);
            this.message = message;
            this.title = title;
            this.card = card;
            this.yes = yes;
            this.no = no;
            this.defaultYes = defaultYes;
            this.yesGivesUp = GiveUpConfirms.yesGivesUp(message);
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
            if (yesGivesUp) {
                j.addProperty("giveUp", "yes");
            }
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

        /**
         * Nobody can tell the order: the cards go to exile ({@code PlayerControllerHuman.orderMoveToZoneList}'s
         * {@code lblChooseOrderCardsPutIntoExile}; exile has no order in the rules) and every card is to be placed. The
         * title is the engine's own localised string, so this holds in any language, and no other prompt matches it.
         */
        boolean orderIsMoot() {
            return remainingMax == 0 && title != null
                    && title.equals(Localizer.getInstance().getMessage("lblChooseOrderCardsPutIntoExile"));
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
            // dest as given, then source; as many as allowed stay out (many(): the fewest items picked, as Choose takes min)
            List<Object> out = new ArrayList<>(all.subList(sourceCount, all.size()));
            out.addAll(all.subList(0, sourceCount));
            return new IGuiGame.OrderResult<>(new ArrayList<>(out.subList(0, all.size() - remainingMax)), false);
        }
    }

    /**
     * Unless {@code toAnywhere}, the piles form: the seat gets only the movable cards (a scry's looked-at cards, never
     * the rest of the library, which {@code PlayerControllerHuman.arrangeForScry} passes whole) and replies
     * {@code {"top":[...],"bottom":[...]}}: each movable card in one pile, the top pile first-on-top, the bottom pile
     * last-at-the-very-bottom. With {@code toAnywhere} (a place among the other cards) the reply is the full permutation.
     */
    static final class Manipulate extends Prompt {
        final String title;
        final List<Object> cards;
        final Set<Object> movable;
        /** The movable cards in list order: the piles form's choices. */
        final List<Object> pileCards = new ArrayList<>();
        final boolean toTop;
        final boolean toBottom;
        final boolean toAnywhere;
        final boolean piles;

        Manipulate(String title, List<Object> cards, List<Object> movable, boolean toTop, boolean toBottom, boolean toAnywhere) {
            super(ProtocolMethod.manipulateCardList);
            this.title = title;
            this.cards = cards;
            this.movable = new HashSet<>(movable);
            for (Object c : cards) {
                if (this.movable.contains(c)) {
                    pileCards.add(c);
                }
            }
            this.toTop = toTop;
            this.toBottom = toBottom;
            this.toAnywhere = toAnywhere;
            this.piles = !toAnywhere && (toTop || toBottom);
        }

        @Override
        String shape() {
            return "order";
        }

        @Override
        void fill(JsonObject j, SeatRefs refs) {
            j.addProperty("message", title);
            JsonArray cs = new JsonArray();
            if (piles) {
                for (int i = 0; i < pileCards.size(); i++) {
                    cs.add(WireArgs.choice(i, pileCards.get(i), null, refs));
                }
                j.addProperty("piles", true);
            } else {
                for (int i = 0; i < cards.size(); i++) {
                    JsonObject c = WireArgs.choice(i, cards.get(i), null, refs);
                    c.addProperty("movable", movable.contains(cards.get(i)));
                    cs.add(c);
                }
                j.addProperty("permutation", true);
            }
            j.add("choices", cs);
            j.addProperty("toTop", toTop);
            j.addProperty("toBottom", toBottom);
            j.addProperty("toAnywhere", toAnywhere);
        }

        @Override
        Object decode(JsonElement v) throws BadReply {
            return piles ? decodePiles(v) : decodePermutation(v);
        }

        private Object decodePiles(JsonElement v) throws BadReply {
            if (v == null || !v.isJsonObject()) {
                throw new BadReply("expected {top, bottom}");
            }
            List<Integer> top = indices(v.getAsJsonObject().get("top"), pileCards.size());
            List<Integer> bottom = indices(v.getAsJsonObject().get("bottom"), pileCards.size());
            Set<Integer> all = new HashSet<>(top);
            all.addAll(bottom);
            if (all.size() != top.size() + bottom.size()) {
                throw new BadReply("a card is in both piles");
            }
            if (all.size() != pileCards.size()) {
                throw new BadReply("each card goes to the top or the bottom");
            }
            if (!toTop && !top.isEmpty()) {
                throw new BadReply("no card may go to the top");
            }
            if (!toBottom && !bottom.isEmpty()) {
                throw new BadReply("no card may go to the bottom");
            }
            List<Object> t = new ArrayList<>();
            top.forEach(i -> t.add(pileCards.get(i)));
            List<Object> b = new ArrayList<>();
            bottom.forEach(i -> b.add(pileCards.get(i)));
            return arrange(t, b);
        }

        /**
         * The list to return for these piles: the library as it will be. {@code PlayerControllerHuman.arrangeForMove}
         * keeps the trailing run of movable cards in list order (upstream's bottom-order fix, 2026-10) and
         * {@code GameAction.scry} puts each under the previous one, so the bottom pile goes in as chosen.
         */
        private List<Object> arrange(List<Object> top, List<Object> bottom) {
            List<Object> out = new ArrayList<>(top);
            for (Object c : cards) {
                if (!movable.contains(c)) {
                    out.add(c);
                }
            }
            out.addAll(bottom);
            return out;
        }

        /**
         * Cards that may not move keep their relative order. Unless {@code toAnywhere}, every movable card ends in the
         * leading run of movable cards (if {@code toTop}) or the trailing one (if {@code toBottom}), as
         * {@code PlayerControllerHuman.arrangeForMove} reads the result.
         */
        private Object decodePermutation(JsonElement v) throws BadReply {
            List<Integer> idx = indices(v, cards.size());
            if (idx.size() != cards.size()) {
                throw new BadReply("expected a permutation of all " + cards.size() + " cards");
            }
            int lastFixed = -1;
            int lead = 0; // movable cards before the first fixed one
            while (lead < idx.size() && isMovable(idx.get(lead))) {
                lead++;
            }
            int trail = idx.size(); // first index of the trailing movable run
            while (trail > lead && isMovable(idx.get(trail - 1))) {
                trail--;
            }
            List<Object> out = new ArrayList<>();
            for (int pos = 0; pos < idx.size(); pos++) {
                int i = idx.get(pos);
                if (!isMovable(i)) {
                    if (i < lastFixed) {
                        throw new BadReply("cards that may not move keep their order");
                    }
                    lastFixed = i;
                } else if (!toAnywhere && lead < idx.size()) {
                    boolean top = pos < lead;
                    boolean bottom = pos >= trail;
                    if (!(top && toTop) && !(bottom && toBottom)) {
                        throw new BadReply("card " + i + " must go to the " + (toTop && toBottom ? "top or the bottom" : toTop ? "top" : "bottom"));
                    }
                }
                out.add(cards.get(i));
            }
            return out;
        }

        private boolean isMovable(int i) {
            return movable.contains(cards.get(i));
        }

        @Override
        Object fallback() {
            if (!piles) {
                return new ArrayList<>(cards);
            }
            return toTop ? arrange(pileCards, List.of()) : arrange(List.of(), pileCards);
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
        /** Combat: damage that is lethal to each target ({@code VAssignCombatDamage.getDamageToKill}); null otherwise. */
        List<Integer> lethal;
        /** Combat: which targets need lethal damage before others get any; null otherwise. */
        LethalOrder lethalOrder;

        /** The combat damage assignment rule, as {@code VAssignCombatDamage.checkDamageQueue} enforces it. */
        enum LethalOrder {
            /** A target gets damage only once every earlier target has lethal damage. */
            IN_ORDER("inOrder"),
            /** Blockers in any order (overrideOrder); the defender only once every blocker has lethal damage. */
            BLOCKERS_FIRST("blockersFirst"),
            /** Divided as the player chooses (divide-damage keyword with overrideOrder). */
            FREE("free");

            final String wire;

            LethalOrder(String wire) {
                this.wire = wire;
            }
        }

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

        /**
         * As {@code VAssignCombatDamage}: the defender is a target only for a trampler, or a divide-damage
         * attacker with overrideOrder (the engine passes the defender for every blocked attacker).
         */
        static Distribute combat(CardView attacker, List<CardView> blockers, int damage, GameEntityView defender,
                boolean overrideOrder, boolean maySkip, int poisonToLose) {
            CardStateView as = attacker.getCurrentState();
            boolean divide = as.hasDivideDamage();
            boolean withDefender = defender != null && (as.hasTrample() || (divide && overrideOrder));
            List<Object> t = new ArrayList<>(blockers);
            if (withDefender) {
                t.add(defender);
            }
            Distribute d = new Distribute(ProtocolMethod.assignCombatDamage, attacker, damage, t, null, false, maySkip, "damage", withDefender);
            d.lethalOrder = divide && overrideOrder ? LethalOrder.FREE : overrideOrder ? LethalOrder.BLOCKERS_FIRST : LethalOrder.IN_ORDER;
            d.lethal = new ArrayList<>();
            for (Object o : t) {
                d.lethal.add(damageToKill(o, as.hasDeathtouch(), as.hasInfect(), poisonToLose));
            }
            return d;
        }

        /** {@code VAssignCombatDamage.getDamageToKill}; a battle needs its defense. */
        private static int damageToKill(Object target, boolean deathtouch, boolean infect, int poisonToLose) {
            if (target instanceof PlayerView p) {
                return Math.max(0, infect ? poisonToLose - p.getCounters(CounterEnumType.POISON) : p.getLife());
            }
            if (!(target instanceof CardView c)) {
                return 0;
            }
            CardStateView s = c.getCurrentState();
            if (s.isPlaneswalker()) {
                return number(s.getLoyalty());
            }
            if (s.isBattle()) {
                return number(s.getDefense());
            }
            int lethal = Math.max(0, c.getLethalDamage());
            return deathtouch ? Math.min(lethal, 1) : lethal;
        }

        private static int number(String s) {
            try {
                return s == null ? 0 : Math.max(0, Integer.parseInt(s.trim()));
            } catch (NumberFormatException e) {
                return 0;
            }
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
                if (lethal != null) {
                    c.addProperty("lethal", lethal.get(i));
                }
                cs.add(c);
            }
            j.add("choices", cs);
            if (lethalOrder != null) {
                j.addProperty("lethalOrder", lethalOrder.wire);
            }
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
            checkLethalOrder(amounts);
            return toMap(amounts);
        }

        /** {@code VAssignCombatDamage.checkDamageQueue}: no damage past a target that lacks lethal damage. */
        private void checkLethalOrder(int[] amounts) throws BadReply {
            if (lethalOrder == null || lethalOrder == LethalOrder.FREE) {
                return;
            }
            int short0 = -1; // first target with less than lethal damage
            for (int i = 0; i < amounts.length; i++) {
                boolean defender = combatDefender && i == amounts.length - 1;
                if (amounts[i] > 0 && short0 >= 0 && (lethalOrder == LethalOrder.IN_ORDER || defender)) {
                    throw new BadReply("choice " + short0 + " needs lethal damage (" + lethal.get(short0) + ") before choice " + i);
                }
                if (short0 < 0 && amounts[i] < lethal.get(i)) {
                    short0 = i;
                }
            }
        }

        @Override
        Object fallback() {
            int[] amounts = new int[targets.size()];
            int left = amount;
            if (lethal != null) {
                // the desktop's "Auto": lethal damage to each target in order, the rest to the last one
                for (int i = 0; i < amounts.length && left > 0; i++) {
                    amounts[i] = Math.min(lethal.get(i), left);
                    left -= amounts[i];
                }
                if (amounts.length > 0) {
                    amounts[amounts.length - 1] += left;
                }
                return toMap(amounts);
            }
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
