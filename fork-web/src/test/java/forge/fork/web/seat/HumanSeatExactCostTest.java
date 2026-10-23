package forge.fork.web.seat;

import static org.testng.Assert.assertEquals;
import static org.testng.Assert.assertFalse;
import static org.testng.Assert.assertNotNull;
import static org.testng.Assert.assertTrue;
import static org.testng.Assert.fail;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.function.BooleanSupplier;
import java.util.function.Function;

import org.testng.annotations.AfterMethod;
import org.testng.annotations.BeforeClass;
import org.testng.annotations.Test;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

import forge.ai.LobbyPlayerAi;
import forge.deck.Deck;
import forge.game.Game;
import forge.game.GameRules;
import forge.game.GameStage;
import forge.game.GameType;
import forge.game.Match;
import forge.game.card.Card;
import forge.game.phase.PhaseHandler;
import forge.game.phase.PhaseType;
import forge.game.player.Player;
import forge.game.player.RegisteredPlayer;
import forge.game.zone.ZoneType;
import forge.gamemodes.match.input.Input;
import forge.gamemodes.match.input.InputPassPriority;
import forge.gamemodes.match.input.InputPayMana;
import forge.gamemodes.match.input.InputSelectManyBase;
import forge.gamemodes.match.input.InputSelectTargets;
import forge.gui.control.GameEventForwarder;
import forge.player.LobbyPlayerHuman;
import forge.player.PlayerControllerHuman;
import forge.trackable.TrackableCollection;
import forge.fork.web.bridge.GameStream;
import forge.fork.web.bridge.GameStream.HiddenPolicy;
import forge.fork.web.bridge.visibility.TestEngine;

/**
 * Issue #109: a cost or an effect that picks cards sends the seat the count the engine requires (the selection's
 * {@code min} and {@code max}), the engine does not take a shorter pick, and a pick the engine rejects after OK says why
 * instead of rolling the cast back silently. Real game, seat 0 = {@code PlayerControllerHuman} on a {@link WebGuiGame};
 * the seat plays only through its messages.
 */
public class HumanSeatExactCostTest {

    private ExecutorService gameThread;
    private Game game;
    private Player me;
    private PlayerControllerHuman pch;
    private GameStream stream;
    private HumanSeatTriggersTest.Seat seat;

    @BeforeClass
    public void boot() {
        TestEngine.boot();
    }

    @AfterMethod(alwaysRun = true)
    public void stop() {
        if (gameThread != null) {
            gameThread.shutdownNow();
        }
        SilentDefaults.setStrict(null);
    }

    private void start() {
        SilentDefaults.reset();
        SilentDefaults.setStrict(true);
        gameThread = Executors.newSingleThreadExecutor(r -> new Thread(r, "Game-109"));
        List<RegisteredPlayer> rps = new ArrayList<>();
        rps.add(new RegisteredPlayer(new Deck()).setPlayer(new LobbyPlayerHuman("You")));
        rps.add(new RegisteredPlayer(new Deck()).setPlayer(new LobbyPlayerAi("ai1", null)));
        GameRules rules = new GameRules(GameType.Constructed);
        game = new Game(rps, rules, new Match(rules, rps, "Test"));
        game.setAge(GameStage.Play);
        me = game.getPlayers().get(0);
        pch = (PlayerControllerHuman) me.getController();

        stream = new GameStream(HiddenPolicy.REDACT, null);
        WebSeats seats = new WebSeats(stream, new WebSeats.Timeouts(20_000, 20_000));
        WebGuiGame gui = seats.newSeat(0);
        pch.setGui(gui);
        gui.setGameView(null);
        gui.setGameView(game.getView());
        gui.setOriginalGameController(me.getView(), pch);
        GameEventForwarder fwd = new GameEventForwarder(gui);
        gui.setForwarder(fwd);
        game.subscribeToEvents(fwd);
        pch.getInputQueue().addObserver(fwd);
        gui.openView(new TrackableCollection<>(me.getView()));
        for (Player p : game.getPlayers()) {
            p.updateOpponentsForView();
        }
        seat = new HumanSeatTriggersTest.Seat();
        stream.addClient(seat, 0);
        for (Player p : game.getPlayers()) {
            for (int i = 0; i < 10; i++) {
                TestEngine.add("Plains", p, ZoneType.Library);
            }
        }
    }

    private void mainPhase() {
        game.getPhaseHandler().devModeSet(PhaseType.MAIN1, me);
        game.getPhaseHandler().onStackResolved();
    }

    private Card add(String name, Player p, ZoneType zone) {
        Card c = TestEngine.add(name, p, zone);
        if (zone == ZoneType.Battlefield) {
            c.setSickness(false);
        }
        return c;
    }

    private void action(String method, String extra) {
        JsonObject a = JsonParser.parseString("{\"t\":\"action\",\"method\":\"" + method + "\"" + (extra == null ? "" : "," + extra) + "}").getAsJsonObject();
        stream.clientMessage(0, a, seat);
    }

    private void ok() {
        action("selectButtonOk", null);
    }

    private void select(Card c) {
        action("selectCard", "\"card\":" + c.getId());
    }

    /** Same pacing as {@code HumanSeatPaymentTest.play}: one action at a time, each followed by a "sync" marker. */
    private List<String> play(BooleanSupplier done, Function<Input, Runnable> onInput) throws Exception {
        return play(done, onInput, m -> null);
    }

    private List<String> play(BooleanSupplier done, Function<Input, Runnable> onInput, Function<JsonObject, JsonElement> onPrompt) throws Exception {
        final PhaseHandler ph = game.getPhaseHandler();
        Future<?> loop = gameThread.submit(() -> {
            for (int i = 0; i < 300 && !done.getAsBoolean() && !game.isGameOver(); i++) {
                ph.mainLoopStep();
            }
        });
        List<String> seen = new ArrayList<>();
        Input acted = null;
        int sync = 0;
        boolean synced = true;
        int promptsAtAct = 0;
        long end = System.currentTimeMillis() + 60_000;
        while (!loop.isDone()) {
            if (System.currentTimeMillis() > end) {
                fail("game loop stuck; seen " + seen + "; input " + pch.getInputQueue().getInput() + "; last message " + seat.lastCall("showPromptMessage"));
            }
            JsonObject m = seat.inbox.poll(10, TimeUnit.MILLISECONDS);
            if (m != null && "prompt".equals(m.get("t").getAsString())) {
                seen.add("prompt " + m.get("method").getAsString());
                JsonElement v = onPrompt.apply(m);
                if (v == null) {
                    fail("unexpected prompt " + m + "; seen " + seen);
                }
                JsonObject reply = new JsonObject();
                reply.addProperty("t", "reply");
                reply.add("id", m.get("id"));
                reply.add("value", v);
                stream.clientMessage(0, reply, seat);
                continue;
            }
            if (m != null && "replyRejected".equals(m.get("t").getAsString())) {
                fail("reply rejected: " + m + "; seen " + seen);
            }
            if (m != null && "actionRejected".equals(m.get("t").getAsString()) && m.has("id") && m.get("id").getAsInt() == sync) {
                synced = true;
            }
            Input in = pch.getInputQueue().getInput();
            if (!synced || in == null || pch.getInputProxy().getInput() != in || seat.count("showPromptMessage") <= promptsAtAct) {
                continue;
            }
            if (in != acted) {
                seen.add(in.getClass().getSimpleName());
                acted = in;
            }
            promptsAtAct = seat.count("showPromptMessage");
            Runnable r = onInput.apply(in);
            (r == null ? (Runnable) this::ok : r).run();
            synced = false;
            action("sync", "\"id\":" + (++sync));
        }
        loop.get(1, TimeUnit.SECONDS);
        return seen;
    }

    private JsonObject lastSelection() {
        String call = seat.lastCall("setSelection");
        if (call == null) {
            return null;
        }
        return JsonParser.parseString(call).getAsJsonObject().getAsJsonArray("args").get(0).getAsJsonObject();
    }

    /** Whether the seat's last {@code updateButtons} enables OK: (owner, ok, cancel, focus) of a pick; (owner, label, label, ok, …) otherwise. */
    private boolean okEnabled() {
        JsonArray a = JsonParser.parseString(seat.lastCall("updateButtons")).getAsJsonObject().getAsJsonArray("args");
        return a.get(a.size() == 4 ? 1 : 3).getAsBoolean();
    }

    /** The selection once it names cards: an input's first display sends it after its message (on the EDT). Waits up to 5 s. */
    private JsonObject awaitSelection() {
        long end = System.currentTimeMillis() + 5000;
        JsonObject sel = lastSelection();
        while ((sel == null || sel.getAsJsonArray("cards").isEmpty()) && System.currentTimeMillis() < end) {
            try {
                Thread.sleep(10);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                break;
            }
            sel = lastSelection();
        }
        assertNotNull(sel, "the seat received a selection");
        return sel;
    }

    private Set<Integer> shown(JsonObject sel, String field) {
        Set<Integer> ids = new HashSet<>();
        for (JsonElement e : sel.getAsJsonArray(field)) {
            ids.add(e.getAsJsonObject().get("id").getAsInt());
        }
        return ids;
    }

    /** What the seat saw and did while a spell was cast and its picked cost paid. */
    private static final class Cast {
        final List<String> seen = new ArrayList<>();
        int min = -1;
        int max = -1;
        /** After one card and OK: whether the page showed OK enabled, and whether the engine still waited for the pick. */
        boolean okShownAfterShort;
        boolean stillPickingAfterShort;
        boolean rolledBack;
    }

    /**
     * Casts {@code spell} from {@code from}, pays mana with Auto, and at the cost's pick input sends: the first card and
     * OK ({@code shortOk}: a pick shorter than the engine requires), then the rest of {@code picks}, one at a time.
     */
    private Cast cast(Card spell, ZoneType from, List<Card> picks, boolean shortOk, BooleanSupplier paid) throws Exception {
        Cast r = new Cast();
        int[] picked = {0};
        boolean[] sawPick = {false};
        r.seen.addAll(play(() -> paid.getAsBoolean() || r.rolledBack || game.getPhaseHandler().getPhase() != PhaseType.MAIN1, in -> {
            if (in instanceof InputPassPriority) {
                if (sawPick[0]) {
                    r.rolledBack = game.getCardState(spell).isInZone(from);
                    return null;
                }
                return game.getCardState(spell).isInZone(from) ? () -> select(spell) : null;
            }
            if (in instanceof InputPayMana) {
                return null;
            }
            if (in instanceof InputSelectManyBase<?>) {
                if (!sawPick[0]) {
                    sawPick[0] = true;
                    JsonObject sel = awaitSelection();
                    r.min = sel.get("min").getAsInt();
                    r.max = sel.get("max").getAsInt();
                    if (shortOk) {
                        picked[0] = 1;
                        Card first = picks.get(0);
                        return () -> {
                            select(first);
                            ok();
                        };
                    }
                } else if (shortOk && picked[0] == 1) {
                    r.okShownAfterShort = okEnabled();
                    r.stillPickingAfterShort = pch.getInputQueue().getInput() == in;
                }
                Card next = picks.get(picked[0]++);
                return () -> select(next);
            }
            return null;
        }));
        return r;
    }

    /** Issue #109: Escape's four-card exile is exactly four: the prompt says 4..4 and one card cannot be confirmed. */
    @Test
    public void escapeExilesExactlyFourCards() throws Exception {
        start();
        for (int i = 0; i < 5; i++) {
            add("Swamp", me, ZoneType.Battlefield);
        }
        Card strider = add("Woe Strider", me, ZoneType.Graveyard);
        List<Card> others = new ArrayList<>();
        for (String n : List.of("Grizzly Bears", "Shock", "Giant Growth", "Counterspell")) {
            others.add(add(n, me, ZoneType.Graveyard));
        }
        mainPhase();
        Cast r = cast(strider, ZoneType.Graveyard, others, true, () -> game.getCardState(strider).isInZone(ZoneType.Battlefield));
        assertEquals(r.min, 4, "the prompt's min is what the engine requires; seen " + r.seen);
        assertEquals(r.max, 4);
        assertFalse(r.okShownAfterShort, "OK is not enabled with one card");
        assertTrue(r.stillPickingAfterShort, "OK with one card is not taken; the engine still waits for the pick; seen " + r.seen);
        assertFalse(r.rolledBack, "the cast is not rolled back" + "; seen " + r.seen);
        assertTrue(game.getCardState(strider).isInZone(ZoneType.Battlefield), "Woe Strider escaped; seen " + r.seen);
        for (Card c : others) {
            assertTrue(game.getCardState(c).isInZone(ZoneType.Exile), c.getName() + " was exiled; seen " + r.seen);
        }
        assertEquals(SilentDefaults.count(), 0, "silent defaults: " + SilentDefaults.recent());
    }

    /** Same, with more candidates than the cost takes: the seat chooses which four. */
    @Test
    public void escapeWithMoreCardsThanTheCostTakesLeavesTheRest() throws Exception {
        start();
        for (int i = 0; i < 5; i++) {
            add("Swamp", me, ZoneType.Battlefield);
        }
        Card strider = add("Woe Strider", me, ZoneType.Graveyard);
        List<Card> others = new ArrayList<>();
        for (String n : List.of("Grizzly Bears", "Shock", "Giant Growth", "Counterspell", "Divination")) {
            others.add(add(n, me, ZoneType.Graveyard));
        }
        mainPhase();
        Cast r = cast(strider, ZoneType.Graveyard, others.subList(0, 4), true, () -> game.getCardState(strider).isInZone(ZoneType.Battlefield));
        assertEquals(r.min, 4, "seen " + r.seen);
        assertEquals(r.max, 4);
        assertTrue(r.stillPickingAfterShort, "seen " + r.seen);
        assertTrue(game.getCardState(strider).isInZone(ZoneType.Battlefield), "seen " + r.seen);
        assertTrue(game.getCardState(others.get(4)).isInZone(ZoneType.Graveyard), "the fifth card stayed");
        assertEquals(SilentDefaults.count(), 0, "silent defaults: " + SilentDefaults.recent());
    }

    /** "As an additional cost, discard two cards": 2..2. */
    @Test
    public void discardTwoCostIsExactlyTwo() throws Exception {
        start();
        add("Mountain", me, ZoneType.Battlefield);
        add("Mountain", me, ZoneType.Battlefield);
        Card spell = add("Cathartic Reunion", me, ZoneType.Hand);
        List<Card> hand = new ArrayList<>();
        for (String n : List.of("Grizzly Bears", "Shock", "Giant Growth")) {
            hand.add(add(n, me, ZoneType.Hand));
        }
        mainPhase();
        Cast r = cast(spell, ZoneType.Hand, hand.subList(0, 2), true, () -> game.getCardState(spell).isInZone(ZoneType.Graveyard));
        assertEquals(r.min, 2, "seen " + r.seen);
        assertEquals(r.max, 2);
        assertTrue(r.stillPickingAfterShort, "seen " + r.seen);
        assertTrue(game.getCardState(spell).isInZone(ZoneType.Graveyard), "Cathartic Reunion resolved; seen " + r.seen);
        assertTrue(game.getCardState(hand.get(0)).isInZone(ZoneType.Graveyard));
        assertTrue(game.getCardState(hand.get(1)).isInZone(ZoneType.Graveyard));
        assertTrue(game.getCardState(hand.get(2)).isInZone(ZoneType.Hand), "the third card was kept");
        assertEquals(SilentDefaults.count(), 0, "silent defaults: " + SilentDefaults.recent());
    }

    /** "As an additional cost, sacrifice two creatures": 2..2. */
    @Test
    public void sacrificeTwoCostIsExactlyTwo() throws Exception {
        start();
        add("Swamp", me, ZoneType.Battlefield);
        add("Swamp", me, ZoneType.Battlefield);
        Card spell = add("Bankrupt in Blood", me, ZoneType.Hand);
        List<Card> bodies = new ArrayList<>();
        for (String n : List.of("Grizzly Bears", "Ornithopter", "Serra Angel")) {
            bodies.add(add(n, me, ZoneType.Battlefield));
        }
        mainPhase();
        Cast r = cast(spell, ZoneType.Hand, bodies.subList(0, 2), true, () -> game.getCardState(spell).isInZone(ZoneType.Graveyard));
        assertEquals(r.min, 2, "seen " + r.seen);
        assertEquals(r.max, 2);
        assertTrue(r.stillPickingAfterShort, "seen " + r.seen);
        assertTrue(game.getCardState(spell).isInZone(ZoneType.Graveyard), "Bankrupt in Blood resolved; seen " + r.seen);
        assertTrue(game.getCardState(bodies.get(0)).isInZone(ZoneType.Graveyard));
        assertTrue(game.getCardState(bodies.get(1)).isInZone(ZoneType.Graveyard));
        assertTrue(game.getCardState(bodies.get(2)).isInZone(ZoneType.Battlefield), "the third creature stayed");
        assertEquals(SilentDefaults.count(), 0, "silent defaults: " + SilentDefaults.recent());
    }

    /** "Exile X creature cards from your graveyard" with X chosen earlier (X = 2): the pick is exactly 2. */
    @Test
    public void exileXCostIsExactlyTheChosenX() throws Exception {
        start();
        add("Swamp", me, ZoneType.Battlefield);
        add("Swamp", me, ZoneType.Battlefield);
        Card spell = add("Chill Haunting", me, ZoneType.Hand);
        Card victim = add("Serra Angel", game.getPlayers().get(1), ZoneType.Battlefield);
        List<Card> grave = new ArrayList<>();
        for (String n : List.of("Grizzly Bears", "Ornithopter", "Hill Giant")) {
            grave.add(add(n, me, ZoneType.Graveyard));
        }
        mainPhase();
        int[] bounds = {-1, -1};
        int[] picked = {0};
        List<String> seen = play(() -> game.getCardState(spell).isInZone(ZoneType.Graveyard) || game.getPhaseHandler().getPhase() != PhaseType.MAIN1, in -> {
            if (in instanceof InputPassPriority) {
                return game.getCardState(spell).isInZone(ZoneType.Hand) ? () -> select(spell) : null;
            }
            if (in instanceof InputSelectTargets) {
                return () -> select(victim);
            }
            if (in instanceof InputSelectManyBase<?>) {
                if (bounds[0] < 0) {
                    JsonObject sel = awaitSelection();
                    bounds[0] = sel.get("min").getAsInt();
                    bounds[1] = sel.get("max").getAsInt();
                }
                return () -> select(grave.get(picked[0]++));
            }
            return null;
        }, m -> {
            for (JsonElement c : m.getAsJsonArray("choices")) {
                if ("2".equals(c.getAsJsonObject().get("label").getAsString())) {
                    JsonArray a = new JsonArray();
                    a.add(c.getAsJsonObject().get("i").getAsInt());
                    return a;
                }
            }
            return null;
        });
        assertEquals(bounds[0], 2, "min is the X chosen earlier; seen " + seen);
        assertEquals(bounds[1], 2, "max is the X chosen earlier; seen " + seen);
        assertTrue(game.getCardState(spell).isInZone(ZoneType.Graveyard), "Chill Haunting resolved; seen " + seen);
        assertTrue(game.getCardState(grave.get(0)).isInZone(ZoneType.Exile) && game.getCardState(grave.get(1)).isInZone(ZoneType.Exile), "seen " + seen);
        assertTrue(game.getCardState(grave.get(2)).isInZone(ZoneType.Graveyard));
        assertEquals(SilentDefaults.count(), 0, "silent defaults: " + SilentDefaults.recent());
    }

    /** An "up to" effect still takes fewer than its maximum. */
    @Test
    public void upToNEffectAcceptsFewer() throws Exception {
        start();
        for (int i = 0; i < 3; i++) {
            add("Forest", me, ZoneType.Battlefield);
        }
        Card spell = add("Cultivate", me, ZoneType.Hand);
        mainPhase();
        int[] min = {-1};
        int[] max = {-1};
        int[] chosen = {0};
        int landsBefore = me.getCardsIn(ZoneType.Hand).size();
        List<String> seen = play(() -> game.getCardState(spell).isInZone(ZoneType.Graveyard) || game.getPhaseHandler().getPhase() != PhaseType.MAIN1, in -> {
            if (in instanceof InputPassPriority) {
                return game.getCardState(spell).isInZone(ZoneType.Hand) ? () -> select(spell) : null;
            }
            if (in instanceof InputSelectManyBase<?> sm) {
                if (chosen[0] == 0) {
                    JsonObject sel = awaitSelection();
                    min[0] = sel.get("min").getAsInt();
                    max[0] = sel.get("max").getAsInt();
                    chosen[0] = 1;
                    Card land = null;
                    for (Card c : me.getCardsIn(ZoneType.Library)) {
                        if (shown(sel, "cards").contains(c.getId())) {
                            land = c;
                            break;
                        }
                    }
                    assertNotNull(land, "the library's basic lands are offered");
                    Card pick = land;
                    return () -> {
                        select(pick);
                        ok();
                    };
                }
                return null;
            }
            return null;
        });
        assertEquals(min[0], 0, "'up to' keeps min 0; seen " + seen);
        assertEquals(max[0], 2, "seen " + seen);
        assertTrue(game.getCardState(spell).isInZone(ZoneType.Graveyard), "Cultivate resolved with one land chosen; seen " + seen);
        assertTrue(me.getCardsIn(ZoneType.Hand).size() >= landsBefore - 1);
        assertEquals(SilentDefaults.count(), 0, "silent defaults: " + SilentDefaults.recent());
    }

    /**
     * A pick the engine rejects after OK (crew with too little power) cancels the activation, and the seat is told why:
     * a {@code message} call, which the page shows as a notice.
     */
    @Test
    public void aPickTheEngineRejectsSaysWhy() throws Exception {
        start();
        Card copter = add("Smuggler's Copter", me, ZoneType.Battlefield);
        Card weak = add("Ornithopter", me, ZoneType.Battlefield);
        Card strong = add("Grizzly Bears", me, ZoneType.Battlefield);
        mainPhase();
        boolean[] sawPick = {false};
        boolean[] rolledBack = {false};
        List<String> seen = play(() -> rolledBack[0] || game.getPhaseHandler().getPhase() != PhaseType.MAIN1, in -> {
            if (in instanceof InputPassPriority) {
                if (sawPick[0]) {
                    rolledBack[0] = true;
                    return null;
                }
                return () -> select(copter);
            }
            if (in instanceof InputSelectManyBase<?>) {
                sawPick[0] = true;
                awaitSelection();
                return () -> {
                    select(weak);
                    ok();
                };
            }
            return null;
        });
        assertTrue(rolledBack[0], "the activation was cancelled; seen " + seen);
        assertFalse(copter.isCreature(), "the Vehicle was not crewed");
        assertFalse(weak.isTapped(), "nothing stayed tapped");
        String message = seat.lastCall("message");
        assertNotNull(message, "the seat is told why; frames " + seat.count("showPromptMessage"));
        assertTrue(message.contains("Power"), message);
        assertNotNull(strong);
        assertEquals(SilentDefaults.count(), 0, "silent defaults: " + SilentDefaults.recent());
    }
}
