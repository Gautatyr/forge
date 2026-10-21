package forge.web.seat;

import static org.testng.Assert.assertEquals;
import static org.testng.Assert.assertTrue;
import static org.testng.Assert.fail;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.LinkedBlockingQueue;
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
import forge.game.phase.PhaseHandler;
import forge.game.phase.PhaseType;
import forge.game.player.Player;
import forge.game.player.RegisteredPlayer;
import forge.game.zone.ZoneType;
import forge.gamemodes.match.input.Input;
import forge.gamemodes.match.input.InputBlock;
import forge.gui.control.GameEventForwarder;
import forge.player.LobbyPlayerHuman;
import forge.player.PlayerControllerHuman;
import forge.trackable.TrackableCollection;
import forge.web.bridge.ClientSink;
import forge.web.bridge.GameStream;
import forge.web.bridge.GameStream.HiddenPolicy;
import forge.web.bridge.visibility.TestEngine;

/**
 * Issues #54 and #48: the web human seat declares blockers through the same messages the page sends (attacker, then
 * blocker: InputBlock's two clicks), sees the blockers the engine allows, and the engine records the blocks and deals
 * damage by them. The engine's own loop runs on a game thread; seat 0 is a {@code PlayerControllerHuman} on a
 * {@link WebGuiGame} against one AI.
 */
public class HumanSeatBlocksTest {

    private ExecutorService gameThread;
    private Game game;
    private Player me;
    private Player opp;
    private PlayerControllerHuman pch;
    private GameStream stream;
    private Seat seat;

    static final class Seat implements ClientSink {
        final LinkedBlockingQueue<JsonObject> inbox = new LinkedBlockingQueue<>();
        final List<String> frames = new ArrayList<>();

        @Override
        public synchronized void send(String json) {
            frames.add(json);
            inbox.add(JsonParser.parseString(json).getAsJsonObject());
        }

        synchronized String lastCall(String method) {
            for (int i = frames.size() - 1; i >= 0; i--) {
                if (frames.get(i).contains("\"method\":\"" + method + "\"")) {
                    return frames.get(i);
                }
            }
            return null;
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
        gameThread = Executors.newSingleThreadExecutor(r -> new Thread(r, "Game-54"));
        List<RegisteredPlayer> rps = new ArrayList<>();
        rps.add(new RegisteredPlayer(new Deck()).setPlayer(new LobbyPlayerHuman("You")));
        rps.add(new RegisteredPlayer(new Deck()).setPlayer(new LobbyPlayerAi("ai1", null)));
        GameRules rules = new GameRules(GameType.Constructed);
        game = new Game(rps, rules, new Match(rules, rps, "Test"));
        game.setAge(GameStage.Play);
        me = game.getPlayers().get(0);
        opp = game.getPlayers().get(1);
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

    private void action(String method, String extra) {
        JsonObject a = JsonParser.parseString("{\"t\":\"action\",\"method\":\"" + method + "\"" + (extra == null ? "" : "," + extra) + "}").getAsJsonObject();
        stream.clientMessage(0, a, seat);
    }

    private void select(Card c) {
        action("selectCard", "\"card\":" + c.getId());
    }

    /** Runs the engine until {@code done}; {@code onInput} acts on each new seat input (null = OK). */
    private List<String> play(BooleanSupplier done, Function<Input, Runnable> onInput) throws Exception {
        final PhaseHandler ph = game.getPhaseHandler();
        Future<?> loop = gameThread.submit(() -> {
            for (int i = 0; i < 300 && !done.getAsBoolean() && !game.isGameOver(); i++) {
                ph.mainLoopStep();
            }
        });
        List<String> seen = new ArrayList<>();
        Input acted = null;
        long actedAt = 0;
        long end = System.currentTimeMillis() + 30_000;
        while (!loop.isDone()) {
            if (System.currentTimeMillis() > end) {
                fail("game loop stuck; seen " + seen + "; input " + pch.getInputQueue().getInput() + "; last message " + seat.lastCall("showPromptMessage"));
            }
            JsonObject m = seat.inbox.poll(10, TimeUnit.MILLISECONDS);
            if (m != null && "prompt".equals(m.get("t").getAsString())) {
                fail("unexpected prompt " + m + "; seen " + seen);
            }
            Input in = pch.getInputQueue().getInput();
            if (in == null || pch.getInputProxy().getInput() != in) {
                continue;
            }
            if (in != acted) {
                seen.add(in.getClass().getSimpleName());
                acted = in;
            } else if (System.currentTimeMillis() - actedAt < 1000) {
                continue;
            }
            actedAt = System.currentTimeMillis();
            Runnable r = onInput.apply(in);
            if (r == null) {
                action("selectButtonOk", null);
            } else {
                r.run();
            }
        }
        loop.get(1, TimeUnit.SECONDS);
        return seen;
    }

    /** The last blockOptions the seat received. */
    private JsonObject lastBlockOptions() {
        synchronized (seat) {
            for (int i = seat.frames.size() - 1; i >= 0; i--) {
                if (seat.frames.get(i).startsWith("{\"t\":\"blockOptions\"")) {
                    return JsonParser.parseString(seat.frames.get(i)).getAsJsonObject();
                }
            }
        }
        return null;
    }

    /** Wire ids the last blockOptions offers to block {@code attacker} (waits up to 5 s for the first one). */
    private List<Integer> offered(Card attacker) {
        long end = System.currentTimeMillis() + 5_000;
        while (lastBlockOptions() == null && System.currentTimeMillis() < end) {
            Thread.onSpinWait();
        }
        JsonObject o = lastBlockOptions();
        List<Integer> l = new ArrayList<>();
        if (o != null) {
            for (JsonElement a : o.getAsJsonArray("attackers")) {
                if (a.getAsJsonObject().get("card").getAsInt() == attacker.getId()) {
                    a.getAsJsonObject().getAsJsonArray("blockers").forEach(b -> l.add(b.getAsInt()));
                }
            }
        }
        return l;
    }

    /** Attacker then blocker: the page's two clicks for one block, and for removing it. */
    private void pair(Card attacker, Card blocker) {
        select(attacker);
        select(blocker);
    }

    /**
     * Plays the opponent's turn to its second main phase: {@code declare} answers the seat's InputBlock (OK included);
     * at the seat's first priority afterwards in the declare-blockers step, the attacker's blockers in the engine's combat
     * are recorded.
     */
    private List<Card> blockAndRecord(Card attacker, Runnable declare, List<String> seen) throws Exception {
        game.getPhaseHandler().devModeSet(PhaseType.MAIN1, opp);
        game.getPhaseHandler().onStackResolved();
        boolean[] asked = {false};
        boolean[] done = {false};
        List<Card> recorded = new ArrayList<>();
        seen.addAll(play(() -> game.getPhaseHandler().getPhase().isAfter(PhaseType.COMBAT_END),
                in -> {
                    if (in instanceof InputBlock) {
                        if (asked[0]) {
                            return () -> { }; // declare presses OK itself
                        }
                        asked[0] = true;
                        return declare;
                    }
                    if (asked[0] && !done[0] && game.getPhaseHandler().getPhase() == PhaseType.COMBAT_DECLARE_BLOCKERS && game.getCombat() != null) {
                        done[0] = true;
                        recorded.addAll(game.getCombat().getBlockers(attacker));
                    }
                    return null;
                }));
        assertTrue(asked[0], "the seat was asked to block; seen " + seen);
        assertTrue(done[0], "the seat got priority after its blocks; seen " + seen);
        return recorded;
    }

    @Test
    public void blocksAssignedStackedAndRemovedThroughTheSeatsMessagesAreRecordedAndDealDamage() throws Exception {
        start();
        Card bears = add("Grizzly Bears", me);
        Card bears2 = add("Grizzly Bears", me);
        Card spider = add("Giant Spider", me);
        Card juggernaut = add("Juggernaut", opp); // 5/3, attacks each combat if able
        List<String> seen = new ArrayList<>();
        List<List<Integer>> offers = new ArrayList<>();
        List<Card> recorded = blockAndRecord(juggernaut, () -> {
            offers.add(offered(juggernaut));
            pair(juggernaut, bears);
            pair(juggernaut, bears2); // two blockers on one attacker
            pair(juggernaut, spider);
            pair(juggernaut, spider); // the same two clicks remove the block
            action("selectButtonOk", null);
        }, seen);
        assertEquals(offers.get(0), List.of(bears.getId(), bears2.getId(), spider.getId()), "the engine's blockers were offered");
        assertEquals(recorded, List.of(bears, bears2), "the engine recorded the blocks; seen " + seen);
        assertTrue(game.getCardState(juggernaut).isInZone(ZoneType.Graveyard), "4 damage from the two bears killed the 5/3");
        assertTrue(game.getCardState(bears).isInZone(ZoneType.Graveyard) && game.getCardState(bears2).isInZone(ZoneType.Graveyard),
                "the Juggernaut's 5 damage killed both bears");
        assertTrue(game.getCardState(spider).isInZone(ZoneType.Battlefield));
        assertEquals(game.getCardState(spider).getDamage(), 0, "the spider's block was removed");
        assertEquals(me.getLife(), 20, "a blocked attacker deals no damage to the seat");
        assertEquals(SilentDefaults.count(), 0, "silent defaults: " + SilentDefaults.recent());
    }

    @Test
    public void aMenaceAttackerBlockedByOneIsRefusedWithTheEnginesMessage() throws Exception {
        start();
        Card bears = add("Grizzly Bears", me);
        Card bears2 = add("Grizzly Bears", me);
        add("Goblin War Drums", opp); // the opponent's creatures have menace
        Card juggernaut = add("Juggernaut", opp);
        List<String> seen = new ArrayList<>();
        List<String> refused = new ArrayList<>();
        List<Card> recorded = blockAndRecord(juggernaut, () -> {
            pair(juggernaut, bears);
            action("selectButtonOk", null);
            long end = System.currentTimeMillis() + 5_000;
            while (seat.lastCall("message") == null && System.currentTimeMillis() < end) {
                Thread.onSpinWait();
            }
            refused.add(String.valueOf(seat.lastCall("message")));
            pair(juggernaut, bears2);
            action("selectButtonOk", null);
        }, seen);
        assertTrue(refused.get(0).contains("Juggernaut"), "OK with one blocker on a menace attacker: the engine's message reached the seat: "
                + refused.get(0) + "; seen " + seen);
        assertEquals(recorded, List.of(bears, bears2), "seen " + seen);
        assertEquals(me.getLife(), 20);
        assertEquals(SilentDefaults.count(), 0, "silent defaults: " + SilentDefaults.recent());
    }
}
