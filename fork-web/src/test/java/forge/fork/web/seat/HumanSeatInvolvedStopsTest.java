package forge.fork.web.seat;

import static org.testng.Assert.assertEquals;
import static org.testng.Assert.assertFalse;
import static org.testng.Assert.assertTrue;
import static org.testng.Assert.fail;

import java.util.ArrayList;
import java.util.EnumSet;
import java.util.List;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.LinkedBlockingQueue;
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
import forge.game.combat.Combat;
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
import forge.fork.web.bridge.ClientSink;
import forge.fork.web.bridge.GameStream;
import forge.fork.web.bridge.GameStream.HiddenPolicy;
import forge.fork.web.bridge.visibility.TestEngine;

/**
 * "Stop only when I'm involved" (owner ruling 2026-10-22, memo U1a), with a real engine in a 4-player game: seat 0 is a
 * {@code PlayerControllerHuman} on a {@link WebGuiGame}, seats 1–3 are AIs (turn order 0, 1, 2, 3: seat 3 plays right
 * before the seat). The page's default opponent stops (beginning of combat, declare attackers, declare blockers, end step)
 * and the setting reach the bridge as the page sends them ({@code sendYieldUpdate}); each priority the seat is asked with
 * is recorded as {@code <turn seat>:<step>:<empty|stack>}.
 */
public class HumanSeatInvolvedStopsTest {

    /** The page's default opponent stops (fork-web/frontend/src/state/prefs.ts DEFAULT_STOPS), as engine phases (after the engine boots). */
    private static Set<PhaseType> oppStops() {
        return EnumSet.of(PhaseType.COMBAT_BEGIN, PhaseType.COMBAT_DECLARE_ATTACKERS, PhaseType.COMBAT_DECLARE_BLOCKERS, PhaseType.END_OF_TURN);
    }

    private ExecutorService gameThread;
    private Game game;
    private Player me;
    private List<Player> opps;
    private PlayerControllerHuman pch;
    private GameStream stream;
    private WebGuiGame gui;
    private Seat seat;

    static final class Seat implements ClientSink {
        final LinkedBlockingQueue<JsonObject> inbox = new LinkedBlockingQueue<>();

        @Override
        public void send(String json) {
            inbox.add(JsonParser.parseString(json).getAsJsonObject());
        }
    }

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
        sent = 0;
        gameThread = Executors.newSingleThreadExecutor(r -> new Thread(r, "Game-involved"));
        List<RegisteredPlayer> rps = new ArrayList<>();
        rps.add(new RegisteredPlayer(new Deck()).setPlayer(new LobbyPlayerHuman("You")));
        for (int i = 1; i <= 3; i++) {
            rps.add(new RegisteredPlayer(new Deck()).setPlayer(new LobbyPlayerAi("ai" + i, null)));
        }
        GameRules rules = new GameRules(GameType.Constructed);
        game = new Game(rps, rules, new Match(rules, rps, "Test"));
        game.setAge(GameStage.Play);
        me = game.getPlayers().get(0);
        opps = game.getPlayers().subList(1, 4);
        pch = (PlayerControllerHuman) me.getController();
        stream = new GameStream(HiddenPolicy.REDACT, null);
        WebSeats seats = new WebSeats(stream, new WebSeats.Timeouts(20_000, 20_000));
        gui = seats.newSeat(0);
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
        seat = new Seat();
        stream.addClient(seat, 0);
        for (Player p : game.getPlayers()) {
            for (int i = 0; i < 10; i++) {
                TestEngine.add("Plains", p, ZoneType.Library);
            }
        }
    }

    private Card add(String name, Player p) {
        Card c = TestEngine.add(name, p, ZoneType.Battlefield);
        c.setSickness(false);
        return c;
    }

    private int sent;

    private void yieldUpdate(String update) {
        JsonObject a = JsonParser.parseString("{\"t\":\"action\",\"method\":\"sendYieldUpdate\",\"update\":" + update + "}").getAsJsonObject();
        stream.clientMessage(0, a, seat);
        sent++;
    }

    /** As the page: every step of every player's turn, skipped unless a default stop (none on the seat's own turn here). */
    private void sendStops(boolean involved) throws InterruptedException {
        if (involved) {
            yieldUpdate("{\"kind\":\"InvolvedStops\",\"active\":true}"); // before the rows: either order works
        }
        for (Player p : game.getPlayers()) {
            for (PhaseType ph : PhaseType.values()) {
                boolean skip = p == me || !oppStops().contains(ph);
                yieldUpdate("{\"kind\":\"SkipPhase\",\"turnPlayer\":" + p.getId() + ",\"phase\":\"" + ph.name() + "\",\"skip\":" + skip + "}");
            }
        }
    }

    /** Game actions wait for the game thread's next priority (InputPump.defer): all sent ones queued before the game runs. */
    private void awaitQueued() throws InterruptedException {
        long end = System.currentTimeMillis() + 10_000;
        while (gui.session().pump().deferredCount() < sent) {
            if (System.currentTimeMillis() > end) {
                fail("yield updates not queued: " + gui.session().pump().deferredCount() + " of " + sent);
            }
            Thread.sleep(5);
        }
        sent = 0;
    }

    /**
     * Plays {@code turnPlayer}'s turn from {@code from} to its cleanup. The seat passes at each priority (recorded),
     * blocks with {@code blocker} when asked (null: no block).
     */
    private List<String> playTurn(Player turnPlayer, PhaseType from, Card blocker) throws Exception {
        awaitQueued();
        final PhaseHandler ph = game.getPhaseHandler();
        ph.devModeSet(from, turnPlayer);
        ph.onStackResolved();
        Future<?> loop = gameThread.submit(() -> {
            for (int i = 0; i < 300 && !game.isGameOver()
                    && !(ph.getPlayerTurn() == turnPlayer && ph.getPhase() == PhaseType.CLEANUP); i++) {
                ph.mainLoopStep();
            }
        });
        List<String> stops = new ArrayList<>();
        Input acted = null;
        long end = System.currentTimeMillis() + 30_000;
        while (!loop.isDone()) {
            if (System.currentTimeMillis() > end) {
                fail("game loop stuck; stops " + stops + "; input " + pch.getInputQueue().getInput());
            }
            JsonObject m = seat.inbox.poll(10, TimeUnit.MILLISECONDS);
            if (m != null && "prompt".equals(m.get("t").getAsString())) {
                fail("unexpected prompt " + m + "; stops " + stops);
            }
            Input in = pch.getInputQueue().getInput();
            if (in == null || in == acted || pch.getInputProxy().getInput() != in) {
                continue;
            }
            acted = in;
            if (in instanceof InputPassPriority) {
                stops.add(game.getPlayers().indexOf(ph.getPlayerTurn()) + ":" + ph.getPhase() + ":"
                        + (game.getStack().isEmpty() ? "empty" : "stack"));
            } else if (in instanceof InputBlock && blocker != null && game.getCombat() != null && !game.getCombat().getAttackers().isEmpty()) {
                action("selectCard", "\"card\":" + game.getCombat().getAttackers().get(0).getId());
                action("selectCard", "\"card\":" + blocker.getId());
            }
            action("selectButtonOk", null);
        }
        loop.get(1, TimeUnit.SECONDS);
        assertEquals(SilentDefaults.count(), 0, "silent defaults: " + SilentDefaults.recent());
        return stops;
    }

    private void action(String method, String extra) {
        JsonObject a = JsonParser.parseString("{\"t\":\"action\",\"method\":\"" + method + "\"" + (extra == null ? "" : "," + extra) + "}").getAsJsonObject();
        stream.clientMessage(0, a, seat);
    }

    private static List<String> empty(List<String> stops) {
        return stops.stream().filter(s -> s.endsWith(":empty")).toList();
    }

    /** Seat 1's Juggernaut must attack; Ghostly Prisons (no mana to pay) leave {@code target} the only player it can attack. */
    private Card juggernautAttacking(Player target) {
        for (Player p : game.getPlayers()) {
            if (p != target && p != opps.get(0)) {
                add("Ghostly Prison", p);
            }
        }
        return add("Juggernaut", opps.get(0));
    }

    @Test
    public void attackedTheSeatStopsAtDeclareAttackersAndBlockersOnlyNotAtBeginningOfCombatOrAnotherPlayersEndStep() throws Exception {
        start();
        Card bears = add("Grizzly Bears", me);
        Card juggernaut = juggernautAttacking(me);
        sendStops(true);
        List<String> stops = playTurn(opps.get(0), PhaseType.MAIN1, bears);
        assertEquals(empty(stops), List.of("1:COMBAT_DECLARE_ATTACKERS:empty", "1:COMBAT_DECLARE_BLOCKERS:empty"), "stops " + stops);
        assertTrue(game.getCardState(bears).isInZone(ZoneType.Graveyard), "the seat blocked: the Juggernaut killed the bears");
        assertEquals(me.getLife(), 20, "blocked");
        assertTrue(game.getCardState(juggernaut).isInZone(ZoneType.Battlefield));
    }

    @Test
    public void attackedWithoutBlockingTheSeatStillStopsAtDeclareBlockers() throws Exception {
        start();
        juggernautAttacking(me);
        sendStops(true);
        List<String> stops = playTurn(opps.get(0), PhaseType.MAIN1, null);
        assertEquals(empty(stops), List.of("1:COMBAT_DECLARE_ATTACKERS:empty", "1:COMBAT_DECLARE_BLOCKERS:empty"), "stops " + stops);
        assertEquals(me.getLife(), 15, "unblocked Juggernaut");
    }

    @Test
    public void anotherPlayerAttackedTheSeatIsNotStoppedOnThatTurn() throws Exception {
        start();
        add("Grizzly Bears", me);
        juggernautAttacking(opps.get(1));
        sendStops(true);
        List<String> stops = playTurn(opps.get(0), PhaseType.MAIN1, null);
        assertEquals(empty(stops), List.of(), "stops " + stops);
        assertEquals(opps.get(1).getLife(), 15, "the Juggernaut attacked seat 2");
    }

    @Test
    public void withTheSettingOffTheDefaultStopsAllHold() throws Exception {
        start();
        juggernautAttacking(opps.get(1));
        sendStops(false);
        List<String> stops = playTurn(opps.get(0), PhaseType.MAIN1, null);
        assertEquals(empty(stops), List.of("1:COMBAT_BEGIN:empty", "1:COMBAT_DECLARE_ATTACKERS:empty",
                "1:COMBAT_DECLARE_BLOCKERS:empty", "1:END_OF_TURN:empty"), "stops " + stops);
    }

    @Test
    public void turnedOffAgainThePagesRowsHoldAgain() throws Exception {
        start();
        juggernautAttacking(opps.get(1));
        sendStops(true);
        yieldUpdate("{\"kind\":\"InvolvedStops\",\"active\":false}");
        List<String> stops = playTurn(opps.get(0), PhaseType.MAIN1, null);
        assertEquals(empty(stops), List.of("1:COMBAT_BEGIN:empty", "1:COMBAT_DECLARE_ATTACKERS:empty",
                "1:COMBAT_DECLARE_BLOCKERS:empty", "1:END_OF_TURN:empty"), "stops " + stops);
    }

    @Test
    public void theEndStopHoldsOnlyOnTheTurnOfThePlayerRightBeforeTheSeat() throws Exception {
        start();
        sendStops(true);
        assertEquals(empty(playTurn(opps.get(2), PhaseType.MAIN2, null)), List.of("3:END_OF_TURN:empty"), "seat 3 plays right before the seat");
        assertEquals(empty(playTurn(opps.get(0), PhaseType.MAIN2, null)), List.of(), "seat 1 does not");
    }

    @Test
    public void aTriggerDuringASkippedStepStillStopsTheSeat() throws Exception {
        start();
        add("Dogged Pursuit", opps.get(0)); // its end step: each opponent loses 1 life
        sendStops(true);
        List<String> stops = playTurn(opps.get(0), PhaseType.MAIN2, null);
        assertTrue(stops.contains("1:END_OF_TURN:stack"), "the trigger on the stack asked the seat: " + stops);
        assertFalse(stops.contains("1:END_OF_TURN:empty"), "the step itself stays skipped: " + stops);
        assertEquals(me.getLife(), 19);
    }

    @Test
    public void involvementCountsPlaneswalkersAndBattlesTheSeatControlsOrProtectsAndItsCreaturesInCombat() {
        start();
        Player attacker = opps.get(0);
        Card pw = add("Ajani Goldmane", me);
        Card bears = add("Grizzly Bears", attacker);
        game.getPhaseHandler().devModeSet(PhaseType.COMBAT_DECLARE_ATTACKERS, attacker, false);
        Combat combat = new Combat(attacker);
        combat.initConstraints();
        assertFalse(InvolvedStops.attacked(combat, me));
        combat.addAttacker(bears, pw);
        assertTrue(InvolvedStops.attacked(combat, me), "the seat's planeswalker is attacked");
        assertFalse(InvolvedStops.attacked(combat, opps.get(1)));
        assertFalse(InvolvedStops.inCombat(combat, me));
        assertTrue(InvolvedStops.inCombat(combat, attacker));
        Card wall = add("Wall of Stone", opps.get(1));
        combat.addBlocker(bears, wall);
        assertTrue(InvolvedStops.inCombat(combat, opps.get(1)), "a blocker of seat 2");
        assertFalse(InvolvedStops.attacked(combat, opps.get(1)));
    }
}
