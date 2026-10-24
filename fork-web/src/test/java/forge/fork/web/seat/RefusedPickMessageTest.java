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
import forge.gamemodes.match.input.InputSelectTargets;
import forge.gui.control.GameEventForwarder;
import forge.player.LobbyPlayerHuman;
import forge.player.PlayerControllerHuman;
import forge.trackable.TrackableCollection;
import forge.fork.web.bridge.GameStream;
import forge.fork.web.bridge.GameStream.HiddenPolicy;
import forge.fork.web.bridge.visibility.TestEngine;

/**
 * Issue #156: a refused target pick ("The selected card is not a player.") reaches the seat as a {@code message} note, not
 * as the input's prompt: the question stays what the seat's page shows, also for a reconnecting seat (its greeting replays
 * the last prompt). Unfixed, the refusal replaced the question, and the page showed it beside the enabled OK of the next
 * pick.
 */
public class RefusedPickMessageTest {

    private ExecutorService gameThread;
    private Game game;
    private Player me;
    private Player ai;
    private PlayerControllerHuman pch;
    private GameStream stream;
    private HumanSeatTriggersTest.Seat seat;
    private WebSeats seats;

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
        gameThread = Executors.newSingleThreadExecutor(r -> new Thread(r, "Game-156"));
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
        seats = new WebSeats(stream, new WebSeats.Timeouts(20_000, 20_000));
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

    private void selectPlayer(Player p) {
        action("selectPlayer", "\"player\":" + p.getId());
    }

    /** The first argument of each {@code method} call among {@code frames}, or the prompt text for {@code showPromptMessage}. */
    private static List<String> texts(String frames, String method) {
        List<String> out = new ArrayList<>();
        for (String f : frames.split("\n")) {
            if (f.isBlank()) {
                continue;
            }
            JsonObject m = JsonParser.parseString(f).getAsJsonObject();
            if ("call".equals(m.get("t").getAsString()) && method.equals(m.get("method").getAsString())) {
                out.add(m.get("args").getAsJsonArray().get("showPromptMessage".equals(method) ? 1 : 0).getAsString());
            }
        }
        return out;
    }

    /**
     * Merrow Witsniper's enter trigger asks for a target player; a card of the hand is clicked first. The refusal is one
     * {@code message} note; every prompt the seat got, and the greeting of a reconnecting seat, is the question; the player
     * picked next is accepted.
     */
    @Test
    public void aRefusedTargetIsANoteAndTheQuestionStays() throws Exception {
        start();
        add("Island", me, ZoneType.Battlefield);
        Card witsniper = add("Merrow Witsniper", me, ZoneType.Hand);
        Card island = add("Island", me, ZoneType.Hand);
        main1();
        boolean[] cast = {false};
        boolean[] asked = {false};
        List<String> greeting = new ArrayList<>();
        List<String> seen = play(() -> asked[0] && game.getStack().isEmpty() && game.getCardState(witsniper).isInZone(ZoneType.Battlefield)
                        || game.getPhaseHandler().getPhase() != PhaseType.MAIN1,
                in -> {
                    if (in instanceof InputPassPriority && !cast[0]) {
                        cast[0] = true;
                        return () -> select(witsniper);
                    }
                    if (in instanceof InputSelectTargets && !asked[0]) {
                        asked[0] = true;
                        return () -> {
                            select(island);
                            long end = System.currentTimeMillis() + 10_000;
                            while (texts(seat.all(), "message").isEmpty() && System.currentTimeMillis() < end) {
                                Thread.onSpinWait();
                            }
                            greeting.addAll(seats.greeting(0));
                            selectPlayer(ai);
                        };
                    }
                    return null;
                });
        assertTrue(asked[0], "the target was asked; seen " + seen);
        List<String> notes = texts(seat.all(), "message");
        assertEquals(notes.size(), 1, "the refusal came as one note; seen " + notes);
        assertTrue(notes.get(0).endsWith("The selected card is not a player."), notes.get(0));
        for (String prompt : texts(seat.all(), "showPromptMessage")) {
            assertFalse(prompt.contains("not a player"), "the refusal is no prompt: " + prompt);
        }
        List<String> greeted = texts(String.join("\n", greeting), "showPromptMessage");
        assertTrue(!greeted.isEmpty() && greeted.get(greeted.size() - 1).contains("Select target player"),
                "a reconnecting seat is greeted with the question; greeting " + greeted);
        assertTrue(game.getStack().isEmpty() && game.getCardState(witsniper).isInZone(ZoneType.Battlefield), "the player picked next was accepted");
        assertEquals(SilentDefaults.count(), 0, "silent defaults: " + SilentDefaults.recent());
    }
}
