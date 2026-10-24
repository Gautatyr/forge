package forge.fork.web.seat;

import static org.testng.Assert.assertEquals;
import static org.testng.Assert.assertFalse;
import static org.testng.Assert.assertTrue;
import static org.testng.Assert.fail;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

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
import forge.gamemodes.match.input.InputBlock;
import forge.gamemodes.match.input.InputPassPriority;
import forge.gui.control.GameEventForwarder;
import forge.player.LobbyPlayerHuman;
import forge.player.PlayerControllerHuman;
import forge.trackable.TrackableCollection;
import forge.fork.web.bridge.GameStream;
import forge.fork.web.bridge.GameStream.HiddenPolicy;
import forge.fork.web.bridge.visibility.TestEngine;

/**
 * "Auto-pass when I can't act" and "Auto-yield" (issue #125; off by default, D4), with a real engine: seat 0 is a
 * {@code PlayerControllerHuman} on a {@link WebGuiGame}, seat 1 an AI. The page's messages ({@code setAutoPass},
 * {@code setAutoYield}, {@code sendYieldUpdate AutoYieldTo}) reach the seat's {@code YieldController}; every input the
 * seat is asked is recorded ({@code <phase>:<empty|stack>} for a priority, {@code block} for the blockers).
 */
public class HumanSeatAutoPassTest {

    private ExecutorService gameThread;
    private Game game;
    private Player me;
    private Player ai;
    private PlayerControllerHuman pch;
    private GameStream stream;
    private WebGuiGame gui;
    private HumanSeatInvolvedStopsTest.Seat seat;
    /** The {@code autoYieldTo} lists the seat was sent, in order. */
    private final List<List<String>> yields = new ArrayList<>();
    /** The {@code actionRejected} reasons the seat was sent. */
    private final List<String> rejected = new ArrayList<>();

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
        start(null);
    }

    /** {@code betweenBindAndOpen} runs after the controller is bound and before the seat's view opens (a new game's start). */
    private void start(Runnable betweenBindAndOpen) {
        SilentDefaults.reset();
        SilentDefaults.setStrict(true);
        yields.clear();
        rejected.clear();
        gameThread = Executors.newSingleThreadExecutor(r -> new Thread(r, "Game-autopass"));
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
        gui = seats.newSeat(0);
        pch.setGui(gui);
        gui.setGameView(null);
        gui.setGameView(game.getView());
        gui.setOriginalGameController(me.getView(), pch);
        if (betweenBindAndOpen != null) {
            betweenBindAndOpen.run();
        }
        GameEventForwarder fwd = new GameEventForwarder(gui);
        gui.setForwarder(fwd);
        game.subscribeToEvents(fwd);
        pch.getInputQueue().addObserver(fwd);
        gui.openView(new TrackableCollection<>(me.getView()));
        for (Player p : game.getPlayers()) {
            p.updateOpponentsForView();
        }
        seat = new HumanSeatInvolvedStopsTest.Seat();
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

    private void send(String json) {
        stream.clientMessage(0, JsonParser.parseString(json).getAsJsonObject(), seat);
    }

    private void action(String method, String extra) {
        send("{\"t\":\"action\",\"method\":\"" + method + "\"" + (extra == null ? "" : "," + extra) + "}");
    }

    /** Settings are game actions: queued until the game thread's next priority (InputPump.defer). */
    private void settings(boolean autoPass, boolean autoYield) throws InterruptedException {
        int before = gui.session().pump().deferredCount();
        send("{\"t\":\"setAutoPass\",\"on\":" + autoPass + "}");
        send("{\"t\":\"setAutoYield\",\"on\":" + autoYield + "}");
        long end = System.currentTimeMillis() + 10_000;
        while (gui.session().pump().deferredCount() < before + 2) {
            if (System.currentTimeMillis() > end) {
                fail("settings not queued");
            }
            Thread.sleep(5);
        }
    }

    private void noteRejection(JsonObject m) {
        if (m != null && "actionRejected".equals(m.get("t").getAsString())) {
            rejected.add(m.get("reason").getAsString());
        }
    }

    /** What the seat does at an input before the main button is pressed. */
    private interface OnInput {
        void at(Input in);
    }

    /** Plays {@code turnPlayer}'s turn from {@code from} to its cleanup; returns the inputs the seat was asked. */
    private List<String> playTurn(Player turnPlayer, PhaseType from, OnInput onInput) throws Exception {
        final PhaseHandler ph = game.getPhaseHandler();
        ph.devModeSet(from, turnPlayer);
        ph.onStackResolved();
        Future<?> loop = gameThread.submit(() -> {
            for (int i = 0; i < 300 && !game.isGameOver()
                    && !(ph.getPlayerTurn() == turnPlayer && ph.getPhase() == PhaseType.CLEANUP); i++) {
                ph.mainLoopStep();
            }
        });
        List<String> asked = new ArrayList<>();
        Input acted = null;
        long end = System.currentTimeMillis() + 30_000;
        while (!loop.isDone()) {
            if (System.currentTimeMillis() > end) {
                fail("game loop stuck; asked " + asked + "; input " + pch.getInputQueue().getInput());
            }
            JsonObject m = seat.inbox.poll(10, TimeUnit.MILLISECONDS);
            if (m != null && "prompt".equals(m.get("t").getAsString())) {
                fail("unexpected prompt " + m + "; asked " + asked);
            }
            if (m != null && "yields".equals(m.get("t").getAsString())) {
                List<String> keys = new ArrayList<>();
                m.getAsJsonArray("autoYieldTo").forEach(e -> keys.add(e.getAsString()));
                yields.add(keys);
            }
            noteRejection(m);
            Input in = pch.getInputQueue().getInput();
            if (in == null || in == acted || pch.getInputProxy().getInput() != in) {
                continue;
            }
            acted = in;
            if (in instanceof InputPassPriority) {
                asked.add(ph.getPhase() + ":" + (game.getStack().isEmpty() ? "empty" : "stack"));
            } else if (in instanceof InputBlock) {
                asked.add("block");
            }
            if (onInput != null) {
                onInput.at(in);
            }
            action("selectButtonOk", null);
        }
        loop.get(1, TimeUnit.SECONDS);
        // the last messages may still be in the inbox
        for (JsonObject m = seat.inbox.poll(); m != null; m = seat.inbox.poll()) {
            noteRejection(m);
            if ("yields".equals(m.get("t").getAsString())) {
                List<String> keys = new ArrayList<>();
                m.getAsJsonArray("autoYieldTo").forEach(e -> keys.add(e.getAsString()));
                yields.add(keys);
            }
        }
        assertEquals(SilentDefaults.count(), 0, "silent defaults: " + SilentDefaults.recent());
        return asked;
    }

    @Test
    public void offTheSeatIsAskedAtEveryStepOfItsTurn() throws Exception {
        start();
        List<String> asked = playTurn(me, PhaseType.MAIN1, null);
        assertTrue(asked.contains("MAIN1:empty") && asked.contains("END_OF_TURN:empty"), "asked " + asked);
    }

    @Test
    public void onTheSeatWithNothingToPlayIsNeverAsked() throws Exception {
        start();
        settings(true, false);
        List<String> asked = playTurn(me, PhaseType.MAIN1, null);
        assertEquals(asked, List.of(), "passed by the bridge");
    }

    @Test
    public void onTheSeatIsStillAskedWhereItHasAPlayableAction() throws Exception {
        start();
        add("Forest", me, ZoneType.Hand);
        settings(true, false);
        List<String> asked = playTurn(me, PhaseType.MAIN1, null);
        assertFalse(asked.isEmpty(), "the land drop is a playable action");
        assertTrue(asked.stream().allMatch(s -> s.startsWith("MAIN")), "asked only in the main phases: " + asked);
    }

    @Test
    public void onItIsPassedAgainOnceTheLastPlayableActionIsGone() throws Exception {
        start();
        Card forest = add("Forest", me, ZoneType.Hand);
        settings(true, false);
        List<String> asked = playTurn(me, PhaseType.MAIN1, in -> {
            if (in instanceof InputPassPriority && game.getCardState(forest).isInZone(ZoneType.Hand)) {
                action("selectCard", "\"card\":" + forest.getId());
            }
        });
        assertTrue(game.getCardState(forest).isInZone(ZoneType.Battlefield), "the seat played its land; asked " + asked);
        assertEquals(asked, List.of("MAIN1:empty"), "nothing left to do after the land");
    }

    @Test
    public void onBlocksAreStillDeclared() throws Exception {
        start();
        Card bears = add("Grizzly Bears", me, ZoneType.Battlefield);
        add("Juggernaut", ai, ZoneType.Battlefield);
        settings(true, false);
        List<String> asked = playTurn(ai, PhaseType.MAIN1, in -> {
            if (in instanceof InputBlock && game.getCombat() != null && !game.getCombat().getAttackers().isEmpty()) {
                action("selectCard", "\"card\":" + game.getCombat().getAttackers().get(0).getId());
                action("selectCard", "\"card\":" + bears.getId());
            }
        });
        assertTrue(asked.contains("block"), "the seat was asked to block: " + asked);
        assertEquals(me.getLife(), 20, "the Juggernaut was blocked");
    }

    /** At the first trigger the seat is asked about, "Always yield to this". */
    private OnInput yieldToTheTrigger(int[] pressed) {
        return in -> {
            if (in instanceof InputPassPriority && game.getStack().peek() != null && game.getStack().peek().isTrigger()) {
                pressed[0]++;
                if (pressed[0] == 1) {
                    int id = game.getStack().peek().getView().getId();
                    action("sendYieldUpdate", "\"update\":{\"kind\":\"AutoYieldTo\",\"stackItem\":" + id + ",\"active\":true}");
                }
            }
        };
    }

    /** Two Dogged Pursuits: two identical end step triggers (each opponent loses 1 life) on the AI's turn. */
    @Test
    public void alwaysYieldToThisPassesTheRepeatedTriggerWhenAutoYieldIsOn() throws Exception {
        start();
        add("Dogged Pursuit", ai, ZoneType.Battlefield);
        add("Dogged Pursuit", ai, ZoneType.Battlefield);
        settings(false, true);
        int[] pressed = {0};
        List<String> asked = playTurn(ai, PhaseType.MAIN2, yieldToTheTrigger(pressed));
        assertEquals(pressed[0], 1, "asked for the first trigger only; asked " + asked);
        assertEquals(me.getLife(), 18, "both triggers resolved");
        assertEquals(yields.get(yields.size() - 1).size(), 1, "the seat is told the ability: " + yields);
    }

    @Test
    public void withAutoYieldOffTheChosenAbilitiesAreKeptButNotHonoured() throws Exception {
        start();
        add("Dogged Pursuit", ai, ZoneType.Battlefield);
        add("Dogged Pursuit", ai, ZoneType.Battlefield);
        settings(false, false);
        int[] pressed = {0};
        List<String> asked = playTurn(ai, PhaseType.MAIN2, yieldToTheTrigger(pressed));
        assertEquals(pressed[0], 2, "asked for both triggers; asked " + asked);
        assertEquals(yields.get(yields.size() - 1).size(), 1, "still listed: " + yields);
    }

    @Test
    public void theSettingsOutliveTheGameThePageSentThemIn() throws Exception {
        start();
        settings(true, true);
        // a second controller bound for the same seat (the next game of the match) starts from the kept settings
        pch.getYieldController().setPref(forge.localinstance.properties.ForgePreferences.FPref.YIELD_AUTO_PASS_NO_ACTIONS, "false");
        gui.session().bindController(pch);
        assertTrue(pch.getYieldController().getBoolPref(forge.localinstance.properties.ForgePreferences.FPref.YIELD_AUTO_PASS_NO_ACTIONS),
                "auto-pass kept");
        assertFalse(pch.getYieldController().getDisableAutoYields(), "auto-yield kept");
    }

    private static final String BOGUS_ITEM = "\"update\":{\"kind\":\"AutoYieldTo\",\"stackItem\":987654,\"active\":true}";

    /** The item was gone when the deferred request ran: not an error for the player. */
    @Test
    public void alwaysYieldToAStackItemThatIsGoneIsIgnoredQuietly() throws Exception {
        start();
        action("sendYieldUpdate", BOGUS_ITEM);
        playTurn(me, PhaseType.MAIN1, null);
        assertEquals(rejected, List.of(), "nothing shown to the player");
    }

    @Test
    public void aMalformedYieldUpdateIsStillRefused() throws Exception {
        start();
        action("sendYieldUpdate", "\"update\":{\"kind\":\"AutoYieldTo\",\"stackItem\":987654}");
        action("sendYieldUpdate", "\"update\":{\"kind\":\"NoSuchKind\"}");
        playTurn(me, PhaseType.MAIN1, null);
        assertEquals(rejected, List.of("unsupported yield update", "unsupported yield update"));
    }

    /** The new game's controller is bound, the page toggles, then the view opens (SeatSession.openView). */
    @Test
    public void aToggleBetweenTheControllerBindingAndTheViewOpeningStillApplies() throws Exception {
        start(() -> {
            send("{\"t\":\"setAutoPass\",\"on\":true}");
            send("{\"t\":\"setAutoYield\",\"on\":true}");
        });
        assertTrue(pch.getYieldController().getBoolPref(forge.localinstance.properties.ForgePreferences.FPref.YIELD_AUTO_PASS_NO_ACTIONS),
                "auto-pass applied to the game's controller");
        assertFalse(pch.getYieldController().getDisableAutoYields(), "auto-yield applied");
        List<String> asked = playTurn(me, PhaseType.MAIN1, null);
        assertEquals(asked, List.of(), "passed by the bridge, as if set before the game");
    }
}
