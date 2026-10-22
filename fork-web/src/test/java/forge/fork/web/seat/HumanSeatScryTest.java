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

import com.google.gson.JsonArray;
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
import forge.gamemodes.match.input.InputPayMana;
import forge.gui.GuiBase;
import forge.gui.control.GameEventForwarder;
import forge.localinstance.properties.ForgePreferences.FPref;
import forge.model.FModel;
import forge.player.LobbyPlayerHuman;
import forge.player.PlayerControllerHuman;
import forge.trackable.TrackableCollection;
import forge.fork.web.bridge.GameStream;
import forge.fork.web.bridge.GameStream.HiddenPolicy;
import forge.fork.web.bridge.visibility.TestEngine;

/**
 * Issue #69: scry and surveil by the web human seat, in a real game, answered only through the seat's messages. The
 * seat is offered exactly the looked-at cards (never the rest of the library), and each card lands where the reply
 * put it: the test asserts the library and graveyard order the engine recorded.
 */
public class HumanSeatScryTest {

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
        gameThread = Executors.newSingleThreadExecutor(r -> new Thread(r, "Game-69"));
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
        // distinct names, so each card is known by its label
        for (String n : List.of("Grizzly Bears", "Llanowar Elves", "Giant Growth", "Shock", "Counterspell", "Divination",
                "Lightning Bolt", "Dark Ritual", "Serra Angel", "Shivan Dragon", "Wrath of God", "Llanowar Wastes")) {
            TestEngine.add(n, me, ZoneType.Library);
        }
        for (int i = 0; i < 10; i++) {
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

    /** The labels of a prompt's choices, card names only (labels end with the card's id). */
    private static List<String> labels(JsonObject prompt) {
        List<String> l = new ArrayList<>();
        for (JsonElement c : prompt.getAsJsonArray("choices")) {
            l.add(c.getAsJsonObject().get("label").getAsString().replaceAll(" \\(\\d+\\)$", ""));
        }
        return l;
    }

    private static JsonArray indices(List<String> labels, String... names) {
        JsonArray a = new JsonArray();
        for (String n : names) {
            int i = labels.indexOf(n);
            assertTrue(i >= 0, n + " not offered: " + labels);
            a.add(i);
        }
        return a;
    }

    /** Casts Preordain (scry 2, then draw) and answers the scry with these piles (card names, top first). */
    private JsonObject preordain(List<String> top, List<String> bottom) throws Exception {
        add("Island", me, ZoneType.Battlefield);
        Card preordain = add("Preordain", me, ZoneType.Hand);
        Card island = me.getCardsIn(ZoneType.Battlefield).stream().filter(c -> c.getName().equals("Island") && !c.isTapped())
                .findFirst().orElseThrow();
        List<JsonObject> prompts = new ArrayList<>();
        boolean[] cast = {false};
        List<String> seen = play(() -> game.getCardState(preordain).isInZone(ZoneType.Graveyard),
                in -> {
                    if (in instanceof InputPassPriority && !cast[0]) {
                        cast[0] = true;
                        return () -> select(preordain);
                    }
                    if (in instanceof InputPayMana) {
                        return () -> select(island);
                    }
                    return null;
                },
                m -> {
                    if (!"manipulateCardList".equals(m.get("method").getAsString())) {
                        return null;
                    }
                    prompts.add(m);
                    List<String> l = labels(m);
                    JsonObject v = new JsonObject();
                    v.add("top", indices(l, top.toArray(new String[0])));
                    v.add("bottom", indices(l, bottom.toArray(new String[0])));
                    return v;
                });
        assertEquals(prompts.size(), 1, "one scry prompt; seen " + seen);
        assertSameTurn(seen);
        return prompts.get(0);
    }

    /** Still the seat's first main phase: nothing else drew or moved cards. */
    private void assertSameTurn(List<String> seen) {
        assertEquals(game.getPhaseHandler().getPhase(), PhaseType.MAIN1, "seen " + seen);
        assertEquals(game.getPhaseHandler().getPlayerTurn(), me, "seen " + seen);
    }

    @Test
    public void scryTwoOffersTheTwoCardsAndPutsEachWhereTheSeatChose() throws Exception {
        start();
        // the path the playtest hit: the desktop default lists the whole library to manipulateCardList
        assertTrue(FModel.getPreferences().getPrefBoolean(FPref.UI_SELECT_FROM_CARD_DISPLAYS));
        List<String> lib = names(ZoneType.Library);
        assertEquals(lib.subList(0, 3), List.of("Grizzly Bears", "Llanowar Elves", "Giant Growth"), "top of library first");

        // one on top, one on the bottom
        JsonObject p = preordain(List.of("Llanowar Elves"), List.of("Grizzly Bears"));
        assertEquals(labels(p), List.of("Grizzly Bears", "Llanowar Elves"), "only the two scried cards, top first");
        assertTrue(p.get("piles").getAsBoolean());
        assertFalse(p.toString().contains("Hidden"), p.toString());
        assertTrue(names(ZoneType.Hand).contains("Llanowar Elves"), "Preordain drew the card kept on top: " + names(ZoneType.Hand));
        List<String> after = names(ZoneType.Library);
        assertEquals(after.get(0), "Giant Growth", after.toString());
        assertEquals(after.get(after.size() - 1), "Grizzly Bears");
        assertEquals(after.size(), lib.size() - 1);

        // both on the bottom, in the order chosen: Shock above Giant Growth, Giant Growth last; then Counterspell is drawn
        p = preordain(List.of(), List.of("Shock", "Giant Growth"));
        assertEquals(labels(p), List.of("Giant Growth", "Shock"));
        after = names(ZoneType.Library);
        assertEquals(after.get(0), "Divination");
        assertEquals(after.subList(after.size() - 3, after.size()), List.of("Grizzly Bears", "Shock", "Giant Growth"));

        // both on top, reordered: Lightning Bolt is drawn, Divination stays on top
        p = preordain(List.of("Lightning Bolt", "Divination"), List.of());
        assertEquals(labels(p), List.of("Divination", "Lightning Bolt"));
        assertTrue(names(ZoneType.Hand).contains("Lightning Bolt"), names(ZoneType.Hand).toString());
        after = names(ZoneType.Library);
        assertEquals(after.subList(0, 2), List.of("Divination", "Dark Ritual"));
        assertEquals(after.size(), lib.size() - 3);
        assertEquals(SilentDefaults.count(), 0, "silent defaults: " + SilentDefaults.recent());
    }

    /**
     * Activates Doom Whisperer (pay 2 life: surveil 2) and answers the surveil: {@code toGraveyard} in the graveyard
     * prompt, then the cards kept on top in {@code topOrder} (asked only for two or more). Returns the prompts.
     */
    private List<JsonObject> surveil(Card whisperer, List<String> toGraveyard, List<String> topOrder) throws Exception {
        int before = me.getSurveilThisTurn();
        List<JsonObject> prompts = new ArrayList<>();
        boolean[] activated = {false};
        List<String> seen = play(() -> me.getSurveilThisTurn() > before && game.getStack().isEmpty(),
                in -> {
                    if (in instanceof InputPassPriority && !activated[0]) {
                        activated[0] = true;
                        return () -> select(whisperer);
                    }
                    return null;
                },
                m -> {
                    String shape = m.get("shape").getAsString();
                    if ("confirm".equals(shape)) {
                        return new com.google.gson.JsonPrimitive(true); // pay the life
                    }
                    if (!"order".equals(shape) || !"order".equals(m.get("method").getAsString())) {
                        return null;
                    }
                    prompts.add(m);
                    List<String> l = labels(m);
                    JsonObject v = new JsonObject();
                    v.add("order", indices(l, (prompts.size() == 1 ? toGraveyard : topOrder).toArray(new String[0])));
                    v.addProperty("remember", false);
                    return v;
                });
        assertTrue(activated[0], "seen " + seen);
        assertSameTurn(seen);
        return prompts;
    }

    @Test
    public void surveilTwoOffersTheTwoCardsAndPutsEachWhereTheSeatChose() throws Exception {
        start();
        Card whisperer = add("Doom Whisperer", me, ZoneType.Battlefield);
        List<String> lib = names(ZoneType.Library);

        // one to the graveyard, one kept: no order to ask
        List<JsonObject> p = surveil(whisperer, List.of("Grizzly Bears"), List.of());
        assertEquals(p.size(), 1, "graveyard pick only: " + p);
        // the page words this prompt by its message (frontend adapter/trayWords.ts, isSurveil): the engine's text, order shape
        assertEquals(p.get(0).get("message").getAsString(), "Select cards to be put into the graveyard");
        assertEquals(labels(p.get(0)), List.of("Grizzly Bears", "Llanowar Elves"), "only the two cards looked at, top first");
        assertEquals(names(ZoneType.Graveyard), List.of("Grizzly Bears"));
        assertEquals(names(ZoneType.Library).get(0), "Llanowar Elves");

        // both kept, reordered
        p = surveil(whisperer, List.of(), List.of("Giant Growth", "Llanowar Elves"));
        assertEquals(p.size(), 2, "graveyard pick, then the order on top: " + p);
        assertEquals(labels(p.get(0)), List.of("Llanowar Elves", "Giant Growth"));
        assertEquals(names(ZoneType.Library).subList(0, 3), List.of("Giant Growth", "Llanowar Elves", "Shock"));
        assertEquals(names(ZoneType.Graveyard), List.of("Grizzly Bears"));

        // both to the graveyard
        p = surveil(whisperer, List.of("Giant Growth", "Llanowar Elves"), List.of());
        assertEquals(p.size(), 1);
        assertEquals(names(ZoneType.Library).get(0), "Shock");
        assertEquals(names(ZoneType.Library).size(), lib.size() - 3);
        assertTrue(names(ZoneType.Graveyard).containsAll(List.of("Grizzly Bears", "Giant Growth", "Llanowar Elves")), names(ZoneType.Graveyard).toString());
        assertEquals(me.getLife(), 14, "paid 2 life per surveil");
        assertEquals(SilentDefaults.count(), 0, "silent defaults: " + SilentDefaults.recent());
    }

    /**
     * Issue #29 (playtest 2 #5): an X above 9 is asked as the list "0 … 9, Other…" (AbstractGuiGame.getInteger), then
     * "Other…" as a numeric text prompt with its range. The page answers both from its number field
     * (frontend adapter/trayWords.ts, numberList and rangeOfNumberPrompt), so this is the shape it relies on.
     */
    @Test
    public void anXAboveNineIsAListWithOtherThenANumberPrompt() throws Exception {
        start();
        for (int i = 0; i < 12; i++) {
            add("Mountain", me, ZoneType.Battlefield);
        }
        Card blaze = add("Blaze", me, ZoneType.Hand);
        List<JsonObject> prompts = new ArrayList<>();
        boolean[] cast = {false};
        List<String> seen = play(() -> game.getCardState(blaze).isInZone(ZoneType.Graveyard) && game.getStack().isEmpty(),
                in -> {
                    if (in instanceof InputPassPriority && !cast[0]) {
                        cast[0] = true;
                        return () -> select(blaze);
                    }
                    if (in instanceof forge.gamemodes.match.input.InputSelectTargets) {
                        return () -> action("selectPlayer", "\"player\":" + game.getPlayers().get(1).getId());
                    }
                    return null;
                },
                m -> {
                    prompts.add(m);
                    if ("getChoices".equals(m.get("method").getAsString())) {
                        return new JsonParser().parse("[10]"); // "Other..."
                    }
                    if ("showInputDialog".equals(m.get("method").getAsString())) {
                        return new com.google.gson.JsonPrimitive("11");
                    }
                    return null;
                });
        assertEquals(prompts.size(), 2, "the list, then the number; seen " + seen + " " + prompts);
        JsonObject list = prompts.get(0);
        assertEquals(list.get("message").getAsString(), "Choose X for Blaze");
        assertEquals(list.get("min").getAsInt(), 0, "oneOrNone: nothing chosen cancels");
        assertEquals(list.get("max").getAsInt(), 1);
        List<String> l = new ArrayList<>();
        for (JsonElement c : list.getAsJsonArray("choices")) {
            l.add(c.getAsJsonObject().get("label").getAsString());
        }
        assertEquals(l, List.of("0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "Other..."));
        JsonObject number = prompts.get(1);
        assertTrue(number.get("numeric").getAsBoolean(), number.toString());
        // an X has no maximum (getInteger is asked up to Integer.MAX_VALUE): the follow-up names only its minimum
        assertEquals(number.get("message").getAsString(), "Enter a number greater than or equal to 0:");
        assertEquals(game.getPlayers().get(1).getLife(), 20 - 11, "X was 11; seen " + seen);
        assertEquals(SilentDefaults.count(), 0, "silent defaults: " + SilentDefaults.recent());
    }
}
