package forge.fork.web.seat;

import static org.testng.Assert.assertEquals;
import static org.testng.Assert.assertNotNull;
import static org.testng.Assert.assertTrue;
import static org.testng.Assert.fail;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
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
import forge.gamemodes.match.input.InputSelectTargets;
import forge.gui.control.GameEventForwarder;
import forge.player.LobbyPlayerHuman;
import forge.player.PlayerControllerHuman;
import forge.trackable.TrackableCollection;
import forge.fork.web.bridge.GameStream;
import forge.fork.web.bridge.GameStream.HiddenPolicy;
import forge.fork.web.bridge.visibility.TestEngine;

/**
 * Issue #175: the targets the seat's page is offered for a targeted spell are exactly the engine's legal targets
 * ({@code Card.canBeTargetedBy}, via {@code InputSelectTargets}), for hexproof (printed, granted by equipment, by a static,
 * "from a colour"), shroud, protection and ward, and the seat's own hexproof creature; and a click on an illegal target is
 * refused as a note, leaving the spell's targeting open for a legal one.
 */
public class HexproofTargetsTest {

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
        gameThread = Executors.newSingleThreadExecutor(r -> new Thread(r, "Game-175"));
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

    /** {@code equipment} on the battlefield, attached to {@code creature}. */
    private void equip(String equipment, Card creature) {
        Card e = add(equipment, creature.getController(), ZoneType.Battlefield);
        e.attachToEntity(creature, null);
    }

    private void action(String method, String extra) {
        JsonObject a = JsonParser.parseString("{\"t\":\"action\",\"method\":\"" + method + "\"" + (extra == null ? "" : "," + extra) + "}").getAsJsonObject();
        stream.clientMessage(0, a, seat);
    }

    private void select(Card c) {
        action("selectCard", "\"card\":" + c.getId());
    }

    /** As {@code RefusedPickMessageTest.play}: acts once per shown prompt message, each action followed by a sync marker. */
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
                fail("game loop stuck; seen " + seen + "; input " + pch.getInputQueue().getInput() + "; last message " + seat.lastCall("showPromptMessage") + "; messages " + messages()
                        + "; rejected " + java.util.Arrays.stream(seat.all().split("\n")).filter(f -> f.contains("Rejected")).toList());
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

    /** The first argument of each {@code message} call the seat received. */
    private List<String> messages() {
        List<String> out = new ArrayList<>();
        for (String f : seat.all().split("\n")) {
            if (f.isBlank()) {
                continue;
            }
            JsonObject m = JsonParser.parseString(f).getAsJsonObject();
            if ("call".equals(m.get("t").getAsString()) && "message".equals(m.get("method").getAsString())) {
                out.add(m.get("args").getAsJsonArray().get(0).getAsString());
            }
        }
        return out;
    }

    /** The card ids the seat's last {@code setSelection} offers, once it offers any (the input sends it after its message). */
    private Set<Integer> offeredCards() {
        long end = System.currentTimeMillis() + 5000;
        Set<Integer> ids = new HashSet<>();
        while (ids.isEmpty() && System.currentTimeMillis() < end) {
            String call = seat.lastCall("setSelection");
            if (call != null) {
                JsonObject sel = JsonParser.parseString(call).getAsJsonObject().getAsJsonArray("args").get(0).getAsJsonObject();
                for (JsonElement e : sel.getAsJsonArray("cards")) {
                    ids.add(e.getAsJsonObject().get("id").getAsInt());
                }
            }
            if (ids.isEmpty()) {
                Thread.onSpinWait();
            }
        }
        return ids;
    }

    /** What the seat saw and did while Swords to Plowshares was cast. */
    private static final class Probe {
        Set<Integer> offered;
        final Map<String, Boolean> engine = new LinkedHashMap<>();
        final Map<String, Integer> refusals = new LinkedHashMap<>();
        Card picked;
    }

    /**
     * Swords to Plowshares (white, "Exile target creature") against {@code board}, creatures that are, or are not, legal
     * targets for it ({@code legal}, by label). The page's offer must be exactly the legal ones, which is what the engine's
     * {@code canBeTargetedBy} says; each illegal one clicked is refused as one note and changes nothing; the first legal one
     * then becomes the target and is exiled.
     */
    private void run(Map<String, Card> board, Map<String, Boolean> legal) throws Exception {
        add("Plains", me, ZoneType.Battlefield);
        Card swords = add("Swords to Plowshares", me, ZoneType.Hand);
        main1();
        boolean[] cast = {false};
        Probe probe = new Probe();
        List<String> seen = play(() -> probe.picked != null && game.getStack().isEmpty() || game.getPhaseHandler().getPhase() != PhaseType.MAIN1,
                in -> {
                    if (in instanceof InputPassPriority && !cast[0]) {
                        cast[0] = true;
                        return () -> select(swords);
                    }
                    if (in instanceof InputSelectTargets && probe.offered == null) {
                        return () -> {
                            probe.offered = offeredCards();
                            for (Map.Entry<String, Card> e : board.entrySet()) {
                                probe.engine.put(e.getKey(), e.getValue().canBeTargetedBy(swords.getSpellAbilities().get(0)));
                            }
                            for (Map.Entry<String, Card> e : board.entrySet()) {
                                if (!legal.get(e.getKey())) {
                                    int before = messages().size();
                                    select(e.getValue());
                                    long end = System.currentTimeMillis() + 10_000;
                                    while (messages().size() == before && System.currentTimeMillis() < end) {
                                        Thread.onSpinWait();
                                    }
                                    probe.refusals.put(e.getKey(), messages().size() - before);
                                }
                            }
                            for (Map.Entry<String, Card> e : board.entrySet()) {
                                if (legal.get(e.getKey()) && probe.picked == null) {
                                    probe.picked = e.getValue();
                                }
                            }
                            select(probe.picked);
                        };
                    }
                    return null;
                });
        assertNotNull(probe.offered, "the target was asked; seen " + seen);
        Set<Integer> expected = new HashSet<>();
        Set<Integer> boardIds = new HashSet<>();
        for (Map.Entry<String, Card> e : board.entrySet()) {
            assertEquals(probe.engine.get(e.getKey()), legal.get(e.getKey()), "engine canBeTargetedBy for " + e.getKey());
            boardIds.add(e.getValue().getId());
            if (legal.get(e.getKey())) {
                expected.add(e.getValue().getId());
            }
        }
        Set<Integer> offeredOnBoard = new HashSet<>(probe.offered);
        offeredOnBoard.retainAll(boardIds);
        assertEquals(offeredOnBoard, expected, "the page is offered exactly the legal targets");
        for (Map.Entry<String, Integer> e : probe.refusals.entrySet()) {
            assertEquals((int) e.getValue(), 1, "clicking the illegal " + e.getKey() + " is refused as one note");
        }
        assertEquals(messages().stream().filter(m -> m.contains("Cannot target this card")).count(), (long) probe.refusals.size(),
                "refusal notes: " + messages());
        assertTrue(game.getCardState(probe.picked).isInZone(ZoneType.Exile), "the first legal target was exiled: " + probe.picked);
        for (Map.Entry<String, Card> e : board.entrySet()) {
            if (!legal.get(e.getKey())) {
                assertTrue(game.getCardState(e.getValue()).isInZone(ZoneType.Battlefield), e.getKey() + " was not touched");
            }
        }
        assertEquals(SilentDefaults.count(), 0, "silent defaults: " + SilentDefaults.recent());
    }

    private static Map<String, Boolean> expect(Object... kv) {
        Map<String, Boolean> m = new LinkedHashMap<>();
        for (int i = 0; i < kv.length; i += 2) {
            m.put((String) kv[i], (Boolean) kv[i + 1]);
        }
        return m;
    }

    /** Shalai gives hexproof to the other creatures of its controller, not to itself, and not to the seat's own. */
    @Test
    public void hexproofGrantedByAStatic() throws Exception {
        start();
        Map<String, Card> board = new LinkedHashMap<>();
        board.put("shalai", add("Shalai, Voice of Plenty", ai, ZoneType.Battlefield));
        board.put("granted", add("Grizzly Bears", ai, ZoneType.Battlefield));
        board.put("own", add("Grizzly Bears", me, ZoneType.Battlefield));
        run(board, expect("shalai", true, "granted", false, "own", true));
    }

    @Test
    public void everyKindOfProtectionAgainstAnExileSpell() throws Exception {
        start();
        Map<String, Card> board = new LinkedHashMap<>();
        board.put("plain", add("Grizzly Bears", ai, ZoneType.Battlefield));
        board.put("hexproof", add("Gladecover Scout", ai, ZoneType.Battlefield));
        Card booted = add("Llanowar Elves", ai, ZoneType.Battlefield);
        equip("Swiftfoot Boots", booted);
        board.put("boots", booted);
        Card greaved = add("Elvish Mystic", ai, ZoneType.Battlefield);
        equip("Lightning Greaves", greaved);
        board.put("shroud", greaved);
        board.put("hexproofFromBlack", add("Knight of Grace", ai, ZoneType.Battlefield));
        board.put("hexproofFromNongreen", add("Gaea's Revenge", ai, ZoneType.Battlefield));
        board.put("proWhite", add("Black Knight", ai, ZoneType.Battlefield));
        board.put("ward", add("Ancient Imperiosaur", ai, ZoneType.Battlefield));
        board.put("ownHexproof", add("Gladecover Scout", me, ZoneType.Battlefield));
        run(board, expect("plain", true, "hexproof", false, "boots", false, "shroud", false, 
                "hexproofFromBlack", true, "hexproofFromNongreen", false, "proWhite", false, "ward", true, "ownHexproof", true));
    }
}
