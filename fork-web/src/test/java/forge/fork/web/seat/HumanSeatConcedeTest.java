package forge.fork.web.seat;

import static org.testng.Assert.assertEquals;
import static org.testng.Assert.assertFalse;
import static org.testng.Assert.assertNotEquals;
import static org.testng.Assert.assertNotNull;
import static org.testng.Assert.assertTrue;
import static org.testng.Assert.fail;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.function.BooleanSupplier;

import org.testng.annotations.AfterMethod;
import org.testng.annotations.BeforeClass;
import org.testng.annotations.Test;

import com.google.common.eventbus.Subscribe;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

import forge.ai.LobbyPlayerAi;
import forge.deck.Deck;
import forge.game.Game;
import forge.game.GameRules;
import forge.game.GameStage;
import forge.game.GameType;
import forge.game.card.Card;
import forge.game.event.GameEventPlayerPriority;
import forge.game.Match;
import forge.game.phase.PhaseHandler;
import forge.game.phase.PhaseType;
import forge.game.player.GameLossReason;
import forge.game.player.Player;
import forge.game.player.RegisteredPlayer;
import forge.game.zone.ZoneType;
import forge.gamemodes.match.input.Input;
import forge.gamemodes.match.input.InputAttack;
import forge.gamemodes.match.input.InputPayMana;
import forge.gamemodes.match.input.InputPassPriority;
import forge.gamemodes.match.input.InputSelectEntitiesFromList;
import forge.gui.control.GameEventForwarder;
import forge.player.LobbyPlayerHuman;
import forge.player.PlayerControllerHuman;
import forge.trackable.TrackableCollection;
import forge.fork.web.bridge.GameStream;
import forge.fork.web.bridge.GameStream.HiddenPolicy;
import forge.fork.web.bridge.visibility.TestEngine;

/**
 * Issue #61: the seat's concede, sent while the game runs, takes effect on the game thread at a safe point: during
 * setup (the engine's first question to the seat, or the first priority in a multiplayer game), during an AI turn of a
 * 4-player game (the next priority), at the seat's own priority. Each test asserts what the engine recorded.
 * A player who leaves while the priority round started with it does not hold the others up (the engine ends a round
 * only when priority comes back to the player it started with).
 */
public class HumanSeatConcedeTest {

    private ExecutorService gameThread;
    private Thread driver;
    private Game game;
    private Player me;
    private PlayerControllerHuman pch;
    private GameStream stream;
    private WebGuiGame gui;
    private HumanSeatTriggersTest.Seat seat;

    @BeforeClass
    public void boot() {
        TestEngine.boot();
    }

    @AfterMethod(alwaysRun = true)
    public void stop() throws InterruptedException {
        if (driver != null) {
            driver.interrupt();
            driver.join(5000);
            driver = null;
        }
        if (gameThread != null) {
            gameThread.shutdownNow();
        }
        SilentDefaults.setStrict(null);
    }

    /** Seat 0 is a {@code PlayerControllerHuman} on a {@link WebGuiGame}, as {@code HostedMatch} wires it; AI opponents. */
    private void start(int players, int deckLands) {
        SilentDefaults.reset();
        SilentDefaults.setStrict(true);
        gameThread = Executors.newSingleThreadExecutor(r -> new Thread(r, "Game-61"));
        List<RegisteredPlayer> rps = new ArrayList<>();
        rps.add(new RegisteredPlayer(lands(deckLands)).setPlayer(new LobbyPlayerHuman("You")));
        for (int i = 1; i < players; i++) {
            rps.add(new RegisteredPlayer(lands(deckLands)).setPlayer(new LobbyPlayerAi("ai" + i, null)));
        }
        GameRules rules = new GameRules(GameType.Constructed);
        rules.setGamesPerMatch(1);
        game = new Match(rules, rps, "Test").createGame();
        me = game.getPlayers().get(0);
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
        seat = new HumanSeatTriggersTest.Seat();
        stream.addClient(seat, 0);
    }

    private static Deck lands(int n) {
        Deck d = new Deck("lands");
        if (n > 0) {
            d.getMain().add("Plains", n);
        }
        return d;
    }

    /** A game already in play: {@code turn}'s main phase, ten Plains in each library. */
    private void inPlay(Player turn) {
        game.setAge(GameStage.Play);
        for (Player p : game.getPlayers()) {
            for (int i = 0; i < 10; i++) {
                TestEngine.add("Plains", p, ZoneType.Library);
            }
        }
        game.getPhaseHandler().devModeSet(PhaseType.MAIN1, turn);
        game.getPhaseHandler().onStackResolved();
    }

    private void action(String method, String extra) {
        JsonObject a = JsonParser.parseString("{\"t\":\"action\",\"method\":\"" + method + "\"" + (extra == null ? "" : "," + extra) + "}").getAsJsonObject();
        stream.clientMessage(0, a, seat);
    }

    private void concede() {
        action("concede", null);
    }

    /** Runs the engine's main loop on the game thread until {@code done} (or the game ends). */
    private Future<?> loop(BooleanSupplier done) {
        final PhaseHandler ph = game.getPhaseHandler();
        return gameThread.submit(() -> {
            for (int i = 0; i < 2000 && !done.getAsBoolean() && !game.isGameOver(); i++) {
                ph.mainLoopStep();
            }
        });
    }

    private static void waitFor(BooleanSupplier c, long ms, String what) throws InterruptedException {
        long end = System.currentTimeMillis() + ms;
        while (!c.getAsBoolean()) {
            if (System.currentTimeMillis() > end) {
                fail(what + ": not within " + ms + " ms");
            }
            Thread.sleep(10);
        }
    }

    private void assertConceded(Player p) {
        assertNotNull(p.getOutcome(), p + " has an outcome");
        assertEquals(p.getOutcome().lossState, GameLossReason.Conceded, p + " conceded");
    }

    /** Answers the seat's setup questions as a player would: an AI starts, keep the hand. */
    private void answerSetup() {
        driver = new Thread(() -> {
            Input acted = null;
            long actedAt = 0;
            try {
                while (!Thread.currentThread().isInterrupted() && !game.isGameOver()) {
                    Thread.sleep(20);
                    Input in = pch.getInputQueue().getInput();
                    if (in == null || !gui.session().pump().waiting() || in == acted && System.currentTimeMillis() - actedAt < 1000) {
                        continue;
                    }
                    if (in instanceof InputSelectEntitiesFromList<?> && in != acted) {
                        action("selectPlayer", "\"player\":" + game.getPlayers().get(1).getId());
                    } else {
                        action("selectButtonOk", null);
                    }
                    acted = in;
                    actedAt = System.currentTimeMillis();
                }
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        }, "seat-61");
        driver.setDaemon(true);
        driver.start();
    }

    @Test(timeOut = 120_000)
    public void concedeDuringSetupEndsATwoPlayerGameAtTheSeatsFirstQuestion() throws Exception {
        start(2, 20);
        Player ai = game.getPlayers().get(1);
        concede(); // the game thread is about to set up the zones (Match.prepareAllZones)
        Thread.sleep(300);
        assertFalse(me.hasLost(), "nothing changes the game off the game thread");
        Future<?> f = gameThread.submit(() -> game.getMatch().startGame(game));
        f.get(60, TimeUnit.SECONDS); // no exception (it was IndexOutOfBounds in prepareAllZones)
        assertTrue(game.isGameOver());
        assertConceded(me);
        assertTrue(game.getOutcome().isWinner(ai.getLobbyPlayer()), "the AI won");
        assertEquals(SilentDefaults.count(), 0, "silent defaults: " + SilentDefaults.recent());
    }

    @Test(timeOut = 120_000)
    public void concedeDuringSetupOfAFourPlayerGameTakesEffectAtTheFirstPriorityAndTheOthersPlayOn() throws Exception {
        start(4, 10);
        List<Player> ais = new ArrayList<>(game.getPlayers().subList(1, 4));
        concede();
        Thread.sleep(300);
        assertFalse(me.hasLost(), "nothing changes the game off the game thread");
        answerSetup(); // the setup questions go on: the engine cannot leave out a player it asks during the mulligans
        Future<?> f = gameThread.submit(() -> game.getMatch().startGame(game));
        waitFor(me::hasLost, 60_000, "the concede took effect");
        assertConceded(me);
        assertEquals(game.getAge(), GameStage.Play, "at the first priority, after the mulligans");
        f.get(90, TimeUnit.SECONDS); // the three AIs play until their 10-card libraries run out
        assertTrue(game.isGameOver());
        assertConceded(me);
        int decked = 0;
        for (Player ai : ais) {
            if (ai.getOutcome() != null && ai.getOutcome().lossState == GameLossReason.Milled) {
                decked++;
            }
        }
        assertTrue(decked >= 2, "the others played on until all but one ran out of cards: " + game.getOutcome());
        assertEquals(SilentDefaults.count(), 0, "silent defaults: " + SilentDefaults.recent());
    }

    @Test(timeOut = 120_000)
    public void concedeDuringAnAiTurnOfAFourPlayerGameWaitsForTheGameThreadAndTheOthersPlayOn() throws Exception {
        start(4, 0);
        Player ai1 = game.getPlayers().get(1);
        inPlay(ai1);
        int turn = game.getPhaseHandler().getTurn();
        concede(); // the AI's turn, no input of the seat waits
        Thread.sleep(300);
        assertFalse(me.hasLost(), "nothing changes the game off the game thread");
        Future<?> f = loop(() -> game.getPhaseHandler().getTurn() > turn + 1);
        f.get(60, TimeUnit.SECONDS);
        assertConceded(me);
        assertFalse(game.isGameOver(), "three players go on");
        assertEquals(game.getPlayers().size(), 3);
        assertFalse(game.getPlayers().contains(me), "the seat is out");
        assertTrue(game.getPhaseHandler().getTurn() > turn + 1, "two more turns were played");
        assertNotEquals(game.getPhaseHandler().getPlayerTurn(), me);
        assertEquals(SilentDefaults.count(), 0, "silent defaults: " + SilentDefaults.recent());
    }

    @Test(timeOut = 120_000)
    public void concedeAtTheSeatsOwnPriorityInAFourPlayerGamePassesAndTheOthersPlayOn() throws Exception {
        start(4, 0);
        inPlay(me);
        int turn = game.getPhaseHandler().getTurn();
        Future<?> f = loop(() -> game.getPhaseHandler().getTurn() > turn + 1);
        waitFor(() -> pch.getInputQueue().getInput() instanceof InputPassPriority && gui.session().pump().waiting(), 30_000,
                "the seat's priority");
        concede(); // as the page sends it from a prompt other than priority: no OK after it
        f.get(60, TimeUnit.SECONDS); // the seat answers nothing more
        assertConceded(me);
        assertFalse(game.isGameOver(), "three players go on");
        assertFalse(game.getPlayers().contains(me), "the seat is out");
        assertTrue(game.getPhaseHandler().getTurn() > turn + 1, "the others' turns were played");
        assertEquals(SilentDefaults.count(), 0, "silent defaults: " + SilentDefaults.recent());
    }

    @Test(timeOut = 120_000)
    public void concedeDuringAnAiTurnOfATwoPlayerGameEndsItOnTheGameThread() throws Exception {
        start(2, 0);
        Player ai = game.getPlayers().get(1);
        inPlay(ai);
        concede(); // the AI's turn, no input of the seat waits
        Thread.sleep(300);
        assertFalse(me.hasLost(), "nothing changes the game off the game thread");
        loop(() -> false).get(60, TimeUnit.SECONDS); // no exception
        assertTrue(game.isGameOver());
        assertConceded(me);
        assertTrue(game.getOutcome().isWinner(ai.getLobbyPlayer()), "the AI won");
        assertEquals(SilentDefaults.count(), 0, "silent defaults: " + SilentDefaults.recent());
    }

    @Test(timeOut = 120_000)
    public void concedeAtTheSeatsAttackDeclarationInAFourPlayerGameStopsItAndTheOthersPlayOn() throws Exception {
        start(4, 0);
        inPlay(me);
        Card bears = TestEngine.add("Grizzly Bears", me, ZoneType.Battlefield);
        bears.setSickness(false);
        int turn = game.getPhaseHandler().getTurn();
        Future<?> f = loop(() -> game.getPhaseHandler().getTurn() > turn + 1);
        Input passed = null;
        long end = System.currentTimeMillis() + 30_000;
        while (!(pch.getInputQueue().getInput() instanceof InputAttack && gui.session().pump().waiting())) {
            if (System.currentTimeMillis() > end) {
                fail("the seat's attack declaration never came; input " + pch.getInputQueue().getInput() + ", phase "
                        + game.getPhaseHandler().getPhase());
            }
            Input in = pch.getInputQueue().getInput();
            if (in instanceof InputPassPriority && in != passed && gui.session().pump().waiting()) {
                action("selectButtonOk", null); // pass priority: on to combat
                passed = in;
            }
            Thread.sleep(10);
        }
        concede(); // the page sends no OK after it here: the seat is out, its input must not hold the others up
        f.get(60, TimeUnit.SECONDS);
        assertConceded(me);
        assertFalse(game.isGameOver(), "three players go on");
        assertFalse(game.getPlayers().contains(me), "the seat is out");
        assertTrue(game.getPhaseHandler().getTurn() > turn + 1, "the others' turns were played");
        assertEquals(SilentDefaults.count(), 0, "silent defaults: " + SilentDefaults.recent());
    }

    /** The prompts the seat received ({@code {"t":"prompt"}} frames). */
    private int promptsSent() {
        synchronized (seat) {
            return (int) seat.frames.stream().filter(f -> f.startsWith("{\"t\":\"prompt\"")).count();
        }
    }

    /** 4 players, an AI's turn: the seat concedes and is out, three players go on. */
    private void seatOutOfAFourPlayerGame() throws Exception {
        start(4, 0);
        inPlay(game.getPlayers().get(1));
        concede();
        loop(me::hasLost).get(60, TimeUnit.SECONDS);
        assertConceded(me);
        assertFalse(game.getPlayers().contains(me), "the seat is out");
        assertFalse(game.isGameOver(), "three players go on");
    }

    /**
     * Game thread: {@code ai} owns a face-down card in exile and loses. The engine reveals it to every registered player,
     * the seat out of the game included (CR 702.142f, {@code Player.revealFaceDownCards}): a {@code getChoices} reveal.
     */
    private void loseWithAFaceDownCardInExile(Player ai) {
        Card c = TestEngine.add("Grizzly Bears", ai, ZoneType.Exile);
        c.turnFaceDown(true);
        assertTrue(c.isRealFaceDown());
        ai.concede();
        game.getAction().checkGameOverCondition();
    }

    /** Issue #78: the seat is out; prompts to it are answered at once with the engine default and never sent. */
    @Test(timeOut = 120_000)
    public void aRevealToEveryPlayerAndAChoiceToTheSeatOutOfAFourPlayerGameAreAnsweredAtOnceAndTheGameGoesOn() throws Exception {
        seatOutOfAFourPlayerGame();
        Player ai2 = game.getPlayers().get(1);
        int before = promptsSent();
        long t0 = System.currentTimeMillis();
        gameThread.submit(() -> loseWithAFaceDownCardInExile(ai2)).get(10, TimeUnit.SECONDS); // a waiting prompt: 20 s
        assertTrue(ai2.hasLost());
        assertFalse(game.isGameOver(), "two players go on");
        // a real choice the engine asks the seat: GUI one() over 1..3; the engine default is the first option
        int n = gameThread.submit(() -> pch.chooseNumber(null, "Choose a number", 1, 3)).get(10, TimeUnit.SECONDS);
        assertEquals(n, 1, "the engine default");
        assertTrue(System.currentTimeMillis() - t0 < 5_000, "answered without waiting: " + (System.currentTimeMillis() - t0) + " ms");
        assertEquals(promptsSent(), before, "no prompt reaches the seat once it left the game");
        int turn = game.getPhaseHandler().getTurn();
        loop(() -> game.getPhaseHandler().getTurn() > turn + 1).get(60, TimeUnit.SECONDS);
        assertFalse(game.isGameOver(), "two players go on");
        assertTrue(game.getPhaseHandler().getTurn() > turn + 1, "the others' turns were played");
        assertEquals(SilentDefaults.count(), 0, "silent defaults: " + SilentDefaults.recent());
    }

    /** Issue #78 as found: the last opponent but one loses with a face-down card in exile; the game ends unanswered. */
    @Test(timeOut = 120_000)
    public void theRevealWhenTheLastOpponentButOneLosesDoesNotHoldUpTheEndOfTheGame() throws Exception {
        seatOutOfAFourPlayerGame();
        Player ai1 = game.getPlayers().get(0);
        Player ai2 = game.getPlayers().get(1);
        Player ai3 = game.getPlayers().get(2);
        int before = promptsSent();
        gameThread.submit(() -> {
            ai3.concede();
            game.getAction().checkGameOverCondition();
            loseWithAFaceDownCardInExile(ai2);
        }).get(10, TimeUnit.SECONDS); // a waiting prompt: 20 s
        assertTrue(game.isGameOver(), "the game reached its result");
        assertTrue(game.getOutcome().isWinner(ai1.getLobbyPlayer()), "the last AI standing won: " + game.getOutcome());
        assertConceded(me);
        assertEquals(promptsSent(), before, "no prompt reaches the seat once it left the game");
        assertEquals(SilentDefaults.count(), 0, "silent defaults: " + SilentDefaults.recent());
    }

    /**
     * 2 players: the seat losing ends the game, and the engine's end-of-game reveal of the opponent's face-down cards
     * still reaches it (it is not out of a game that goes on).
     */
    @Test(timeOut = 120_000)
    public void theSeatLosingATwoPlayerGameStillSeesTheEndOfGameReveal() throws Exception {
        start(2, 0);
        Player ai = game.getPlayers().get(1);
        inPlay(ai);
        Card c = TestEngine.add("Grizzly Bears", ai, ZoneType.Exile);
        c.turnFaceDown(true);
        int before = promptsSent();
        Future<?> f = gameThread.submit(() -> {
            me.concede();
            game.getAction().checkGameOverCondition();
        });
        waitFor(() -> promptsSent() > before, 10_000, "the reveal reaches the seat");
        String prompt;
        synchronized (seat) {
            prompt = seat.frames.stream().filter(fr -> fr.startsWith("{\"t\":\"prompt\"")).reduce((a, b) -> b).orElseThrow();
        }
        assertTrue(prompt.contains("\"method\":\"getChoices\""), prompt);
        JsonObject reply = new JsonObject();
        reply.addProperty("t", "reply");
        reply.add("id", JsonParser.parseString(prompt).getAsJsonObject().get("id"));
        reply.add("value", new com.google.gson.JsonArray());
        stream.clientMessage(0, reply, seat);
        f.get(10, TimeUnit.SECONDS);
        assertTrue(game.isGameOver());
        assertTrue(game.getOutcome().isWinner(ai.getLobbyPlayer()));
        assertEquals(SilentDefaults.count(), 0, "silent defaults: " + SilentDefaults.recent());
    }

    /** On the game thread, at the first priority of {@code who}: runs {@code r} once. */
    public static final class AtPriority {
        private final Player who;
        private final Runnable r;
        private boolean done;

        AtPriority(Player who, Runnable r) {
            this.who = who;
            this.r = r;
        }

        @Subscribe
        public void priority(GameEventPlayerPriority e) {
            if (!done && e.priority() == who.getView()) {
                done = true;
                r.run();
            }
        }
    }

    /** Sends the concede from the seat and waits until the seat queued it for the game thread. */
    private void concedeQueued() {
        concede();
        long end = System.currentTimeMillis() + 10_000;
        while (gui.session().pump().deferredCount() == 0 && System.currentTimeMillis() < end) {
            Thread.onSpinWait();
        }
        assertEquals(gui.session().pump().deferredCount(), 1, "the concede waits for a safe point");
    }

    @Test(timeOut = 120_000)
    public void concedeWhileAnAiHoldsPriorityInARoundTheSeatStartedInAFourPlayerGameAndTheOthersPlayOn() throws Exception {
        start(4, 0);
        inPlay(me); // the seat's main phase: the round starts with it
        Player ai1 = game.getPlayers().get(1);
        int turn = game.getPhaseHandler().getTurn();
        // the seat has passed; the concede runs at an AI's priority, in the round that started with the seat
        game.subscribeToEvents(new AtPriority(ai1, this::concedeQueued));
        Future<?> f = loop(() -> game.getPhaseHandler().getTurn() > turn + 1);
        waitFor(() -> pch.getInputQueue().getInput() instanceof InputPassPriority && gui.session().pump().waiting(), 30_000,
                "the seat's priority");
        action("selectButtonOk", null); // pass
        f.get(60, TimeUnit.SECONDS);
        assertConceded(me);
        assertFalse(game.isGameOver(), "three players go on");
        assertFalse(game.getPlayers().contains(me), "the seat is out");
        assertTrue(game.getPhaseHandler().getTurn() > turn + 1, "the others' turns were played: phase "
                + game.getPhaseHandler().getPhase() + ", priority " + game.getPhaseHandler().getPriorityPlayer());
        assertEquals(SilentDefaults.count(), 0, "silent defaults: " + SilentDefaults.recent());
    }

    @Test(timeOut = 120_000)
    public void concedeAtTheSeatsPriorityAfterItCastASpellOnAnAiTurnInAFourPlayerGameAndTheOthersPlayOn() throws Exception {
        start(4, 0);
        Player ai1 = game.getPlayers().get(1);
        inPlay(ai1);
        TestEngine.add("Swamp", me, ZoneType.Battlefield);
        Card ritual = TestEngine.add("Dark Ritual", me, ZoneType.Hand);
        int turn = game.getPhaseHandler().getTurn();
        Future<?> f = loop(() -> game.getPhaseHandler().getTurn() > turn + 1);
        waitFor(() -> pch.getInputQueue().getInput() instanceof InputPassPriority && gui.session().pump().waiting(), 30_000,
                "the seat's priority on the AI's turn");
        action("selectCard", "\"card\":" + ritual.getId());
        waitFor(() -> pch.getInputQueue().getInput() instanceof InputPayMana && gui.session().pump().waiting(), 30_000,
                "the payment");
        action("selectButtonOk", null); // auto-pay: the Swamp
        // the seat holds priority again with its spell on the stack: the round now starts with it
        waitFor(() -> pch.getInputQueue().getInput() instanceof InputPassPriority && gui.session().pump().waiting()
                && !game.getStack().isEmpty(), 30_000, "the seat's priority over its spell");
        concede();
        f.get(60, TimeUnit.SECONDS);
        assertConceded(me);
        assertFalse(game.isGameOver(), "three players go on");
        assertFalse(game.getPlayers().contains(me), "the seat is out");
        assertTrue(game.getPhaseHandler().getTurn() > turn + 1, "the others' turns were played: phase "
                + game.getPhaseHandler().getPhase() + ", priority " + game.getPhaseHandler().getPriorityPlayer());
        assertEquals(SilentDefaults.count(), 0, "silent defaults: " + SilentDefaults.recent());
    }
}
