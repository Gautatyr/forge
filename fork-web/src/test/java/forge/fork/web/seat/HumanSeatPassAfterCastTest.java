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
import forge.game.spellability.SpellAbilityStackInstance;
import forge.game.zone.ZoneType;
import forge.gamemodes.match.input.Input;
import forge.gamemodes.match.input.InputPassPriority;
import forge.gui.control.GameEventForwarder;
import forge.player.LobbyPlayerHuman;
import forge.player.PlayerControllerHuman;
import forge.trackable.TrackableCollection;
import forge.fork.web.bridge.GameStream;
import forge.fork.web.bridge.GameStream.HiddenPolicy;
import forge.fork.web.bridge.visibility.TestEngine;

/**
 * "Pass priority after casting" (memo U1b, off by default): with it on, the seat's own spell resolves without a second
 * press when nobody responds; an opponent's response still gives the seat priority; a cast sent with {@code hold} keeps
 * priority; off, the seat is asked again with its spell on top, as before.
 */
public class HumanSeatPassAfterCastTest {

    private ExecutorService gameThread;
    private Game game;
    private Player me;
    private Player ai;
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
    private void start(boolean passAfterCast) {
        SilentDefaults.reset();
        SilentDefaults.setStrict(true);
        gameThread = Executors.newSingleThreadExecutor(r -> new Thread(r, "Game-pac"));
        List<RegisteredPlayer> rps = new ArrayList<>();
        rps.add(new RegisteredPlayer(new Deck()).setPlayer(new LobbyPlayerHuman("You")));
        rps.add(new RegisteredPlayer(new Deck()).setPlayer(new LobbyPlayerAi("ai1", null)));
        GameRules rules = new GameRules(GameType.Constructed);
        game = new Game(rps, rules, new Match(rules, rps, "Test"));
        game.setAge(GameStage.Play);
        me = game.getPlayers().get(0);
        ai = game.getPlayers().get(1);
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
        stream.clientMessage(0, JsonParser.parseString("{\"t\":\"setPassAfterCast\",\"on\":" + passAfterCast + "}").getAsJsonObject(), seat);
        for (Player p : game.getPlayers()) {
            for (int i = 0; i < 10; i++) {
                TestEngine.add("Plains", p, ZoneType.Library);
            }
        }
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

    private void cast(Card c, boolean hold) {
        action("selectCard", "\"card\":" + c.getId() + (hold ? ",\"hold\":true" : ""));
    }

    /** Runs the engine loop on the game thread until {@code done}, acting on each new input of the seat (null = OK). As HumanSeatStackTargetsTest. */
    private List<String> play(BooleanSupplier done, Function<Input, Runnable> onInput) throws Exception {
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
                fail("game loop stuck; seen " + seen + "; input " + pch.getInputQueue().getInput());
            }
            JsonObject m = seat.inbox.poll(10, TimeUnit.MILLISECONDS);
            if (m != null && "prompt".equals(m.get("t").getAsString())) {
                fail("unexpected prompt " + m + "; seen " + seen);
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
            if (r == null) {
                action("selectButtonOk", null);
            } else {
                r.run();
            }
            synced = false;
            action("sync", "\"id\":" + (++sync));
        }
        loop.get(1, TimeUnit.SECONDS);
        return seen;
    }

    /** The seat's priority input with its own item on top of the stack. */
    private boolean ownItemOnTop(Input in) {
        SpellAbilityStackInstance top = in instanceof InputPassPriority ? game.getStack().peek() : null;
        return top != null && top.getActivatingPlayer() == me;
    }

    /**
     * What a player does at a priority input with its own item on top: nothing if the bridge passes it by itself
     * (the input goes away within 3 s), else a press of the main button, counted.
     */
    private Runnable pressUnlessPassed(Input in, int[] presses) {
        long end = System.currentTimeMillis() + 3000;
        while (pch.getInputQueue().getInput() == in && System.currentTimeMillis() < end) {
            try {
                Thread.sleep(10);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                break;
            }
        }
        if (pch.getInputQueue().getInput() != in) {
            return () -> { };
        }
        presses[0]++;
        return null;
    }

    /** Casts Grizzly Bears at the seat's first main phase; returns the presses at priority with the Bears on top. */
    private int castBears(boolean hold) throws Exception {
        add("Forest", me, ZoneType.Battlefield);
        add("Forest", me, ZoneType.Battlefield);
        Card bears = add("Grizzly Bears", me, ZoneType.Hand);
        game.getPhaseHandler().devModeSet(PhaseType.MAIN1, me);
        game.getPhaseHandler().onStackResolved();
        int[] presses = {0};
        List<String> seen = play(() -> game.getCardState(bears).isInZone(ZoneType.Battlefield) && game.getStack().isEmpty()
                        || game.getPhaseHandler().getPhase() != PhaseType.MAIN1,
                in -> {
                    if (in instanceof InputPassPriority && game.getStack().isEmpty() && game.getCardState(bears).isInZone(ZoneType.Hand)) {
                        return () -> cast(bears, hold);
                    }
                    return ownItemOnTop(in) ? pressUnlessPassed(in, presses) : null;
                });
        assertTrue(game.getCardState(bears).isInZone(ZoneType.Battlefield), "Grizzly Bears resolved; seen " + seen);
        assertEquals(SilentDefaults.count(), 0, "silent defaults: " + SilentDefaults.recent());
        return presses[0];
    }

    @Test
    public void onTheSeatsSpellResolvesWithoutASecondPress() throws Exception {
        start(true);
        assertEquals(castBears(false), 0, "no press with the Bears on the stack");
    }

    @Test
    public void offTheSeatIsAskedAgainWithItsSpellOnTop() throws Exception {
        start(false);
        assertEquals(castBears(false), 1, "one press to resolve the Bears, as before");
    }

    @Test
    public void aCastSentWithHoldKeepsPriority() throws Exception {
        start(true);
        assertEquals(castBears(true), 1, "the held cast gave the seat priority with the Bears on top");
    }

    @Test
    public void anOpponentsResponseStillGivesTheSeatPriority() throws Exception {
        start(true);
        for (int i = 0; i < 6; i++) {
            add("Forest", me, ZoneType.Battlefield);
        }
        Card wurm = add("Craw Wurm", me, ZoneType.Hand);
        add("Island", ai, ZoneType.Battlefield);
        add("Island", ai, ZoneType.Battlefield);
        Card counterspell = add("Counterspell", ai, ZoneType.Hand);
        game.getPhaseHandler().devModeSet(PhaseType.MAIN1, me);
        game.getPhaseHandler().onStackResolved();
        int[] presses = {0};
        boolean[] askedOverResponse = {false};
        List<String> seen = play(() -> game.getStack().isEmpty() && !game.getCardState(wurm).isInZone(ZoneType.Hand)
                        || game.getPhaseHandler().getPhase() != PhaseType.MAIN1,
                in -> {
                    if (in instanceof InputPassPriority && game.getStack().isEmpty() && game.getCardState(wurm).isInZone(ZoneType.Hand)) {
                        return () -> cast(wurm, false);
                    }
                    SpellAbilityStackInstance top = in instanceof InputPassPriority ? game.getStack().peek() : null;
                    if (top != null && top.getActivatingPlayer() == ai) {
                        askedOverResponse[0] = true;
                        return null; // let the Counterspell resolve
                    }
                    return ownItemOnTop(in) ? pressUnlessPassed(in, presses) : null;
                });
        assertTrue(game.getCardState(counterspell).isInZone(ZoneType.Graveyard), "the AI responded with Counterspell; seen " + seen);
        assertTrue(askedOverResponse[0], "the seat got priority over the opponent's response; seen " + seen);
        assertEquals(presses[0], 0, "the Wurm itself was passed without a press");
        assertTrue(game.getCardState(wurm).isInZone(ZoneType.Graveyard), "the Wurm was countered; seen " + seen);
        assertEquals(SilentDefaults.count(), 0, "silent defaults: " + SilentDefaults.recent());
    }
}
