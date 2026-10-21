package forge.web.seat;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.TimeUnit;
import java.util.function.Consumer;
import java.util.function.Function;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;

import forge.game.Game;
import forge.game.GameView;
import forge.game.card.Card;
import forge.game.card.CardView;
import forge.game.phase.PhaseType;
import forge.game.player.Player;
import forge.game.player.PlayerView;
import forge.game.spellability.SpellAbility;
import forge.game.spellability.StackItemView;
import forge.gamemodes.match.NextGameDecision;
import forge.gamemodes.match.DrawOfferMessage;
import forge.gamemodes.match.YieldUpdate;
import forge.gamemodes.net.IRemote;
import forge.gamemodes.net.ProtocolMethod;
import forge.gamemodes.net.event.GuiGameEvent;
import forge.gamemodes.net.event.IdentifiableNetEvent;
import forge.gamemodes.net.event.NetEvent;
import forge.interfaces.IGameController;
import forge.player.PlayerControllerHuman;
import forge.trackable.TrackableCollection;
import forge.util.ThreadUtil;
import forge.web.bridge.ClientSink;
import forge.web.bridge.SeatRefs;

/**
 * One human seat: the {@link IRemote} behind its {@link WebGuiGame}, and the inbound side of its
 * clients. Everything for the seat travels on the seat's stream, in order with its deltas.
 *
 * <p>Server to client: {@code {"t":"call","method","args":[…]}} for the no-reply methods of
 * {@link ProtocolMethod} ({@code applyDelta} and {@code setGameView} are replaced by the state
 * stream), and {@code {"t":"prompt",…}} ({@link Prompt}) for the 13 that need an answer, closed by
 * {@code {"t":"promptClosed","id","reason"}}. A client that (re)connects gets, after its snapshot,
 * the seat's current input (prompt message, buttons, selectables…) and its open prompts.
 *
 * <p>Client to server: {@code {"t":"reply","id","value"}} (handled on the transport thread: decode
 * and complete, never blocks) and {@code {"t":"action","method",…}}, the 16 player actions, taken in
 * order by this seat's own thread and run on the game thread waiting for the seat's input
 * ({@link InputPump}; they may wait on a prompt, e.g. selecting a card with several abilities). Card ids are the
 * seat's wire ids, resolved through the seat's stream to engine ids and then to the engine's current card
 * ({@code Game.findById}), never through the tracker.
 */
final class SeatSession implements IRemote {

    /** Calls a reconnecting client needs to show the current input, in this order. */
    private static final List<String> STICKY_ORDER = List.of(
            "openView", "showPromptMessage", "updateButtons", "selectables", "targets", "weakly", "revealed", "drawOffer", "finishGame");

    /**
     * Actions that answer the seat's current input. They run only on the game thread waiting for it; one that finds no
     * input waiting is not run (no input would take it), as a click while no prompt is shown.
     */
    static final Set<String> INPUT_ACTIONS = Set.of("selectButtonOk", "selectButtonCancel", "selectCard", "selectPlayer",
            "selectStackItem", "selectAbility", "useMana", "alphaStrike", "undoLastAction");

    private final int seat;
    private final WebSeats match;
    private final PendingPrompts prompts = new PendingPrompts();
    private final Map<String, String> sticky = new ConcurrentHashMap<>();
    private final ExecutorService actions;
    private final InputPump pump;
    private volatile IGameController controller;
    private volatile GameView gameView;
    /** Set by {@link #close}; guarded by {@link #out} for sends, so nothing reaches the seat once it is set. */
    private volatile boolean closed;
    private final Object out = new Object();

    SeatSession(int seat, WebSeats match) {
        this.seat = seat;
        this.match = match;
        this.actions = Executors.newSingleThreadExecutor(r -> {
            Thread t = new Thread(r, "web-seat-" + seat);
            t.setDaemon(true);
            return t;
        });
        this.pump = new InputPump("seat " + seat);
    }

    InputPump pump() {
        return pump;
    }

    int seat() {
        return seat;
    }

    /**
     * Another game took the seat (the next game of a match, or a new match while this one still runs): stops
     * the action thread once queued actions ran (later actions are rejected, "seat closed"), closes the open
     * prompts with their engine defaults, and sends nothing more to the seat, whose page shows the new game.
     * Later prompts of this game get their default at once.
     */
    void close() {
        synchronized (out) {
            closed = true;
        }
        actions.shutdown();
        prompts.closeAll(PendingPrompts.Close.CANCELLED);
    }

    boolean isClosed() {
        return actions.isShutdown();
    }

    // --- bound by WebGuiGame ---

    void openView(GameView gv, TrackableCollection<PlayerView> myPlayers) {
        int index = gv == null || gv.getPlayers() == null || myPlayers == null || myPlayers.isEmpty() ? -1
                : new ArrayList<>(gv.getPlayers()).indexOf(myPlayers.iterator().next());
        if (index != seat) {
            System.err.println("[web] seat " + seat + " GUI opened for player index " + index + "; its token stays bound to seat " + seat);
        }
        gameView = gv;
        sticky.clear();
        if (!closed) {
            match.bindGame(this, gv);
        }
    }

    void bindController(IGameController c) {
        controller = c;
    }

    void publish(List<forge.game.event.GameEvent> events) {
        if (!closed) {
            match.publish(this, events);
        }
    }

    void flush() {
        if (!closed) {
            match.flush();
        }
    }

    /** {@code GameStream.sendToSeat} unless this session is closed (then null: not sent). */
    private String toSeat(Function<SeatRefs, JsonObject> build, Consumer<String> sent) {
        synchronized (out) {
            return closed ? null : match.stream().sendToSeat(seat, build, sent);
        }
    }

    // --- IRemote: game to client ---

    @Override
    public void send(NetEvent event) {
        if (event instanceof GuiGameEvent e) {
            call(e.getMethod(), e.getObjects());
        }
    }

    @Override
    public Object sendAndWait(IdentifiableNetEvent event) {
        if (!(event instanceof GuiGameEvent e)) {
            SilentDefaults.report(where(), "unbridged " + event.getClass().getSimpleName() + ": answered null");
            return null;
        }
        Prompt p = Prompt.of(e.getMethod(), e.getObjects(), gameView);
        if (p == null) {
            SilentDefaults.report(where(), "no prompt shape for " + e.getMethod() + ": answered null (ProtocolGuiGame's default)");
            return null;
        }
        return ask(p);
    }

    private void call(ProtocolMethod method, Object[] args) {
        if (method == ProtocolMethod.applyDelta || method == ProtocolMethod.setGameView) {
            return; // state travels on the stream
        }
        if (closed) {
            return;
        }
        if (ThreadUtil.isGameThread()) {
            match.flush(); // the call may name objects changed since the last batch
        }
        String key = stickyKey(method, args);
        toSeat(refs -> {
            JsonObject j = new JsonObject();
            j.addProperty("t", "call");
            j.addProperty("method", method.name());
            JsonArray a = new JsonArray();
            for (Object o : args) {
                a.add(WireArgs.encode(o, refs));
            }
            j.add("args", a);
            return j;
        }, text -> updateSticky(method, key, text));
    }

    /** Blocks the calling thread (the game thread, or this seat's action thread) until answered, timed out or abandoned. */
    Object ask(Prompt p) {
        if (closed) {
            Object d = p.fallback();
            SilentDefaults.report(where(), p.method + " asked after the seat closed: engine default " + d);
            return d;
        }
        // must-fix: a reveal for this prompt (tempShowCards) has no event of its own; flush so the seat sees the cards
        flush();
        PendingPrompts.Pending pd = prompts.open(p);
        String text = toSeat(refs -> p.toJson(pd.id, refs), t -> pd.text = t);
        if (text == null) {
            prompts.close(pd, PendingPrompts.Close.CANCELLED);
        } else if (clients() == 0) {
            scheduleDisconnectCheck();
        }
        Object[] r = prompts.await(pd, match.timeouts().promptMs());
        PendingPrompts.Close how = (PendingPrompts.Close) r[1];
        if (!closed) {
            JsonObject done = new JsonObject();
            done.addProperty("t", "promptClosed");
            done.addProperty("id", pd.id);
            done.addProperty("reason", how.name().toLowerCase());
            toSeat(refs -> done, null);
        }
        if (how != PendingPrompts.Close.ANSWERED) {
            SilentDefaults.report(where(), "prompt " + pd.id + " (" + p.method + ") closed " + how + ": engine default " + r[0]);
        }
        return r[0];
    }

    private String where() {
        return "seat " + seat;
    }

    // --- sticky input state for (re)connecting clients ---

    private static String stickyKey(ProtocolMethod m, Object[] args) {
        switch (m) {
            case openView: case showPromptMessage: case updateButtons: case finishGame:
                return m.name();
            case setSelectables: case clearSelectables:
                return "selectables";
            case setSelectableTargets:
                return "targets";
            case setWeaklySelectable: case clearWeaklySelectable:
                return "weakly";
            case showRevealedCards: case hideRevealedCards:
                return "revealed";
            case updateDrawOffer:
                return "drawOffer";
            case showManaPool: case hideManaPool:
                return "manaPool:" + (args.length > 0 && args[0] instanceof PlayerView pv ? pv.getId() : -1);
            default:
                return null;
        }
    }

    private void updateSticky(ProtocolMethod m, String key, String text) {
        if (key == null) {
            return;
        }
        switch (m) {
            case clearSelectables:
                sticky.remove("selectables");
                sticky.remove("targets");
                return;
            case clearWeaklySelectable: case hideRevealedCards: case hideManaPool:
                sticky.remove(key);
                return;
            default:
                sticky.put(key, text);
        }
    }

    /** For a client that just got its snapshot. Runs under the stream's lock: reads concurrent state only. */
    List<String> greeting() {
        List<String> l = new ArrayList<>();
        for (String k : STICKY_ORDER) {
            String t = sticky.get(k);
            if (t != null) {
                l.add(t);
            }
        }
        for (Map.Entry<String, String> e : sticky.entrySet()) {
            if (e.getKey().startsWith("manaPool:")) {
                l.add(e.getValue());
            }
        }
        l.addAll(prompts.openTexts());
        return l;
    }

    void clientsChanged(int n) {
        if (n == 0 && prompts.openCount() > 0) {
            scheduleDisconnectCheck();
        }
    }

    /**
     * The seat's connected clients, counted by the stream: a client may connect before this session exists (the seat's
     * next game) or before the game binds the stream's seats (no {@code clientsChanged} then), and is still there.
     */
    private int clients() {
        return match.stream().seatClientCount(seat);
    }

    private void scheduleDisconnectCheck() {
        match.timer().schedule(() -> {
            if (clients() == 0) {
                for (PendingPrompts.Pending p : prompts.closeAll(PendingPrompts.Close.DISCONNECTED)) {
                    System.out.println("[web] seat " + seat + " has no client: prompt " + p.id + " gets the engine default");
                }
            }
        }, match.timeouts().disconnectGraceMs(), TimeUnit.MILLISECONDS);
    }

    // --- client to game ---

    void receive(JsonObject msg, ClientSink from) {
        String t = str(msg, "t");
        if ("reply".equals(t)) {
            JsonElement id = msg.get("id");
            String err = id == null || !id.isJsonPrimitive() || !id.getAsJsonPrimitive().isNumber() ? "missing id"
                    : prompts.reply(id.getAsLong(), msg.get("value"));
            if (err != null) {
                from.send(rejected("replyRejected", msg, err));
            }
            return;
        }
        if ("action".equals(t)) {
            try {
                actions.execute(() -> dispatch(msg, from));
            } catch (RejectedExecutionException e) {
                from.send(rejected("actionRejected", msg, "seat closed"));
            }
            return;
        }
        from.send(rejected("rejected", msg, "unknown message type"));
    }

    static String rejected(String t, JsonObject msg, String reason) {
        JsonObject j = new JsonObject();
        j.addProperty("t", t);
        if (msg.has("id")) {
            j.add("id", msg.get("id"));
        }
        if (msg.has("method")) {
            j.add("method", msg.get("method"));
        }
        j.addProperty("reason", reason);
        return j.toString();
    }

    /**
     * Seat's action thread: runs one action on the game thread waiting for the seat's input. With none, an input action
     * is not run and any other runs here (concede, yield settings, hand order, while the game thread is busy).
     */
    private void dispatch(JsonObject msg, ClientSink from) {
        String method = str(msg, "method");
        Runnable run = () -> {
            try {
                String err = act(msg, from);
                if (err != null) {
                    from.send(rejected("actionRejected", msg, err));
                }
            } catch (RuntimeException e) {
                System.err.println("[web] seat " + seat + " action " + method + " failed: " + e);
                from.send(rejected("actionRejected", msg, "failed: " + e.getClass().getSimpleName()));
            }
        };
        try {
            if (pump.offer(run, this::inputSet, () -> closed)) {
                return;
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return;
        }
        if (INPUT_ACTIONS.contains(method)) {
            System.out.println("[web] seat " + seat + ": " + method + " came with no input waiting for it: not run");
        } else {
            run.run();
        }
    }

    /** The game thread set an input of this seat (it may not wait for it yet). */
    private boolean inputSet() {
        return controller instanceof PlayerControllerHuman pch && pch.getInputQueue().getInput() != null;
    }

    /** One player action. Returns null when dispatched, else why not. */
    private String act(JsonObject msg, ClientSink from) {
        IGameController c = controller;
        GameView gv = gameView;
        Game game = gv == null ? null : gv.getGame();
        if (c == null || game == null) {
            return "no game";
        }
        String method = str(msg, "method");
        if (method == null) {
            return "missing method";
        }
        switch (method) {
            case "selectButtonOk":
                c.selectButtonOk();
                return null;
            case "selectButtonCancel":
                c.selectButtonCancel();
                return null;
            case "concede":
                c.concede();
                return null;
            case "alphaStrike":
                c.alphaStrike();
                return null;
            case "undoLastAction":
                c.undoLastAction();
                return null;
            case "useMana": {
                Integer color = integer(msg, "color");
                if (color == null || color < 0 || color > 0xFF) {
                    return "bad color";
                }
                c.useMana(color.byteValue());
                return null;
            }
            case "selectCard": {
                Card card = card(game, msg.get("card"));
                if (card == null) {
                    return "unknown card";
                }
                List<CardView> others = null;
                if (msg.has("others") && msg.get("others").isJsonArray()) {
                    others = new ArrayList<>();
                    for (JsonElement e : msg.getAsJsonArray("others")) {
                        Card o = card(game, e);
                        if (o == null) {
                            return "unknown card in others";
                        }
                        others.add(o.getView());
                    }
                }
                c.selectCard(card.getView(), others, null);
                return null;
            }
            case "selectPlayer": {
                Player p = player(game, msg.get("player"));
                if (p == null) {
                    return "unknown player";
                }
                c.selectPlayer(p.getView(), null);
                return null;
            }
            case "selectStackItem": {
                Integer id = integer(msg, "stackItem");
                if (id == null || gv.getStack() == null) {
                    return "unknown stack item";
                }
                for (StackItemView si : gv.getStack()) {
                    if (si.getId() == id) {
                        c.selectStackItem(si);
                        return null;
                    }
                }
                return "unknown stack item";
            }
            case "selectAbility": {
                Card card = card(game, msg.get("card"));
                Integer ability = integer(msg, "ability");
                if (card == null || ability == null || !(c instanceof PlayerControllerHuman pch)) {
                    return "unknown card or ability";
                }
                for (SpellAbility sa : card.getAllPossibleAbilities(pch.getPlayer(), true)) {
                    if (sa.getId() == ability) {
                        pch.getInputProxy().selectAbility(sa);
                        return null;
                    }
                }
                return "unknown ability";
            }
            case "reorderHand": {
                Card card = card(game, msg.get("card"));
                Integer index = integer(msg, "index");
                if (card == null || index == null || index < 0) {
                    return "unknown card or index";
                }
                c.reorderHand(card.getView(), index);
                return null;
            }
            case "getActivateDescription": {
                Card card = card(game, msg.get("card"));
                if (card == null) {
                    return "unknown card";
                }
                JsonObject j = new JsonObject();
                j.addProperty("t", "activateDescription");
                j.add("card", msg.get("card"));
                j.addProperty("text", c.getActivateDescription(card.getView()));
                from.send(j.toString());
                return null;
            }
            case "nextGameDecision": {
                NextGameDecision d = enumOf(NextGameDecision.class, str(msg, "decision"));
                if (d == null) {
                    return "bad decision";
                }
                c.nextGameDecision(d);
                return null;
            }
            case "drawOfferAction": {
                DrawOfferMessage.Action a = enumOf(DrawOfferMessage.Action.class, str(msg, "action"));
                if (a == null) {
                    return "bad draw offer action";
                }
                c.drawOfferAction(a);
                return null;
            }
            case "sendYieldUpdate": {
                YieldUpdate u = yieldUpdate(game, msg.get("update"));
                if (u == null) {
                    return "unsupported yield update";
                }
                c.sendYieldUpdate(u);
                return null;
            }
            case "requestResync":
                return null; // the transport answers {"t":"requestResync"} with a snapshot
            default:
                return "unknown action";
        }
    }

    /** Engine card behind one of this seat's wire ids: through the seat's stream, then the game's zones. */
    private Card card(Game game, JsonElement wire) {
        if (wire == null || !wire.isJsonPrimitive() || !wire.getAsJsonPrimitive().isNumber()) {
            return null;
        }
        int real = match.stream().realCardId(seat, wire.getAsInt());
        return real < 0 ? null : game.findById(real);
    }

    private static Player player(Game game, JsonElement id) {
        if (id == null || !id.isJsonPrimitive() || !id.getAsJsonPrimitive().isNumber()) {
            return null;
        }
        return game.getPlayer(id.getAsInt());
    }

    /** The yield updates a web client may send: phase stops and auto-pass toggles of its own seat. */
    private YieldUpdate yieldUpdate(Game game, JsonElement e) {
        if (e == null || !e.isJsonObject()) {
            return null;
        }
        JsonObject o = e.getAsJsonObject();
        String kind = str(o, "kind");
        PlayerView self = controller instanceof PlayerControllerHuman pch && pch.getPlayer() != null ? pch.getPlayer().getView() : null;
        if (kind == null || self == null) {
            return null;
        }
        switch (kind) {
            case "SkipPhase": {
                Player p = player(game, o.get("turnPlayer"));
                PhaseType ph = enumOf(PhaseType.class, str(o, "phase"));
                Boolean skip = bool(o, "skip");
                return p == null || ph == null || skip == null ? null : new YieldUpdate.SkipPhase(p.getView(), ph, skip);
            }
            case "SetAutoPassUntilEndOfTurn": {
                Boolean active = bool(o, "active");
                return active == null ? null : new YieldUpdate.SetAutoPassUntilEndOfTurn(self, active);
            }
            case "StackYield": {
                Boolean active = bool(o, "active");
                Boolean interrupts = bool(o, "respectsInterrupts");
                return active == null ? null : new YieldUpdate.StackYield(self, active, interrupts == null || interrupts);
            }
            case "SetMarker": {
                Player p = player(game, o.get("phaseOwner"));
                PhaseType ph = enumOf(PhaseType.class, str(o, "phase"));
                Boolean past = bool(o, "atOrPastAtClick");
                return p == null || ph == null ? null : new YieldUpdate.SetMarker(p.getView(), ph, past != null && past);
            }
            case "ClearMarker":
                return new YieldUpdate.ClearMarker(self);
            case "SetDisableYields": {
                Boolean d = bool(o, "disabled");
                return d == null ? null : new YieldUpdate.SetDisableYields(d);
            }
            case "SetDisableTriggers": {
                Boolean d = bool(o, "disabled");
                return d == null ? null : new YieldUpdate.SetDisableTriggers(d);
            }
            default:
                return null;
        }
    }

    private static String str(JsonObject o, String k) {
        JsonElement e = o.get(k);
        return e != null && e.isJsonPrimitive() && e.getAsJsonPrimitive().isString() ? e.getAsString() : null;
    }

    private static Integer integer(JsonObject o, String k) {
        JsonElement e = o.get(k);
        if (e == null || !e.isJsonPrimitive() || !e.getAsJsonPrimitive().isNumber()) {
            return null;
        }
        double d = e.getAsDouble();
        return d == Math.rint(d) && Math.abs(d) <= Integer.MAX_VALUE ? (int) d : null;
    }

    private static Boolean bool(JsonObject o, String k) {
        JsonElement e = o.get(k);
        return e != null && e.isJsonPrimitive() && e.getAsJsonPrimitive().isBoolean() ? e.getAsBoolean() : null;
    }

    private static <E extends Enum<E>> E enumOf(Class<E> type, String name) {
        if (name == null) {
            return null;
        }
        try {
            return Enum.valueOf(type, name);
        } catch (IllegalArgumentException e) {
            return null;
        }
    }
}
