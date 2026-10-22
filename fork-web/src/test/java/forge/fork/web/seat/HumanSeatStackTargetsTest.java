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
import forge.gamemodes.match.input.InputSelectCardsFromList;
import forge.gamemodes.match.input.InputSelectTargets;
import forge.gamemodes.match.input.InputPayMana;
import forge.gamemodes.match.input.InputSelectStackItems;
import forge.gui.GuiBase;
import forge.gui.control.GameEventForwarder;
import forge.player.LobbyPlayerHuman;
import forge.player.PlayerControllerHuman;
import forge.trackable.TrackableCollection;
import forge.fork.web.bridge.GameStream;
import forge.fork.web.bridge.GameStream.HiddenPolicy;
import forge.fork.web.bridge.visibility.TestEngine;

/**
 * Issues #53 (part 2) and #45 (part 2): the web human seat targets a spell on the stack and spends floating mana, only
 * through the actions the page sends ({@code selectStackItem} with the id from {@code setSelection},
 * {@code useMana} with the colour mask). Each test asserts what the engine recorded.
 */
public class HumanSeatStackTargetsTest {

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
        start(GameType.Constructed);
    }

    private void start(GameType type) {
        SilentDefaults.reset();
        SilentDefaults.setStrict(true);
        gameThread = Executors.newSingleThreadExecutor(r -> new Thread(r, "Game-53"));
        List<RegisteredPlayer> rps = new ArrayList<>();
        rps.add(new RegisteredPlayer(new Deck()).setPlayer(new LobbyPlayerHuman("You")));
        rps.add(new RegisteredPlayer(new Deck()).setPlayer(new LobbyPlayerAi("ai1", null)));
        GameRules rules = new GameRules(type);
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

    /** Runs the engine loop on the game thread until {@code done}, acting on each new input of the seat (null = OK). */
    private List<String> play(BooleanSupplier done, Function<Input, Runnable> onInput) throws Exception {
        final PhaseHandler ph = game.getPhaseHandler();
        Future<?> loop = gameThread.submit(() -> {
            for (int i = 0; i < 300 && !done.getAsBoolean() && !game.isGameOver(); i++) {
                ph.mainLoopStep();
            }
        });
        List<String> seen = new ArrayList<>();
        Input acted = null;
        // As the page does: act only on a shown prompt. Actions run on the seat's action thread, and some finish on
        // the game thread (auto-pay). Each action is followed by a marker action ("sync", rejected as unknown); nothing
        // more is sent until the marker comes back and a prompt was shown since the last action (a new input, or the
        // same one waiting again, e.g. InputAttack after an attacker is declared). No timers: a loaded machine made
        // timer-based re-acts land on an input not yet shown or already answered.
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
            // Let the EDT finish first: InputPayMana.updateMessage swaps the player's controller for an AI one there
            // (runAsAi), and the game thread reading the swapped controller lets the AI decide (issue #60).
            GuiBase.getInterface().invokeInEdtAndWait(() -> { });
            Runnable r = onInput.apply(in);
            (r == null ? (Runnable) this::ok : r).run();
            synced = false;
            action("sync", "\"id\":" + (++sync));
        }
        loop.get(1, TimeUnit.SECONDS);
        return seen;
    }

    /**
     * The stack item ids the last {@code setSelection} call offers (its targets). The input sends it after its message
     * ({@code InputBase.showMessageInitial}), so it may still be on its way: waits up to 5 s for one offering any.
     */
    private List<Integer> offeredStackItems() {
        long end = System.currentTimeMillis() + 5000;
        List<Integer> ids = new ArrayList<>();
        while (ids.isEmpty() && System.currentTimeMillis() < end) {
            String call = seat.lastCall("setSelection");
            if (call != null) {
                JsonObject sel = JsonParser.parseString(call).getAsJsonObject().getAsJsonArray("args").get(0).getAsJsonObject();
                for (JsonElement e : sel.getAsJsonArray("targets")) {
                    JsonObject r = e.getAsJsonObject();
                    if ("stackItem".equals(r.get("type").getAsString())) {
                        ids.add(r.get("id").getAsInt());
                    }
                }
            }
            if (ids.isEmpty()) {
                try {
                    Thread.sleep(10);
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                    break;
                }
            }
        }
        return ids;
    }

    @Test
    public void counterspellTargetsTheSpellTheSeatPicksOnTheStack() throws Exception {
        start();
        for (int i = 0; i < 2; i++) {
            add("Island", me, ZoneType.Battlefield);
            add("Forest", me, ZoneType.Battlefield);
        }
        Card bears = add("Grizzly Bears", me, ZoneType.Hand);
        Card counterspell = add("Counterspell", me, ZoneType.Hand);
        game.getPhaseHandler().devModeSet(PhaseType.MAIN1, me);
        game.getPhaseHandler().onStackResolved();
        List<Integer> offered = new ArrayList<>();
        List<String> seen = play(() -> game.getCardState(counterspell).isInZone(ZoneType.Graveyard) && game.getStack().isEmpty()
                        || game.getCardState(bears).isInZone(ZoneType.Battlefield)
                        || game.getPhaseHandler().getPhase() != PhaseType.MAIN1,
                in -> {
                    if (in instanceof InputPassPriority) {
                        if (game.getStack().isEmpty() && game.getCardState(bears).isInZone(ZoneType.Hand)) {
                            return () -> select(bears);
                        }
                        if (!game.getStack().isEmpty() && game.getCardState(counterspell).isInZone(ZoneType.Hand)) {
                            return () -> select(counterspell);
                        }
                    }
                    if (in instanceof InputSelectStackItems) {
                        // what the page does: the id the seat was offered, sent back with selectStackItem
                        offered.addAll(offeredStackItems());
                        return () -> action("selectStackItem", "\"stackItem\":" + offered.get(0));
                    }
                    return null; // pay automatically, then pass priority
                });
        assertEquals(offered.size(), 1, "the seat was offered the Bears spell on the stack; seen " + seen);
        assertTrue(seen.contains("InputSelectStackItems"), "stack targets were picked through the stack view: " + seen);
        assertTrue(game.getCardState(bears).isInZone(ZoneType.Graveyard), "Grizzly Bears was countered; seen " + seen);
        assertTrue(game.getCardState(counterspell).isInZone(ZoneType.Graveyard), "Counterspell resolved");
        assertEquals(SilentDefaults.count(), 0, "silent defaults: " + SilentDefaults.recent());
    }

    /** Issue #45 part 1: Szarekh as the seat's commander, cast from the command zone, then attacking. */
    @Test
    public void szarekhCastFromTheCommandZoneMillsThreeWhenItAttacks() throws Exception {
        start(GameType.Commander);
        for (int i = 0; i < 4; i++) {
            add("Swamp", me, ZoneType.Battlefield);
        }
        Card szarekh = add("Szarekh, the Silent King", me, ZoneType.Command);
        me.addCommander(szarekh);
        int library = me.getCardsIn(ZoneType.Library).size();
        game.getPhaseHandler().devModeSet(PhaseType.MAIN1, me);
        game.getPhaseHandler().onStackResolved();
        boolean[] declared = {false};
        List<String> seen = play(() -> me.getCardsIn(ZoneType.Library).size() < library
                        || game.getPhaseHandler().getPhase().isAfter(PhaseType.COMBAT_DECLARE_BLOCKERS),
                in -> {
                    Card now = game.getCardState(szarekh);
                    if (in instanceof InputPassPriority && game.getStack().isEmpty() && now.isInZone(ZoneType.Command)) {
                        return () -> select(now);
                    }
                    if (now.isInZone(ZoneType.Battlefield) && now.hasSickness()) {
                        now.setSickness(false); // as on the seat's next turn
                    }
                    if (in instanceof forge.gamemodes.match.input.InputAttack && !declared[0]) {
                        declared[0] = true;
                        return () -> select(now);
                    }
                    return null;
                });
        assertTrue(declared[0], "Szarekh was declared as an attacker; seen " + seen);
        assertEquals(me.getCardsIn(ZoneType.Library).size(), library - 3, "the attack trigger milled three; seen " + seen);
        assertEquals(SilentDefaults.count(), 0, "silent defaults: " + SilentDefaults.recent());
    }

    @Test
    public void floatingManaClickedInThePoolPaysTheCost() throws Exception {
        start();
        Card swamp = add("Swamp", me, ZoneType.Battlefield);
        Card rats = add("Typhoid Rats", me, ZoneType.Hand);
        game.getPhaseHandler().devModeSet(PhaseType.MAIN1, me);
        game.getPhaseHandler().onStackResolved();
        int[] poolClicks = {0};
        boolean[] autoPaid = {false};
        List<String> seen = play(() -> game.getCardState(rats).isInZone(ZoneType.Battlefield) || game.getPhaseHandler().getPhase() != PhaseType.MAIN1,
                in -> {
                    if (in instanceof InputPassPriority && game.getStack().isEmpty() && game.getCardState(rats).isInZone(ZoneType.Hand)) {
                        // tap the Swamp first: {B} floats, then cast the Rats
                        return swamp.isTapped() ? () -> select(rats) : () -> select(swamp);
                    }
                    if (in instanceof InputPayMana) {
                        if (poolClicks[0]++ == 0) {
                            return () -> action("useMana", "\"color\":4"); // the pool's {B}, as the page sends it
                        }
                        autoPaid[0] = true;
                    }
                    return null;
                });
        assertTrue(swamp.isTapped(), "the Swamp paid; seen " + seen);
        assertTrue(seen.contains("InputPayManaOfCostPayment"), "the seat paid the cost itself: " + seen);
        assertFalse(autoPaid[0], "the pool click paid the cost, not Auto: " + seen);
        assertTrue(me.getManaPool().isEmpty(), "the floating {B} was spent");
        assertTrue(game.getCardState(rats).isInZone(ZoneType.Battlefield), "Typhoid Rats resolved; seen " + seen);
        assertEquals(SilentDefaults.count(), 0, "silent defaults: " + SilentDefaults.recent());
    }

    /**
     * Upstream's {@code InputBase.showSelection} adds the spell's kept target marks to every later input's {@code chosen}
     * while its cost is paid. The seat must not read them as the cost input's own picks: the page would show the target
     * as already sacrificed and "unpick" it with a {@code selectCard} the engine takes as the sacrifice.
     */
    @Test
    public void aCostInputAfterTargetingSendsOnlyItsOwnPicksAsChosen() throws Exception {
        start();
        Card devotion = add("Fanatical Devotion", me, ZoneType.Battlefield);
        Card bears = add("Grizzly Bears", me, ZoneType.Battlefield);
        Card elves = add("Llanowar Elves", me, ZoneType.Battlefield);
        game.getPhaseHandler().devModeSet(PhaseType.MAIN1, me);
        game.getPhaseHandler().onStackResolved();
        boolean[] activated = {false};
        boolean[] sacrificed = {false};
        List<String> seen = play(() -> activated[0] && game.getStack().isEmpty() || game.getPhaseHandler().getPhase() != PhaseType.MAIN1,
                in -> {
                    if (in instanceof InputPassPriority && !activated[0]) {
                        activated[0] = true;
                        return () -> select(devotion); // "Sacrifice a creature: Regenerate target creature."
                    }
                    if (in instanceof InputSelectTargets) {
                        return () -> select(bears);
                    }
                    if (in instanceof InputSelectCardsFromList && !sacrificed[0]) {
                        sacrificed[0] = true;
                        return () -> select(elves);
                    }
                    return null;
                });
        assertTrue(seen.contains("InputSelectTargets") && seen.contains("InputSelectCardsFromList"), "targeted, then paid the sacrifice: " + seen);
        // the setSelection calls the sacrifice input sent (they follow its message)
        List<JsonObject> costSelections = new ArrayList<>();
        String message = "";
        for (String f : seat.all().split("\n")) {
            JsonObject m = JsonParser.parseString(f).getAsJsonObject();
            if (!"call".equals(m.get("t").getAsString())) {
                continue;
            }
            String method = m.get("method").getAsString();
            if ("showPromptMessage".equals(method)) {
                message = m.getAsJsonArray("args").get(1).getAsString();
            } else if ("setSelection".equals(method) && message.contains("to sacrifice")) {
                costSelections.add(m.getAsJsonArray("args").get(0).getAsJsonObject());
            }
        }
        JsonObject first = costSelections.stream().filter(s -> s.get("max").getAsInt() > 0).findFirst().orElse(null);
        assertTrue(first != null, "the sacrifice input offered its cards: " + costSelections);
        assertTrue(first.getAsJsonArray("chosen").isEmpty(), "nothing picked yet for the sacrifice: " + first);
        for (JsonObject s : costSelections) {
            for (JsonElement c : s.getAsJsonArray("chosen")) {
                assertFalse(c.getAsJsonObject().get("id").getAsInt() == bears.getId(), "the target is not a sacrifice pick: " + s);
            }
        }
        assertTrue(game.getCardState(elves).isInZone(ZoneType.Graveyard), "the Elves were sacrificed; seen " + seen);
        assertTrue(game.getCardState(bears).isInZone(ZoneType.Battlefield), "the Bears stayed; seen " + seen);
        assertEquals(game.getCardState(bears).getShieldCount(), 1, "the Bears got the regeneration shield; seen " + seen);
        assertEquals(SilentDefaults.count(), 0, "silent defaults: " + SilentDefaults.recent());
    }
}
