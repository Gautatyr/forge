package forge.fork.web.seat;

import static org.testng.Assert.assertEquals;
import static org.testng.Assert.assertTrue;
import static org.testng.Assert.fail;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.function.BooleanSupplier;
import java.util.function.Function;

import org.testng.annotations.AfterMethod;
import org.testng.annotations.BeforeClass;
import org.testng.annotations.Test;

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
import forge.game.card.CounterType;
import forge.game.phase.PhaseHandler;
import forge.game.phase.PhaseType;
import forge.game.player.Player;
import forge.game.player.RegisteredPlayer;
import forge.game.zone.ZoneType;
import forge.gamemodes.match.input.Input;
import forge.gamemodes.match.input.InputPassPriority;
import forge.gamemodes.match.input.InputPayMana;
import forge.gui.GuiBase;
import forge.gui.control.GameEventForwarder;
import forge.player.LobbyPlayerHuman;
import forge.player.PlayerControllerHuman;
import forge.trackable.TrackableCollection;
import forge.fork.web.bridge.GameStream;
import forge.fork.web.bridge.GameStream.HiddenPolicy;
import forge.fork.web.bridge.visibility.TestEngine;

/** Issue #173: counters a permanent enters with reach the seat's view. */
public class HumanSeatCountersTest {

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

    /** Seat 0 is a {@code PlayerControllerHuman} on a {@link WebGuiGame}, as {@code HostedMatch} wires it; one AI opponent. */
    private void start() {
        SilentDefaults.reset();
        SilentDefaults.setStrict(true);
        gameThread = Executors.newSingleThreadExecutor(r -> new Thread(r, "Game-173"));
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
        for (int i = 0; i < 10; i++) {
            TestEngine.add("Plains", me, ZoneType.Library);
            TestEngine.add("Plains", game.getPlayers().get(1), ZoneType.Library);
        }
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

    private List<String> names(ZoneType zone) {
        List<String> l = new ArrayList<>();
        for (Card c : me.getCardsIn(zone)) {
            l.add(c.getName());
        }
        return l;
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

    /**
     * Runs the engine loop on the game thread until {@code done}, acting on each new input of the seat (null = OK) and
     * answering each prompt ({@code onPrompt} returns the reply value; null fails the test). Same pacing as
     * {@code HumanSeatStackTargetsTest.play}: one action at a time, each followed by a "sync" marker.
     */
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
                seen.add("prompt " + m.get("method").getAsString() + " " + m.get("message"));
                JsonElement v = onPrompt.apply(m);
                if (v == null) {
                    fail("unexpected prompt " + m + "; seen " + seen);
                }
                JsonObject r = new JsonObject();
                r.addProperty("t", "reply");
                r.add("id", m.get("id"));
                r.add("value", v);
                stream.clientMessage(0, r, seat);
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
            GuiBase.getInterface().invokeInEdtAndWait(() -> { });
            Runnable r = onInput.apply(in);
            (r == null ? (Runnable) this::ok : r).run();
            synced = false;
            action("sync", "\"id\":" + (++sync));
        }
        loop.get(1, TimeUnit.SECONDS);
        return seen;
    }


    /** The seat's own view of one card: its {@code props} object in the snapshot the bridge would serve it now. */
    private JsonObject viewOf(Card c) throws InterruptedException {
        // the stream batches: wait until it has flushed the card's move to the battlefield
        long end = System.currentTimeMillis() + 5_000;
        while (System.currentTimeMillis() < end && !"Battlefield".equals(rawView(c).get("Zone").getAsString())) {
            Thread.sleep(25);
        }
        return rawView(c);
    }

    private JsonObject rawView(Card c) {
        JsonObject snap = JsonParser.parseString(stream.snapshot(0)).getAsJsonObject();
        for (JsonElement o : snap.getAsJsonArray("objects")) {
            JsonObject obj = o.getAsJsonObject();
            if ("card".equals(obj.get("type").getAsString()) && obj.get("id").getAsInt() == c.getId()) {
                return obj.getAsJsonObject("props");
            }
        }
        throw new AssertionError("card " + c.getId() + " not in the snapshot");
    }

    private void castFromHand(Card spell, Card... lands) throws Exception {
        boolean[] cast = {false};
        int[] paid = {0};
        boolean[] resolved = {false};
        // done once the seat got priority back with the permanent on the table: the bridge flushes its batch then
        play(() -> resolved[0],
                in -> {
                    if (in instanceof InputPassPriority && !cast[0]) {
                        cast[0] = true;
                        return () -> select(spell);
                    }
                    if (in instanceof InputPassPriority && game.getCardState(spell).isInZone(ZoneType.Battlefield) && game.getStack().isEmpty()) {
                        resolved[0] = true;
                    }
                    if (in instanceof InputPayMana && paid[0] < lands.length) {
                        Card l = lands[paid[0]++];
                        return () -> select(l);
                    }
                    return null;
                },
                m -> null);
    }

    @Test
    public void aPermanentThatEntersWithCountersCarriesThemInTheSeatsView() throws Exception {
        start();
        Card a = add("Island", me, ZoneType.Battlefield);
        Card b = add("Island", me, ZoneType.Battlefield);
        add("Grizzly Bears", me, ZoneType.Battlefield);
        add("Grizzly Bears", me, ZoneType.Battlefield);
        Card journal = add("Investigator's Journal", me, ZoneType.Hand);
        castFromHand(journal, a, b);
        Card onBf = me.getCardsIn(ZoneType.Battlefield).stream().filter(c -> c.getName().equals("Investigator's Journal")).findFirst().orElseThrow();
        assertEquals(onBf.getCounters(CounterType.getType("SUSPECT")), 2, "the engine put the counters on");
        assertEquals(counters(onBf), "{\"SUSPECT\":2}", "the seat's view of the card carries its counters");

        // a counter removed (the Journal's own cost) reaches the seat's view at its next priority
        removeOneThenGetPriority(onBf, CounterType.getType("SUSPECT"));
        assertEquals(counters(onBf), "{\"SUSPECT\":1}");
        removeOneThenGetPriority(onBf, CounterType.getType("SUSPECT"));
        assertEquals(counters(onBf), "{}", "no counter left: the view says so, it does not keep the old count");
    }

    private String counters(Card c) throws InterruptedException {
        JsonObject props = viewOf(c);
        assertTrue(props.has("Counters"), "the seat's view of the card has its counters: " + props);
        return props.getAsJsonObject("Counters").toString();
    }

    private void removeOneThenGetPriority(Card c, CounterType type) throws Exception {
        int[] seen = {0};
        play(() -> seen[0] >= 2,
                in -> {
                    if (in instanceof InputPassPriority && ++seen[0] == 1) {
                        return () -> {
                            c.subtractCounter(type, 1, me);
                            ok();
                        };
                    }
                    return null;
                },
                m -> null);
    }
}
