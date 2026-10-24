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
import forge.game.zone.ZoneType;
import forge.gamemodes.match.input.Input;
import forge.gamemodes.match.input.InputPassPriority;
import forge.gamemodes.match.input.InputSelectCardsFromList;
import forge.gui.control.GameEventForwarder;
import forge.player.LobbyPlayerHuman;
import forge.player.PlayerControllerHuman;
import forge.trackable.TrackableCollection;
import forge.fork.web.bridge.GameStream;
import forge.fork.web.bridge.GameStream.HiddenPolicy;
import forge.fork.web.bridge.visibility.TestEngine;

/**
 * Issue #139: a selection input that does not allow Cancel (a mandatory discard) refuses a {@code selectButtonCancel}:
 * the engine's {@code InputSelectManyBase.onCancel} would clear the selection and end the input with nothing chosen.
 * Cancels the input allows keep working (InputInfoTest: an "unless" cost declined; HumanSeatPaymentTest: a payment).
 */
public class MandatoryPickCancelTest {

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

    private void start() {
        SilentDefaults.reset();
        SilentDefaults.setStrict(true);
        gameThread = Executors.newSingleThreadExecutor(r -> new Thread(r, "Game-139"));
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

    private void select(Card c) {
        action("selectCard", "\"card\":" + c.getId());
    }

    /** As {@code HumanSeatStackTargetsTest.play}: acts once per shown prompt message, each action followed by a sync marker. */
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
                fail("game loop stuck; seen " + seen + "; input " + pch.getInputQueue().getInput() + "; last message " + seat.lastCall("showPromptMessage"));
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
            (r == null ? (Runnable) () -> action("selectButtonOk", null) : r).run();
            synced = false;
            action("sync", "\"id\":" + (++sync));
        }
        loop.get(1, TimeUnit.SECONDS);
        return seen;
    }

    private void main1() {
        game.getPhaseHandler().devModeSet(PhaseType.MAIN1, me);
        game.getPhaseHandler().onStackResolved();
    }

    /** The reasons the seat was given for each refused {@code method}. */
    private List<String> refusals(String method) {
        List<String> out = new ArrayList<>();
        for (String f : seat.all().split("\n")) {
            JsonObject m = JsonParser.parseString(f).getAsJsonObject();
            if ("actionRejected".equals(m.get("t").getAsString()) && m.has("method") && method.equals(m.get("method").getAsString())) {
                out.add(m.get("reason").getAsString());
            }
        }
        return out;
    }

    /**
     * Faithless Looting: "Draw two cards, then discard two cards." A Cancel sent at the discard is refused and the input
     * keeps waiting; the two cards picked afterwards are the ones discarded. Unfixed, the Cancel cleared the selection
     * and the discard resolved with nothing discarded.
     */
    @Test
    public void aMandatoryDiscardRefusesCancel() throws Exception {
        start();
        add("Mountain", me, ZoneType.Battlefield);
        Card looting = add("Faithless Looting", me, ZoneType.Hand);
        Card bolt = add("Lightning Bolt", me, ZoneType.Hand);
        Card shock = add("Shock", me, ZoneType.Hand);
        main1();
        boolean[] cast = {false};
        boolean[] asked = {false};
        List<String> seen = play(() -> cast[0] && game.getStack().isEmpty() && game.getCardState(looting).isInZone(ZoneType.Graveyard)
                        || game.getPhaseHandler().getPhase() != PhaseType.MAIN1,
                in -> {
                    if (in instanceof InputPassPriority && !cast[0]) {
                        cast[0] = true;
                        return () -> select(looting);
                    }
                    if (in instanceof InputSelectCardsFromList && !asked[0]) {
                        asked[0] = true;
                        return () -> {
                            action("selectButtonCancel", null);
                            select(bolt);
                            select(shock);
                        };
                    }
                    return null;
                });
        assertTrue(asked[0], "the discard was asked; seen " + seen);
        assertTrue(game.getCardState(bolt).isInZone(ZoneType.Graveyard) && game.getCardState(shock).isInZone(ZoneType.Graveyard),
                "the two picked cards were discarded; seen " + seen);
        assertEquals(me.getZone(ZoneType.Hand).size(), 2, "the two drawn cards stayed in hand; seen " + seen);
        assertEquals(refusals("selectButtonCancel").size(), 1, "the Cancel was refused with a reason; seen " + seen);
        assertEquals(SilentDefaults.count(), 0, "silent defaults: " + SilentDefaults.recent());
    }
}

