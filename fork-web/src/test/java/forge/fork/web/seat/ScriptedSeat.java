package forge.fork.web.seat;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonNull;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.google.gson.JsonPrimitive;

import forge.game.Game;
import forge.game.card.Card;
import forge.game.combat.Combat;
import forge.game.combat.CombatUtil;
import forge.game.phase.PhaseType;
import forge.game.player.Player;
import forge.game.zone.ZoneType;
import forge.fork.web.bridge.ClientSink;
import forge.fork.web.bridge.GameStream;

/**
 * A scripted human seat, the Java twin of {@code spike-viewer/check/human-seat.mjs}: plays seat 0 only through its
 * messages. Answers every prompt with a legal option; in its main phases with an empty stack it selects each card it
 * may play (the seat's actionable highlights, plus the command zone) once per turn; attacks with everything every other
 * turn; blocks up to two attackers each combat with the engine's blockOptions and checks the engine recorded them; picks
 * the cards, players and stack items an input offers; otherwise presses OK, or Cancel when stuck. Reads the engine only
 * for whose turn, phase, stack and combat it is. Not thread-safe beyond: transport threads call {@link #send}, one
 * driver thread plays.
 */
final class ScriptedSeat implements ClientSink {

    private final LinkedBlockingQueue<JsonObject> inbox = new LinkedBlockingQueue<>();
    private final GameStream stream;
    private final Game game;
    private final Player me;
    private final ClientSink self;
    private final Thread driver;
    private volatile boolean stopped;

    // the seat's current input, from its calls
    private boolean ok;
    private boolean cancel;
    private String message = "";
    private List<Integer> selectables;
    private int selMin;
    private int selMax;
    private final List<JsonObject> targets = new ArrayList<>();
    private final Set<String> picked = new HashSet<>();
    private final Set<Integer> weakly = new LinkedHashSet<>();
    private long epoch;
    private long actedEpoch = -1;
    private volatile long lastMessageAt = System.currentTimeMillis();
    private long lastPoke;
    private String lastState = "";
    private int sameState;
    private final Set<String> tried = new HashSet<>();
    private final Set<Integer> attacked = new HashSet<>();
    /** Turns it attacked after all because holding back broke an attack requirement ("Attack declaration invalid"). */
    private final Set<Integer> forcedAttacks = new HashSet<>();
    private volatile boolean attackRefused;
    private final Set<String> blocksTried = new HashSet<>();
    private int pendingBlocker = -1;
    /** The last blockOptions (issue #48), cleared with the input's actionable cards. */
    private JsonArray blockOptions;
    /** Turn whose blocks the seat declared; those blocks, [attacker, blocker], checked in the engine once declared. */
    private int blockedTurn = -1;
    private final List<int[]> declaredBlocks = new ArrayList<>();
    private String okLabel = "";
    private String autoMessage = "";
    private int autoTries;
    private final List<String> recent = new java.util.concurrent.CopyOnWriteArrayList<>();

    final Map<String, Integer> prompts = new TreeMap<>();
    final Map<String, Integer> actions = new TreeMap<>();
    /** Prompts by method, size and message start. */
    final Map<String, Integer> promptTexts = new TreeMap<>();
    /** Read by the sweep's thread while the driver adds. */
    final List<String> errors = new java.util.concurrent.CopyOnWriteArrayList<>();
    /** Server refusals by type ({@code actionRejected}, {@code replyRejected}, {@code rejected}); each is also an error. */
    final Map<String, Integer> rejections = new TreeMap<>();

    /** {@code self}: the sink the stream knows this client by (rejections go there). */
    ScriptedSeat(GameStream stream, Game game, Player me, ClientSink self) {
        this.stream = stream;
        this.game = game;
        this.me = me;
        this.self = self;
        this.driver = new Thread(this::drive, "sweep-seat");
        this.driver.setDaemon(true);
    }

    void start() {
        driver.start();
    }

    long lastMessageAt() {
        return lastMessageAt;
    }

    /** The seat's current input as it saw it, and its last messages (diagnostics for a stalled game). */
    String state() {
        try {
            return "\"" + message + "\" ok " + ok + " (" + okLabel + ") cancel " + cancel + " selectables " + selectables + " targets " + targets
                    + " epoch " + epoch + "; last messages " + recent;
        } catch (RuntimeException e) { // read from another thread while the driver changes it
            return "unreadable: " + e;
        }
    }

    void stop() {
        stopped = true;
        driver.interrupt();
    }

    @Override
    public void send(String json) {
        if (json.startsWith("{\"t\":\"delta\"") || json.startsWith("{\"t\":\"snapshot\"") || json.startsWith("{\"t\":\"hello\"")) {
            lastMessageAt = System.currentTimeMillis();
            inbox.add(TICK);
            return; // state: read from the engine
        }
        inbox.add(JsonParser.parseString(json).getAsJsonObject());
    }

    private static final JsonObject TICK = new JsonObject();

    private void drive() {
        try {
            while (!stopped) {
                JsonObject m = inbox.poll(15, TimeUnit.MILLISECONDS);
                if (m != null) {
                    if (m != TICK) {
                        lastMessageAt = System.currentTimeMillis();
                        String s = m.toString();
                        recent.add(s.substring(0, Math.min(200, s.length())));
                        if (recent.size() > 12) {
                            recent.remove(0);
                        }
                        onMessage(m);
                    }
                    continue;
                }
                // quiet for 100 ms (a player is no faster): act once per input change; re-act after 300 ms of silence
                long now = System.currentTimeMillis();
                if (now - Math.max(lastMessageAt, lastPoke) > 300) {
                    lastPoke = now;
                    decide(true);
                } else if (now - lastMessageAt > 100) {
                    decide(false);
                }
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        } catch (RuntimeException e) {
            errors.add("seat driver failed: " + e);
        }
    }

    private void onMessage(JsonObject m) {
        String t = m.get("t").getAsString();
        switch (t) {
            case "call" -> onCall(m.get("method").getAsString(), m.getAsJsonArray("args"));
            case "prompt" -> {
                prompts.merge(m.get("method").getAsString(), 1, Integer::sum);
                String msg = m.has("message") && !m.get("message").isJsonNull() ? m.get("message").getAsString() : "";
                promptTexts.merge(m.get("method").getAsString() + " max " + (m.has("max") ? m.get("max") : "-") + ": "
                        + msg.substring(0, Math.min(60, msg.length())).replace('\n', ' '), 1, Integer::sum);
                reply(m.get("id"), answer(m));
            }
            case "promptClosed" -> {
                if (!"answered".equals(m.get("reason").getAsString())) {
                    errors.add("prompt closed " + m);
                }
            }
            // an action or reply the server refused (actionRejected includes "failed: <Exception>" from SeatSession.act)
            case "actionRejected", "replyRejected", "rejected" -> {
                rejections.merge(t, 1, Integer::sum);
                errors.add(t + " " + m);
            }
            case "blockOptions" -> blockOptions = m.getAsJsonArray("attackers");
            default -> { }
        }
    }

    private void onCall(String method, JsonArray a) {
        switch (method) {
            case "updateButtons" -> {
                okLabel = a.get(1).isJsonNull() ? "" : a.get(1).getAsString();
                ok = a.get(3).getAsBoolean();
                cancel = a.get(4).getAsBoolean();
                epoch++;
            }
            case "showPromptMessage" -> {
                message = a.get(1).isJsonNull() ? "" : a.get(1).getAsString();
                epoch++;
            }
            case "setSelectables" -> {
                selectables = new ArrayList<>();
                for (JsonElement r : a.get(0).getAsJsonArray()) {
                    if (r.isJsonObject() && "card".equals(type(r))) {
                        selectables.add(r.getAsJsonObject().get("id").getAsInt());
                    }
                }
                selMin = a.get(1).getAsInt();
                selMax = a.get(2).getAsInt();
                picked.clear();
                epoch++;
            }
            case "clearSelectables" -> {
                selectables = null;
                targets.clear();
                picked.clear();
                epoch++;
            }
            case "setSelectableTargets" -> {
                targets.clear();
                for (JsonElement r : a.get(0).getAsJsonArray()) {
                    if (r.isJsonObject()) {
                        targets.add(r.getAsJsonObject());
                    }
                }
                epoch++;
            }
            case "setWeaklySelectable" -> {
                weakly.clear();
                for (JsonElement r : a.get(0).getAsJsonArray()) {
                    if (r.isJsonObject() && "card".equals(type(r))) {
                        weakly.add(r.getAsJsonObject().get("id").getAsInt());
                    }
                }
            }
            case "clearWeaklySelectable" -> {
                weakly.clear();
                blockOptions = null;
            }
            case "message" -> attackRefused |= a.size() > 0 && a.get(0).isJsonPrimitive() && a.get(0).getAsString().startsWith("Attack declaration invalid");
            case "awaitNextInput" -> {
                ok = false;
                cancel = false;
                epoch++;
            }
            default -> { }
        }
    }

    private static String type(JsonElement r) {
        JsonElement t = r.getAsJsonObject().get("type");
        return t == null ? null : t.getAsString();
    }

    /** The first legal option of each prompt shape (as human-seat.mjs). */
    static JsonElement answer(JsonObject m) {
        JsonArray choices = m.has("choices") ? m.getAsJsonArray("choices") : new JsonArray();
        int n = choices.size();
        switch (m.get("shape").getAsString()) {
            case "choose": {
                int min = m.get("min").getAsInt();
                int max = m.get("max").getAsInt();
                List<Integer> enabled = new ArrayList<>();
                for (JsonElement c : choices) {
                    JsonObject o = c.getAsJsonObject();
                    String label = o.has("label") && !o.get("label").isJsonNull() ? o.get("label").getAsString() : "";
                    // TargetSelection.chooseCardFromList lists zone headers ("--CARDS ON BATTLEFIELD:--") among the
                    // choices; picking one re-asks (as on the desktop). A player picks a card. Pile headers
                    // ("-- Pile 1 (2 cards) --", chooseCardsPile) are the answer there: kept.
                    if (!o.has("disabled") && !(label.startsWith("--") && label.endsWith(":--"))) {
                        enabled.add(o.get("i").getAsInt());
                    }
                }
                int count = min > 0 ? min : max > 0 && !enabled.isEmpty() ? 1 : 0;
                JsonArray r = new JsonArray();
                enabled.stream().limit(count).forEach(r::add);
                return r;
            }
            case "confirm":
                return m.get("default");
            case "order": {
                String method = m.get("method").getAsString();
                if ("manipulateCardList".equals(method)) {
                    List<Integer> order = new ArrayList<>();
                    int first = -1;
                    boolean someFixed = false;
                    for (int i = 0; i < n; i++) {
                        order.add(i);
                        boolean movable = choices.get(i).getAsJsonObject().get("movable").getAsBoolean();
                        if (movable && first < 0) {
                            first = i;
                        }
                        someFixed |= !movable;
                    }
                    if (m.get("toBottom").getAsBoolean() && first >= 0 && someFixed) {
                        order.remove(Integer.valueOf(first));
                        order.add(first);
                    }
                    JsonArray r = new JsonArray();
                    order.forEach(r::add);
                    return r;
                }
                if ("sideboard".equals(method)) {
                    JsonArray r = new JsonArray();
                    for (JsonElement c : choices) {
                        if (c.getAsJsonObject().get("inDest").getAsBoolean()) {
                            r.add(c.getAsJsonObject().get("i"));
                        }
                    }
                    return r;
                }
                JsonArray r = new JsonArray();
                for (int i = 0; i < n - m.get("remainingMin").getAsInt(); i++) {
                    r.add(i);
                }
                JsonObject o = new JsonObject();
                o.add("order", r);
                o.addProperty("remember", false);
                return o;
            }
            case "distribute": {
                int left = m.get("amount").getAsInt();
                int[] out = new int[n];
                boolean combat = n > 0;
                for (JsonElement c : choices) {
                    combat &= c.getAsJsonObject().has("lethal");
                }
                if (combat) {
                    for (int i = 0; i < n && left > 0; i++) {
                        out[i] = Math.min(choices.get(i).getAsJsonObject().get("lethal").getAsInt(), left);
                        left -= out[i];
                    }
                    out[n - 1] += left;
                } else {
                    if (m.has("atLeastOne") && m.get("atLeastOne").getAsBoolean()) {
                        for (int i = 0; i < n && left > 0; i++) {
                            out[i] = 1;
                            left--;
                        }
                    }
                    for (int i = 0; i < n && left > 0; i++) {
                        JsonObject c = choices.get(i).getAsJsonObject();
                        int max = c.has("max") ? c.get("max").getAsInt() : m.get("amount").getAsInt();
                        int add = Math.min(max - out[i], left);
                        out[i] += add;
                        left -= add;
                    }
                }
                JsonArray r = new JsonArray();
                for (int x : out) {
                    r.add(x);
                }
                return r;
            }
            case "text": {
                if (m.has("options") && m.get("options").isJsonArray() && !m.getAsJsonArray("options").isEmpty()) {
                    return m.getAsJsonArray("options").get(0);
                }
                String initial = m.has("initial") && !m.get("initial").isJsonNull() ? m.get("initial").getAsString() : "";
                if (m.has("numeric") && m.get("numeric").getAsBoolean()) {
                    return new JsonPrimitive(initial.matches("-?\\d+") ? initial : "0");
                }
                return new JsonPrimitive(initial);
            }
            default:
                return JsonNull.INSTANCE;
        }
    }

    private void reply(JsonElement id, JsonElement value) {
        JsonObject r = new JsonObject();
        r.addProperty("t", "reply");
        r.add("id", id);
        r.add("value", value);
        stream.clientMessage(0, r, self);
    }

    private void act(String method, String field, int value) {
        actions.merge(method, 1, Integer::sum);
        actedEpoch = epoch;
        JsonObject a = new JsonObject();
        a.addProperty("t", "action");
        a.addProperty("method", method);
        if (field != null) {
            a.addProperty(field, value);
        }
        stream.clientMessage(0, a, self);
    }

    private void decide(boolean force) {
        if (game.isGameOver() || (!ok && !cancel && selectables == null && targets.isEmpty())) {
            return;
        }
        if (actedEpoch == epoch && !force) {
            return;
        }
        String state = epoch + "|" + ok + "|" + cancel;
        sameState = state.equals(lastState) ? sameState + 1 : 0;
        lastState = state;
        if (sameState > 200) {
            errors.add("input stuck: \"" + message + "\" ok " + ok + " cancel " + cancel + " selectables " + selectables + " targets " + targets);
            stopped = true;
            return;
        }
        if (sameState > 5 && cancel) {
            act("selectButtonCancel", null, 0);
            return;
        }
        if (pendingBlocker >= 0) {
            int c = pendingBlocker;
            pendingBlocker = -1;
            act("selectCard", "card", c);
            return;
        }
        if (!declaredBlocks.isEmpty() && blockOptions == null) {
            checkBlocks();
        }
        if (blockOptions != null && ok && declareBlock()) {
            return;
        }
        if (sameState > 5 && ok && block()) {
            return;
        }
        PhaseType phase = game.getPhaseHandler().getPhase();
        int turn = game.getPhaseHandler().getTurn();
        boolean myTurn = game.getPhaseHandler().getPlayerTurn() == me;
        boolean stackEmpty = game.getStack().isEmpty();
        // play what may be played, once per card and turn
        if (myTurn && (phase == PhaseType.MAIN1 || phase == PhaseType.MAIN2) && stackEmpty && ok && selectables == null) {
            List<Integer> own = new ArrayList<>(weakly); // the seat's actionable highlights
            for (Card c : me.getCardsIn(ZoneType.Command)) {
                // only what the seat was shown, by that id (not e.g. the engine's hidden "Commander Effect" card)
                if (stream.realCardId(0, c.getId()) == c.getId()) {
                    own.add(c.getId());
                }
            }
            for (int id : own) {
                if (tried.add(turn + ":" + id)) {
                    act("selectCard", "card", id);
                    return;
                }
            }
        }
        // every other turn it holds its creatures back, untapped to block on the opponents' turns (issue #54), unless an
        // attack requirement refuses that ("attacks each combat if able"): then it attacks with everything after all
        if (myTurn && phase == PhaseType.COMBAT_DECLARE_ATTACKERS && ok
                && (attacked.add(turn) ? attacked.size() % 2 == 1 : attackRefused && forcedAttacks.add(turn))) {
            if (attackRefused) {
                actions.merge("(attack requirement: attack after all)", 1, Integer::sum);
                attackRefused = false;
            }
            act("alphaStrike", null, 0);
            actedEpoch = -1;
            return;
        }
        if (selectables != null && !selectables.isEmpty()) {
            for (int id : selectables) {
                if (!picked.contains("c" + id) && picked.size() < selMax && (!ok || picked.size() < selMin)) {
                    picked.add("c" + id);
                    act("selectCard", "card", id);
                    return;
                }
            }
        }
        // players and stack items the input names: opponents first, once each per input
        if (!targets.isEmpty() && !ok) {
            List<JsonObject> order = new ArrayList<>();
            for (JsonObject r : targets) {
                if (!("player".equals(type(r)) && r.get("id").getAsInt() == me.getId())) {
                    order.add(r);
                }
            }
            for (JsonObject r : targets) {
                if (!order.contains(r)) {
                    order.add(r);
                }
            }
            for (JsonObject r : order) {
                String key = type(r) + r.get("id").getAsInt();
                if (picked.add(key)) {
                    if ("player".equals(type(r))) {
                        act("selectPlayer", "player", r.get("id").getAsInt());
                    } else if ("stackItem".equals(type(r))) {
                        act("selectStackItem", "stackItem", r.get("id").getAsInt());
                    } else {
                        continue;
                    }
                    return;
                }
            }
        }
        // "Auto" (InputPayMana) can stay enabled while ComputerUtilMana fails to pay (its source plan and its payment
        // disagree; desktop: same); each failed try refreshes the input, so the stuck check never fires. A player
        // gives up and cancels.
        autoTries = "Auto".equals(okLabel) && message.equals(autoMessage) ? autoTries + 1 : 0;
        autoMessage = message;
        if (autoTries > 10 && cancel) {
            autoTries = 0;
            actions.merge("(auto-pay failed: cancel)", 1, Integer::sum);
            act("selectButtonCancel", null, 0);
        } else if (ok) {
            act("selectButtonOk", null, 0);
        } else if (cancel) {
            act("selectButtonCancel", null, 0);
        }
    }

    /**
     * Issues #54 and #48, as a player on the page: blocks up to two attackers each combat with creatures the engine
     * offers (blockOptions, re-read after each block), as many as the attacker needs (menace), sending the page's two
     * clicks per block (attacker, then blocker). False when it has nothing more to block: OK next.
     */
    private boolean declareBlock() {
        int turn = game.getPhaseHandler().getTurn();
        if (blockedTurn != turn) {
            blockedTurn = turn;
            declaredBlocks.clear();
        }
        Set<Integer> used = new HashSet<>();
        Map<Integer, Integer> perAttacker = new TreeMap<>();
        for (int[] b : declaredBlocks) {
            used.add(b[1]);
            perAttacker.merge(b[0], 1, Integer::sum);
        }
        JsonObject target = null;
        for (JsonElement e : blockOptions) {
            JsonObject o = e.getAsJsonObject();
            int a = o.get("card").getAsInt();
            int min = o.has("min") ? o.get("min").getAsInt() : 1;
            int free = 0;
            for (JsonElement b : o.getAsJsonArray("blockers")) {
                free += used.contains(b.getAsInt()) ? 0 : 1;
            }
            int mine = perAttacker.getOrDefault(a, 0);
            if (mine > 0 && mine < min && free > 0) {
                target = o; // finish a menace block first
                break;
            }
            if (target == null && mine == 0 && perAttacker.size() < 2 && free >= min) {
                target = o;
            }
        }
        if (target == null) {
            return false;
        }
        int a = target.get("card").getAsInt();
        for (JsonElement b : target.getAsJsonArray("blockers")) {
            if (!used.contains(b.getAsInt())) {
                declaredBlocks.add(new int[] {a, b.getAsInt()});
                actions.merge("(block declared)", 1, Integer::sum);
                act("selectCard", "card", a);
                act("selectCard", "card", b.getAsInt());
                return true;
            }
        }
        return false;
    }

    /** Once the seat's InputBlock ended: each block it declared is in the engine's combat (unless a creature left). */
    private void checkBlocks() {
        Combat combat = game.getCombat();
        for (int[] b : declaredBlocks) {
            int a = stream.realCardId(0, b[0]);
            int c = stream.realCardId(0, b[1]);
            Card attacker = a < 0 ? null : game.findById(a);
            Card blocker = c < 0 ? null : game.findById(c);
            if (combat != null && attacker != null && blocker != null && combat.isBlocking(blocker, attacker)) {
                actions.merge("(block recorded)", 1, Integer::sum);
            } else if (attacker == null || blocker == null || !attacker.isInPlay() || !blocker.isInPlay()) {
                actions.merge("(block: a creature left the battlefield)", 1, Integer::sum);
            } else {
                errors.add("block not recorded by the engine: " + attacker + " blocked by " + blocker + " (combat " + combat + ")");
            }
        }
        declaredBlocks.clear();
    }

    /**
     * OK keeps failing while declaring blockers (a block requirement, e.g. "must be blocked if able": the engine
     * {@code message}s the error and stays): as a player reading it, assign one more legal block, attacker then
     * blocker (the blocker click comes on the next decision). False when no untried block is left.
     */
    private boolean block() {
        Combat combat = game.getCombat();
        if (combat == null || game.getPhaseHandler().getPhase() != PhaseType.COMBAT_DECLARE_BLOCKERS) {
            return false;
        }
        int turn = game.getPhaseHandler().getTurn();
        for (Card a : combat.getAttackers()) {
            for (Card c : me.getCreaturesInPlay()) {
                if (!combat.isBlocking(c, a) && CombatUtil.canBlock(a, c, combat) && blocksTried.add(turn + ":" + a.getId() + ":" + c.getId())) {
                    actions.merge("(block requirement: assign a block)", 1, Integer::sum);
                    act("selectCard", "card", a.getId());
                    pendingBlocker = c.getId();
                    return true;
                }
            }
        }
        return false;
    }
}
