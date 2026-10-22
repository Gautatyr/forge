package forge.fork.web.seat;

import static org.testng.Assert.assertEquals;
import static org.testng.Assert.assertFalse;
import static org.testng.Assert.assertNotNull;
import static org.testng.Assert.assertNull;
import static org.testng.Assert.assertSame;
import static org.testng.Assert.assertTrue;
import static org.testng.Assert.fail;

import java.lang.reflect.Proxy;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Callable;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;

import org.testng.annotations.AfterMethod;
import org.testng.annotations.BeforeClass;
import org.testng.annotations.Test;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

import forge.game.Game;
import forge.game.card.Card;
import forge.game.card.CardCopyService;
import forge.game.card.CardView;
import forge.game.event.GameEvent;
import forge.game.event.GameEventCombatChanged;
import forge.game.event.GameEventGameFinished;
import forge.game.event.GameEventPlayerPriority;
import forge.game.event.GameEventShuffle;
import forge.game.phase.PhaseType;
import forge.game.player.Player;
import forge.game.zone.ZoneType;
import forge.gui.interfaces.IGuiGame;
import forge.gamemodes.match.input.InputSelectEntitiesFromList;
import forge.gui.FThreads;
import forge.gui.control.GameEventForwarder;
import forge.interfaces.IGameController;
import forge.model.FModel;
import forge.player.LobbyPlayerHuman;
import forge.player.PlayerControllerHuman;
import forge.trackable.TrackableCollection;
import forge.util.collect.FCollection;
import forge.fork.web.bridge.ClientSink;
import forge.fork.web.bridge.GameStream;
import forge.fork.web.bridge.GameStream.HiddenPolicy;
import forge.fork.web.bridge.visibility.TestEngine;
import forge.fork.web.bridge.visibility.ViewerStream;

/**
 * A human seat over a real engine game and stream, with a fake client: every prompt shape, reply
 * validation, timeout, disconnect and reconnect, flush before a prompt, hidden cards in prompts and
 * calls, and the player actions.
 */
public class SeatSessionTest {

    /** Stands in for the game thread, which blocks in a prompt; one per test, so a failed test leaves nothing behind. */
    private ExecutorService gameThread;
    private Game game;
    private Player p0;
    private Player p1;
    private GameStream stream;
    private WebSeats seats;
    private WebGuiGame gui;
    private Client client;
    private final LinkedBlockingQueue<String> controllerCalls = new LinkedBlockingQueue<>();
    /** The thread of each controller call, in order. */
    private final LinkedBlockingQueue<String> callThreads = new LinkedBlockingQueue<>();
    /** Run by the recording controller on the calling thread, after recording a call of that method. */
    private final Map<String, Callable<Void>> onCall = new ConcurrentHashMap<>();

    /** A seat's browser: every message, parsed. */
    static final class Client implements ClientSink {
        final LinkedBlockingQueue<JsonObject> msgs = new LinkedBlockingQueue<>();

        @Override
        public void send(String json) {
            msgs.add(JsonParser.parseString(json).getAsJsonObject());
        }

        /** The next message of type {@code t}, skipping others; fails after 5 s. */
        JsonObject next(String t) throws InterruptedException {
            long end = System.currentTimeMillis() + 5000;
            while (true) {
                JsonObject m = msgs.poll(Math.max(1, end - System.currentTimeMillis()), TimeUnit.MILLISECONDS);
                if (m == null) {
                    fail("no '" + t + "' message");
                }
                if (t.equals(m.get("t").getAsString())) {
                    return m;
                }
            }
        }

        /** Messages until (and including) the next of type {@code t}. */
        List<JsonObject> until(String t) throws InterruptedException {
            List<JsonObject> l = new ArrayList<>();
            long end = System.currentTimeMillis() + 5000;
            while (true) {
                JsonObject m = msgs.poll(Math.max(1, end - System.currentTimeMillis()), TimeUnit.MILLISECONDS);
                if (m == null) {
                    fail("no '" + t + "' message");
                }
                l.add(m);
                if (t.equals(m.get("t").getAsString())) {
                    return l;
                }
            }
        }
    }

    @BeforeClass
    public void boot() {
        TestEngine.boot();
    }

    @AfterMethod(alwaysRun = true)
    public void drain() {
        controllerCalls.clear();
        callThreads.clear();
        onCall.clear();
        SilentDefaults.setStrict(null);
        if (gameThread != null) {
            gameThread.shutdownNow(); // interrupts a prompt left open: it returns its default
        }
    }

    private void start(WebSeats.Timeouts timeouts) {
        // named like the engine's game threads, so ThreadUtil.isGameThread() holds on it
        gameThread = Executors.newSingleThreadExecutor(r -> new Thread(r, "Game-test"));
        game = TestEngine.newGame(2);
        p0 = game.getPlayers().get(0);
        p1 = game.getPlayers().get(1);
        stream = new GameStream(HiddenPolicy.REDACT, null);
        seats = new WebSeats(stream, timeouts);
        gui = seats.newSeat(0);
        gui.setGameView(game.getView());
        gui.openView(new TrackableCollection<>(p0.getView()));
        gui.setOriginalGameController(p0.getView(), recordingController());
        client = new Client();
        stream.addClient(client, 0);
    }

    private void start() {
        start(new WebSeats.Timeouts(10_000, 10_000));
    }

    private IGameController recordingController() {
        return (IGameController) Proxy.newProxyInstance(getClass().getClassLoader(), new Class<?>[] {IGameController.class},
                (proxy, m, args) -> {
                    StringBuilder sb = new StringBuilder(m.getName());
                    if (args != null) {
                        for (Object a : args) {
                            sb.append(' ').append(a instanceof CardView cv ? "card" + cv.getId() + (cv == game.findById(cv.getId()).getView() ? "" : "(stale)")
                                    : a instanceof forge.game.player.PlayerView pv ? "player" + pv.getId() : String.valueOf(a));
                        }
                    }
                    callThreads.add(Thread.currentThread().getName()); // first: a test reads it once it sees the call
                    controllerCalls.add(sb.toString());
                    Callable<Void> hook = onCall.get(m.getName());
                    if (hook != null) {
                        hook.call();
                    }
                    Class<?> r = m.getReturnType();
                    return r == boolean.class ? false : r == int.class ? 0 : null;
                });
    }

    private <T> Future<T> onGameThread(Callable<T> c) {
        return gameThread.submit(c);
    }

    /** The game thread waits for an input of the seat, as {@code InputSyncronizedBase} does; counting {@code done} down ends it. */
    private Future<Void> waitForInput(CountDownLatch done) throws Exception {
        Future<Void> f = onGameThread(() -> {
            gui.awaitInput(done);
            return null;
        });
        awaitWaiting();
        return f;
    }

    private void awaitWaiting() throws InterruptedException {
        long end = System.currentTimeMillis() + 5000;
        while (!gui.session().pump().waiting()) {
            if (System.currentTimeMillis() > end) {
                fail("the game thread never waited for the input");
            }
            Thread.sleep(2);
        }
    }

    private static void sleep(long ms) {
        try {
            Thread.sleep(ms);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }

    private void reply(JsonObject prompt, JsonElement value) {
        JsonObject r = new JsonObject();
        r.addProperty("t", "reply");
        r.add("id", prompt.get("id"));
        r.add("value", value);
        stream.clientMessage(0, r, client);
    }

    private void action(String json) {
        stream.clientMessage(0, JsonParser.parseString(json).getAsJsonObject(), client);
    }

    private static JsonElement json(String s) {
        return JsonParser.parseString(s);
    }

    private static <T> T get(Future<T> f) throws Exception {
        return f.get(5, TimeUnit.SECONDS);
    }

    private static List<String> labels(JsonObject prompt) {
        List<String> l = new ArrayList<>();
        for (JsonElement c : prompt.getAsJsonArray("choices")) {
            l.add(c.getAsJsonObject().get("label").getAsString());
        }
        return l;
    }

    // --- choose ---

    @Test
    public void chooseRendersLabelsHidesUnseenCardsAndMapsIndicesBack() throws Exception {
        start();
        Card mine = TestEngine.add("Grizzly Bears", p0, ZoneType.Hand);
        Card theirs = TestEngine.add("Lightning Bolt", p1, ZoneType.Hand);
        List<CardView> choices = List.of(mine.getView(), theirs.getView());
        Future<List<CardView>> f = onGameThread(() -> gui.getChoices("Pick one", 1, 1, choices, null, null));

        JsonObject p = client.next("prompt");
        assertEquals(p.get("method").getAsString(), "getChoices");
        assertEquals(p.get("shape").getAsString(), "choose");
        assertEquals(p.get("min").getAsInt(), 1);
        assertEquals(p.get("max").getAsInt(), 1);
        assertTrue(labels(p).get(0).contains("Grizzly Bears"), labels(p).toString());
        assertEquals(labels(p).get(1), WireArgs.HIDDEN_CARD);
        assertFalse(p.toString().contains("Lightning Bolt"), "a hidden card's name never reaches the seat");
        JsonObject hiddenRef = p.getAsJsonArray("choices").get(1).getAsJsonObject().getAsJsonObject("ref");
        assertTrue(hiddenRef.get("id").getAsInt() >= ViewerStream.ALIAS_BASE, "hidden card named by an unseen id: " + hiddenRef);
        assertEquals(p.getAsJsonArray("choices").get(0).getAsJsonObject().getAsJsonObject("ref").get("id").getAsInt(), mine.getId());

        reply(p, json("[0,1]"));
        assertEquals(client.next("replyRejected").get("reason").getAsString(), "pick between 1 and 1");
        reply(p, json("[2]"));
        client.next("replyRejected");
        reply(p, json("\"x\""));
        client.next("replyRejected");
        assertFalse(f.isDone(), "an invalid reply leaves the prompt open");
        reply(p, json("[1]"));
        assertEquals(get(f), List.of(theirs.getView()));
        assertEquals(client.next("promptClosed").get("reason").getAsString(), "answered");
        reply(p, json("[0]"));
        assertTrue(client.next("replyRejected").get("reason").getAsString().startsWith("no open prompt"));
    }

    /**
     * An engine call with several abilities and no trigger event (a spell cast by an effect, an optional additional
     * cost, a mana source with two abilities): as the desktop ({@code CMatchUI}), every ability is offered, even when
     * its {@code canPlay} (normal timing) is false.
     */
    /**
     * {@code PlayerControllerHuman.chooseCardsPile} offers two header {@code CardView}s that are no game card ("-- Pile
     * 1 (n cards) --") among the piles' cards, and asks again until one header is picked: the seat must see their
     * names to answer it.
     */
    @Test
    public void pileHeadersAreNamedAndPickable() throws Exception {
        start();
        Card mine = TestEngine.add("Grizzly Bears", p0, ZoneType.Hand);
        CardView pile1 = new CardView(Integer.MIN_VALUE, null, "-- Pile 1 (1 cards) --");
        CardView pile2 = new CardView(Integer.MIN_VALUE + 1, null, "-- Pile 2 (0 cards) --");
        List<CardView> choices = List.of(pile1, mine.getView(), pile2);
        Future<CardView> f = onGameThread(() -> gui.one("Choose a pile", choices));
        JsonObject p = client.next("prompt");
        assertEquals(labels(p), List.of("-- Pile 1 (1 cards) --", String.valueOf(mine.getView()), "-- Pile 2 (0 cards) --"));
        reply(p, json("[2]"));
        assertSame(get(f), pile2);
    }

    @Test
    public void abilityChoiceOffersEveryAbilityTheEngineOffers() throws Exception {
        start();
        Card factory = TestEngine.add("Mishra's Factory", p0, ZoneType.Library);
        List<forge.game.spellability.SpellAbilityView> abilities = new ArrayList<>();
        for (forge.game.spellability.SpellAbility sa : factory.getSpellAbilities()) {
            if (!sa.isManaAbility()) {
                sa.getView().updateCanPlay(sa);
                assertFalse(sa.getView().canPlay(), "from the library: " + sa);
                abilities.add(sa.getView());
            }
        }
        assertTrue(abilities.size() >= 2, abilities.toString());
        Future<forge.game.spellability.SpellAbilityView> f = onGameThread(() -> gui.getAbilityToPlay(factory.getView(), abilities, null));
        JsonObject p = client.next("prompt");
        assertEquals(p.get("method").getAsString(), "getAbilityToPlay");
        for (JsonElement c : p.getAsJsonArray("choices")) {
            assertFalse(c.getAsJsonObject().has("disabled"), "offered: " + c);
        }
        reply(p, json("[1]"));
        assertSame(get(f), abilities.get(1));
    }

    // --- silent defaults: logged, and fatal in strict mode ---

    @Test
    public void answeredPromptsAreNoSilentDefault() throws Exception {
        start();
        SilentDefaults.reset();
        Future<Boolean> f = onGameThread(() -> gui.confirm(null, "Q?", true, null));
        reply(client.next("prompt"), json("false"));
        assertFalse(get(f));
        assertEquals(SilentDefaults.count(), 0);
    }

    @Test
    public void aTimedOutPromptIsReportedAndFailsInStrictMode() throws Exception {
        start(new WebSeats.Timeouts(200, 10_000));
        SilentDefaults.reset();
        Future<List<String>> f = onGameThread(() -> gui.getChoices("Pick", 1, 2, List.of("a", "b", "c"), null, null));
        client.next("prompt");
        assertEquals(get(f), List.of("a"), "not strict: the engine default");
        assertEquals(SilentDefaults.count(), 1);
        assertTrue(SilentDefaults.recent().get(0).contains("getChoices") && SilentDefaults.recent().get(0).contains("TIMEOUT"),
                SilentDefaults.recent().toString());

        SilentDefaults.setStrict(true);
        Future<Boolean> g = onGameThread(() -> gui.confirm(null, "Q?", true, null));
        client.next("prompt");
        try {
            g.get(5, TimeUnit.SECONDS);
            fail("strict mode answers nothing for the player");
        } catch (java.util.concurrent.ExecutionException e) {
            assertTrue(e.getCause() instanceof SilentDefaults.SilentDefaultException, String.valueOf(e.getCause()));
        }
        assertEquals(client.next("promptClosed").get("reason").getAsString(), "timeout", "the seat still learns the prompt closed");
    }

    @Test
    public void aMethodWithoutAPromptShapeIsReported() throws Exception {
        start();
        SilentDefaults.reset();
        Object r = onGameThread(() -> gui.session().sendAndWait(
                new forge.gamemodes.net.event.GuiGameEvent(forge.gamemodes.net.ProtocolMethod.setCard, (Object) null))).get(5, TimeUnit.SECONDS);
        assertNull(r);
        assertEquals(SilentDefaults.count(), 1);
        SilentDefaults.setStrict(true);
        try {
            gui.session().sendAndWait(new forge.gamemodes.net.event.GuiGameEvent(forge.gamemodes.net.ProtocolMethod.setCard, (Object) null));
            fail("strict mode");
        } catch (SilentDefaults.SilentDefaultException expected) {
            assertTrue(expected.getMessage().contains("setCard"), expected.getMessage());
        }
    }

    @Test
    public void aClosedSeatsDefaultsAreReported() throws Exception {
        start();
        SilentDefaults.reset();
        seats.newSeat(0);
        assertTrue(get(onGameThread(() -> gui.confirm(null, "Q?", true, null))));
        assertEquals(SilentDefaults.count(), 1);
    }

    @Test
    public void headlessDialogsAreReported() {
        SilentDefaults.reset();
        forge.fork.web.HeadlessWebGui headless = new forge.fork.web.HeadlessWebGui("forge-gui/", () -> null);
        assertEquals(headless.getChoices("Whose graveyard?", 0, 1, List.of("a", "b"), null, null), List.of());
        assertEquals(headless.showOptionDialog("Sure?", "T", null, List.of("Yes", "No"), 0), -1);
        assertEquals(SilentDefaults.count(), 2);
        SilentDefaults.setStrict(true);
        try {
            headless.order("Order", "Top", 0, 0, List.of("a", "b"), List.of());
            fail("strict mode");
        } catch (SilentDefaults.SilentDefaultException expected) {
            assertTrue(expected.getMessage().contains("order"), expected.getMessage());
        }
    }

    @Test
    public void optionDialogAnswersAnIndex() throws Exception {
        start();
        Future<Integer> f = onGameThread(() -> gui.showOptionDialog("Which?", "Title", null, List.of("a", "b", "c"), 2));
        JsonObject p = client.next("prompt");
        assertEquals(labels(p), List.of("a", "b", "c"));
        assertEquals(p.get("default").getAsInt(), 2);
        reply(p, json("[1]"));
        assertEquals(get(f), Integer.valueOf(1));
    }

    // --- confirm ---

    @Test
    public void confirmTakesABoolean() throws Exception {
        start();
        Future<Boolean> f = onGameThread(() -> gui.confirm(null, "Keep this hand?", false, List.of("Keep", "Mulligan")));
        JsonObject p = client.next("prompt");
        assertEquals(p.get("shape").getAsString(), "confirm");
        assertEquals(p.get("yes").getAsString(), "Keep");
        assertEquals(p.get("no").getAsString(), "Mulligan");
        assertFalse(p.get("default").getAsBoolean());
        reply(p, json("1"));
        client.next("replyRejected");
        reply(p, json("true"));
        assertTrue(get(f));

        Future<Boolean> g = onGameThread(() -> gui.showConfirmDialog("Sure?", "T", "Yes", "No", true));
        JsonObject q = client.next("prompt");
        assertEquals(q.get("method").getAsString(), "showConfirmDialog");
        reply(q, json("false"));
        assertFalse(get(g));
    }

    // --- order / two lists ---

    @Test
    public void orderValidatesHowManyStayOut() throws Exception {
        start();
        List<String> source = List.of("a", "b", "c");
        Future<IGuiGame.OrderResult<String>> f = onGameThread(() -> gui.order("Order", "Top", 0, 0, source, null, null, false, true));
        JsonObject p = client.next("prompt");
        assertEquals(p.get("shape").getAsString(), "order");
        assertEquals(p.get("remainingMin").getAsInt(), 0);
        assertEquals(p.get("remainingMax").getAsInt(), 0);
        reply(p, json("{\"order\":[2,0]}"));
        assertEquals(client.next("replyRejected").get("reason").getAsString(), "leave between 0 and 0 out");
        reply(p, json("{\"order\":[2,0,0]}"));
        client.next("replyRejected");
        reply(p, json("{\"order\":[2,0,1],\"remember\":true}"));
        IGuiGame.OrderResult<String> r = get(f);
        assertEquals(r.ordered(), List.of("c", "a", "b"));
        assertTrue(r.rememberDecision());
    }

    /** Library cards the seat may look at, top first. */
    private List<CardView> library(String... names) {
        List<CardView> cards = new ArrayList<>();
        for (String n : names) {
            Card x = TestEngine.add(n, p0, ZoneType.Library);
            x.addMayLookTemp(p0);
            cards.add(x.getView());
        }
        return cards;
    }

    @Test
    public void manipulateCardListOffersOnlyTheMovableCardsAsTopAndBottomPiles() throws Exception {
        start();
        // as PlayerControllerHuman.arrangeForScry with UI_SELECT_FROM_CARD_DISPLAYS: the whole library, the top 3 movable
        List<CardView> cards = library("Island", "Forest", "Swamp", "Mountain", "Plains");
        Future<List<CardView>> f = onGameThread(() -> gui.manipulateCardList("Scry", cards, cards.subList(0, 3), true, true, false));
        JsonObject p = client.next("prompt");
        assertTrue(p.get("piles").getAsBoolean());
        assertFalse(p.has("permutation"));
        JsonArray choices = p.getAsJsonArray("choices");
        assertEquals(choices.size(), 3, "only the scried cards: " + choices);
        for (int i = 0; i < 3; i++) {
            assertTrue(choices.get(i).getAsJsonObject().get("label").getAsString().startsWith(cards.get(i).getName()), choices.toString());
        }
        reply(p, json("[2,0,1]"));
        assertEquals(client.next("replyRejected").get("reason").getAsString(), "expected {top, bottom}");
        reply(p, json("{\"top\":[0,1],\"bottom\":[1,2]}"));
        client.next("replyRejected");
        reply(p, json("{\"top\":[0],\"bottom\":[2]}"));
        assertEquals(client.next("replyRejected").get("reason").getAsString(), "each card goes to the top or the bottom");
        // Swamp on top; Island then Forest on the bottom, Forest last. arrangeForMove reads the bottom pile from the
        // end of the list and GameAction.scry puts each card under the previous one: the pile comes back reversed.
        reply(p, json("{\"top\":[2],\"bottom\":[0,1]}"));
        assertEquals(get(f), List.of(cards.get(2), cards.get(3), cards.get(4), cards.get(1), cards.get(0)));
    }

    @Test
    public void manipulateCardListWithNothingElseInTheLibraryKeepsThePilesInOrder() throws Exception {
        start();
        // scry 2 with two cards left: everything is movable, the result is the library as it will be
        List<CardView> cards = library("Island", "Forest");
        Future<List<CardView>> f = onGameThread(() -> gui.manipulateCardList("Scry", cards, cards, true, true, false));
        JsonObject p = client.next("prompt");
        reply(p, json("{\"top\":[],\"bottom\":[1,0]}"));
        assertEquals(get(f), List.of(cards.get(1), cards.get(0)));
    }

    @Test
    public void manipulateCardListHonoursTopBottomAndAnywhere() throws Exception {
        start();
        List<CardView> cards = library("Island", "Forest", "Swamp");
        Future<List<CardView>> bottomOnly = onGameThread(() -> gui.manipulateCardList("Bottom", cards, cards.subList(0, 1), false, true, false));
        JsonObject p = client.next("prompt");
        assertEquals(p.getAsJsonArray("choices").size(), 1);
        assertFalse(p.get("toTop").getAsBoolean());
        reply(p, json("{\"top\":[0],\"bottom\":[]}"));
        assertEquals(client.next("replyRejected").get("reason").getAsString(), "no card may go to the top");
        reply(p, json("{\"top\":[],\"bottom\":[0]}"));
        assertEquals(get(bottomOnly), List.of(cards.get(1), cards.get(2), cards.get(0)));

        // anywhere: a place among the other cards, so the whole list (no engine caller passes it)
        Future<List<CardView>> anywhere = onGameThread(() -> gui.manipulateCardList("Anywhere", cards, cards.subList(0, 1), true, true, true));
        JsonObject q = client.next("prompt");
        assertTrue(q.get("permutation").getAsBoolean());
        reply(q, json("[1,0,2]"));
        assertEquals(get(anywhere), List.of(cards.get(1), cards.get(0), cards.get(2)));
    }

    @Test
    public void manipulateCardListTimesOutWithEveryCardKeptOnTop() throws Exception {
        start(new WebSeats.Timeouts(200, 10_000));
        List<CardView> cards = library("Island", "Forest", "Swamp");
        Future<List<CardView>> f = onGameThread(() -> gui.manipulateCardList("Scry", cards, cards.subList(0, 2), true, true, false));
        client.next("prompt");
        assertEquals(get(f), cards);
    }

    @Test
    public void manyTimesOutWithTheFewestItems() throws Exception {
        start(new WebSeats.Timeouts(200, 10_000));
        // AbstractGuiGame.many -> order(remainingMin = size - max, remainingMax = size - min)
        Future<List<String>> none = onGameThread(() -> gui.many("Discard up to 2", "Discard", 0, 2, List.of("a", "b", "c"), null));
        JsonObject p = client.next("prompt");
        assertEquals(p.get("remainingMin").getAsInt(), 1);
        assertEquals(p.get("remainingMax").getAsInt(), 3);
        assertEquals(get(none), List.of(), "an optional pick takes nothing by default");
        assertEquals(client.next("promptClosed").get("reason").getAsString(), "timeout");

        Future<List<String>> one = onGameThread(() -> gui.many("Discard 1 to 2", "Discard", 1, 2, List.of("a", "b", "c"), null));
        client.next("prompt");
        assertEquals(get(one), List.of("a"), "at least min, no more");
    }

    // --- distribute ---

    @Test
    public void genericAmountChecksBoundsAndSum() throws Exception {
        start();
        Map<Object, Integer> targets = new LinkedHashMap<>();
        targets.put(p0.getView(), 3);
        targets.put(p1.getView(), 3);
        Future<Map<Object, Integer>> f = onGameThread(() -> gui.assignGenericAmount(null, targets, 4, true, "damage"));
        JsonObject p = client.next("prompt");
        assertEquals(p.get("shape").getAsString(), "distribute");
        assertEquals(p.get("amount").getAsInt(), 4);
        assertEquals(p.getAsJsonArray("choices").get(1).getAsJsonObject().get("max").getAsInt(), 3);
        reply(p, json("[0,4]"));
        assertEquals(client.next("replyRejected").get("reason").getAsString(), "amount 0 outside [1, 3]");
        reply(p, json("[2,3]"));
        assertEquals(client.next("replyRejected").get("reason").getAsString(), "amounts must sum to 4");
        reply(p, json("[1,3]"));
        Map<Object, Integer> r = get(f);
        assertEquals(r.get(p0.getView()), Integer.valueOf(1));
        assertEquals(r.get(p1.getView()), Integer.valueOf(3));
    }

    @Test
    public void combatDamageNeedsLethalBeforeTheNextTargetAndMapsTheDefenderToTheNullKey() throws Exception {
        start();
        Card attacker = TestEngine.add("Colossal Dreadmaw", p0, ZoneType.Battlefield); // 6/6 trample
        Card b1 = TestEngine.add("Grizzly Bears", p1, ZoneType.Battlefield);
        Card b2 = TestEngine.add("Llanowar Elves", p1, ZoneType.Battlefield);
        Future<Map<CardView, Integer>> f = onGameThread(() -> gui.assignCombatDamage(attacker.getView(),
                List.of(b1.getView(), b2.getView()), 6, p1.getView(), false, false));
        JsonObject p = client.next("prompt");
        JsonArray cs = p.getAsJsonArray("choices");
        assertTrue(cs.get(2).getAsJsonObject().get("defender").getAsBoolean());
        assertEquals(cs.get(0).getAsJsonObject().get("lethal").getAsInt(), 2);
        assertEquals(cs.get(1).getAsJsonObject().get("lethal").getAsInt(), 1);
        assertEquals(cs.get(2).getAsJsonObject().get("lethal").getAsInt(), p1.getLife());
        assertEquals(p.get("lethalOrder").getAsString(), "inOrder");
        reply(p, json("null"));
        assertEquals(client.next("replyRejected").get("reason").getAsString(), "amounts required");
        reply(p, json("[0,6,0]"));
        assertEquals(client.next("replyRejected").get("reason").getAsString(), "choice 0 needs lethal damage (2) before choice 1");
        reply(p, json("[2,0,4]"));
        assertEquals(client.next("replyRejected").get("reason").getAsString(), "choice 1 needs lethal damage (1) before choice 2");
        reply(p, json("[2,1,3]"));
        Map<CardView, Integer> r = get(f);
        assertEquals(r.get(b1.getView()), Integer.valueOf(2));
        assertEquals(r.get(b2.getView()), Integer.valueOf(1));
        assertEquals(r.get(null), Integer.valueOf(3));
    }

    @Test
    public void combatDamageWithOverrideOrderStillNeedsLethalOnEveryBlockerBeforeTheDefender() throws Exception {
        start();
        Card attacker = TestEngine.add("Colossal Dreadmaw", p0, ZoneType.Battlefield);
        Card b1 = TestEngine.add("Grizzly Bears", p1, ZoneType.Battlefield);
        Card b2 = TestEngine.add("Llanowar Elves", p1, ZoneType.Battlefield);
        Future<Map<CardView, Integer>> f = onGameThread(() -> gui.assignCombatDamage(attacker.getView(),
                List.of(b1.getView(), b2.getView()), 6, p1.getView(), true, false));
        JsonObject p = client.next("prompt");
        assertEquals(p.get("lethalOrder").getAsString(), "blockersFirst");
        reply(p, json("[0,1,5]"));
        assertEquals(client.next("replyRejected").get("reason").getAsString(), "choice 0 needs lethal damage (2) before choice 2");
        reply(p, json("[0,6,0]")); // blockers in any order
        Map<CardView, Integer> r = get(f);
        assertEquals(r.get(b1.getView()), Integer.valueOf(0));
        assertEquals(r.get(b2.getView()), Integer.valueOf(6));
        assertFalse(r.containsKey(null));
    }

    @Test
    public void combatDamageOffersTheDefenderOnlyToATrampler() throws Exception {
        start();
        Card attacker = TestEngine.add("Craw Wurm", p0, ZoneType.Battlefield); // 6/4, no trample
        Card b1 = TestEngine.add("Grizzly Bears", p1, ZoneType.Battlefield);
        Card b2 = TestEngine.add("Llanowar Elves", p1, ZoneType.Battlefield);
        // the engine passes the defender for every blocked attacker (Combat.assignAttackersDamage)
        Future<Map<CardView, Integer>> f = onGameThread(() -> gui.assignCombatDamage(attacker.getView(),
                List.of(b1.getView(), b2.getView()), 6, p1.getView(), false, false));
        JsonObject p = client.next("prompt");
        assertEquals(p.getAsJsonArray("choices").size(), 2);
        reply(p, json("[5,1]"));
        Map<CardView, Integer> r = get(f);
        assertEquals(r.get(b1.getView()), Integer.valueOf(5));
        assertEquals(r.get(b2.getView()), Integer.valueOf(1));
        assertFalse(r.containsKey(null));
    }

    // --- text ---

    @Test
    public void numericInputRejectsText() throws Exception {
        start();
        Future<String> f = onGameThread(() -> gui.showInputDialog("How many?", "X", null, "", null, true));
        JsonObject p = client.next("prompt");
        assertEquals(p.get("shape").getAsString(), "text");
        assertTrue(p.get("numeric").getAsBoolean());
        reply(p, json("\"many\""));
        assertEquals(client.next("replyRejected").get("reason").getAsString(), "expected a number");
        reply(p, json("\"12\""));
        assertEquals(get(f), "12");

        Future<String> g = onGameThread(() -> gui.showInputDialog("Name", "N", null, "x", null, false));
        reply(client.next("prompt"), json("null"));
        assertNull(get(g), "null cancels");
    }

    // --- timeout, disconnect, reconnect ---

    @Test
    public void unansweredPromptTimesOutWithTheEngineDefault() throws Exception {
        start(new WebSeats.Timeouts(200, 10_000));
        Future<List<String>> f = onGameThread(() -> gui.getChoices("Pick", 1, 2, List.of("a", "b", "c"), null, null));
        client.next("prompt");
        assertEquals(get(f), List.of("a"), "default: the first min choices");
        assertEquals(client.next("promptClosed").get("reason").getAsString(), "timeout");

        Future<Boolean> g = onGameThread(() -> gui.showConfirmDialog("Sure?", "T", "Yes", "No", true));
        assertTrue(get(g), "default: the dialog's default");
    }

    @Test
    public void promptWithoutAClientGetsTheDefaultAfterTheGrace() throws Exception {
        start(new WebSeats.Timeouts(10_000, 200));
        stream.removeClient(client);
        long t0 = System.currentTimeMillis();
        Future<Integer> f = onGameThread(() -> gui.showOptionDialog("Which?", "T", null, List.of("a", "b"), 1));
        assertEquals(get(f), Integer.valueOf(1));
        assertTrue(System.currentTimeMillis() - t0 < 4000, "closed by the disconnect grace, not the prompt timeout");
    }

    /** A browser waiting for the game connects before the seat and the game exist: its prompts are not "disconnected". */
    @Test
    public void aClientConnectedBeforeTheGameKeepsItsPromptsPastTheGrace() throws Exception {
        gameThread = Executors.newSingleThreadExecutor(r -> new Thread(r, "Game-test"));
        game = TestEngine.newGame(2);
        p0 = game.getPlayers().get(0);
        stream = new GameStream(HiddenPolicy.REDACT, null);
        seats = new WebSeats(stream, new WebSeats.Timeouts(10_000, 200));
        client = new Client();
        stream.addClient(client, 0);
        gui = seats.newSeat(0);
        gui.setGameView(game.getView());
        gui.openView(new TrackableCollection<>(p0.getView()));
        gui.setOriginalGameController(p0.getView(), recordingController());
        assertPromptOutlivesTheGrace();
    }

    /** The seat's next game (--games N, or the launcher's next match) while the browser stays connected. */
    @Test
    public void theSeatsNextGameKeepsItsConnectedClientsPromptsPastTheGrace() throws Exception {
        start(new WebSeats.Timeouts(10_000, 200));
        gui = seats.newSeat(0);
        gui.setGameView(game.getView());
        gui.openView(new TrackableCollection<>(p0.getView()));
        gui.setOriginalGameController(p0.getView(), recordingController());
        assertPromptOutlivesTheGrace();
    }

    private void assertPromptOutlivesTheGrace() throws Exception {
        SilentDefaults.reset();
        Future<Boolean> f = onGameThread(() -> gui.confirm(null, "Q?", true, null));
        JsonObject p = client.next("prompt");
        Thread.sleep(800); // 4 disconnect graces
        assertFalse(f.isDone(), "still waiting for the connected player");
        reply(p, json("false"));
        assertFalse(get(f), "the player's answer");
        assertEquals(SilentDefaults.count(), 0, SilentDefaults.recent().toString());
    }

    @Test
    public void clientLeavingMidPromptClosesItAfterTheGrace() throws Exception {
        start(new WebSeats.Timeouts(10_000, 200));
        Future<Boolean> f = onGameThread(() -> gui.confirm(null, "Q?", true, null));
        client.next("prompt");
        stream.removeClient(client);
        assertTrue(get(f));
    }

    @Test
    public void reconnectingClientGetsTheOpenPromptAndInputAgain() throws Exception {
        start(new WebSeats.Timeouts(10_000, 3_000));
        gui.showPromptMessage(p0.getView(), "Choose wisely", null);
        gui.updateButtons(p0.getView(), "OK", "Cancel", true, false, true);
        Future<List<String>> f = onGameThread(() -> gui.getChoices("Pick", 1, 1, List.of("a", "b"), null, null));
        JsonObject p = client.next("prompt");
        stream.removeClient(client);

        Client again = new Client();
        stream.addClient(again, 0);
        List<JsonObject> greeting = again.until("prompt");
        List<String> kinds = new ArrayList<>();
        for (JsonObject m : greeting) {
            String t = m.get("t").getAsString();
            kinds.add("call".equals(t) ? m.get("method").getAsString() : t);
        }
        assertEquals(kinds, List.of("hello", "snapshot", "openView", "showPromptMessage", "updateButtons", "prompt"));
        assertEquals(greeting.get(greeting.size() - 1).get("id"), p.get("id"));
        JsonObject r = new JsonObject();
        r.addProperty("t", "reply");
        r.add("id", p.get("id"));
        r.add("value", json("[1]"));
        stream.clientMessage(0, r, again);
        assertEquals(get(f), List.of("b"));
    }

    // --- must-fix: reveals reach the seat before the prompt ---

    @Test
    public void temporaryRevealIsFlushedBeforeThePrompt() throws Exception {
        start();
        Card top = TestEngine.add("Island", p0, ZoneType.Library);
        stream.publish(List.of(), false); // the seat holds it hidden
        client.msgs.clear();
        top.addMayLookTemp(p0); // tempShowCards: no event, so no batch flush
        Future<List<CardView>> f = onGameThread(() -> gui.getChoices("Put on top?", 0, 1, List.of(top.getView()), null, null));
        List<JsonObject> before = client.until("prompt");
        JsonObject prompt = before.get(before.size() - 1);
        boolean sentInFull = false;
        for (JsonObject m : before) {
            if ("delta".equals(m.get("t").getAsString())) {
                for (JsonElement o : m.getAsJsonArray("new")) {
                    JsonObject obj = o.getAsJsonObject();
                    sentInFull |= "cardState".equals(obj.get("type").getAsString()) && obj.get("id").getAsInt() == top.getId();
                }
            }
        }
        assertTrue(sentInFull, "the revealed card reached the seat before the prompt: " + before);
        JsonObject choice = prompt.getAsJsonArray("choices").get(0).getAsJsonObject();
        assertEquals(choice.getAsJsonObject("ref").get("id").getAsInt(), top.getId());
        assertTrue(choice.get("label").getAsString().contains("Island"));
        reply(prompt, json("[]"));
        assertEquals(get(f), List.of());
    }

    @Test
    public void revealedCopyOfAFaceDownCardIsNamedButNotByItsEngineId() throws Exception {
        start();
        Card exiled = TestEngine.add("Grizzly Bears", p1, ZoneType.Exile);
        exiled.turnFaceDown(true);
        stream.publish(List.of(), false); // seat 0 holds it as a placeholder
        client.msgs.clear();
        // as Player.revealFaceDownCards when p1 loses: a face-up LKI copy, same id, revealed to the others
        Card lki = CardCopyService.getLKICopy(exiled);
        lki.forceTurnFaceUp();
        lki.setZone(exiled.getZone());
        Future<Void> f = onGameThread(() -> {
            gui.reveal("Revealing face-down cards", List.of(lki.getView()));
            return null;
        });
        JsonObject p = client.next("prompt");
        assertEquals(p.get("max").getAsInt(), 0);
        JsonObject c = p.getAsJsonArray("choices").get(0).getAsJsonObject();
        assertTrue(c.get("label").getAsString().contains("Grizzly Bears"), c.toString());
        int ref = c.getAsJsonObject("ref").get("id").getAsInt();
        assertTrue(ref >= ViewerStream.ALIAS_BASE, "named by its unseen id, not its engine id: " + c);
        assertTrue(c.get("revealedCopy").getAsBoolean());
        reply(p, json("[]"));
        get(f);
    }

    // --- calls ---

    @Test
    public void callsNameHiddenCardsByUnseenIdsOnly() throws Exception {
        start();
        Card theirs = TestEngine.add("Lightning Bolt", p1, ZoneType.Hand);
        Card mine = TestEngine.add("Grizzly Bears", p0, ZoneType.Hand);
        stream.publish(List.of(), false);
        gui.setSelectables(List.of(mine.getView(), theirs.getView()), 1, 1);
        JsonObject call = client.next("call");
        while (!"setSelectables".equals(call.get("method").getAsString())) {
            call = client.next("call");
        }
        JsonArray refs = call.getAsJsonArray("args").get(0).getAsJsonArray();
        assertEquals(refs.get(0).getAsJsonObject().get("id").getAsInt(), mine.getId());
        assertTrue(refs.get(1).getAsJsonObject().get("id").getAsInt() >= ViewerStream.ALIAS_BASE);
        assertFalse(call.toString().contains("Lightning Bolt"));
    }

    // --- an input played through actions, with a real controller ---

    @Test
    public void choosingAPlayerNamesThePlayersAndTakesSelectPlayer() throws Exception {
        start();
        PlayerControllerHuman pch = new PlayerControllerHuman(game, p0, new LobbyPlayerHuman("You"));
        pch.setGui(gui);
        gui.setOriginalGameController(p0.getView(), pch);
        FCollection<Player> players = new FCollection<>(game.getPlayers());
        Future<List<Player>> f = onGameThread(() -> {
            // as PlayerControllerHuman.chooseStartingPlayer: an input over players only
            InputSelectEntitiesFromList<Player> in = new InputSelectEntitiesFromList<>(pch, 1, 1, players);
            in.showAndWait();
            return new ArrayList<>(in.getSelected());
        });
        JsonObject targets = client.next("call");
        while (!"setSelectableTargets".equals(targets.get("method").getAsString())) {
            targets = client.next("call");
        }
        JsonArray named = targets.getAsJsonArray("args").get(0).getAsJsonArray();
        assertEquals(named.size(), 2);
        assertEquals(named.get(1).getAsJsonObject().get("type").getAsString(), "player");
        assertEquals(named.get(1).getAsJsonObject().get("id").getAsInt(), p1.getId());

        action("{\"t\":\"action\",\"method\":\"selectPlayer\",\"player\":" + p1.getId() + "}");
        long end = System.currentTimeMillis() + 5000;
        while (!f.isDone() && System.currentTimeMillis() < end) {
            action("{\"t\":\"action\",\"method\":\"selectButtonOk\"}");
            Thread.sleep(100);
        }
        assertEquals(get(f), List.of(p1));
    }

    // --- actions ---

    @Test
    public void actionsResolveWireIdsToCurrentCards() throws Exception {
        start();
        Card mine = TestEngine.add("Grizzly Bears", p0, ZoneType.Hand);
        stream.publish(List.of(), false);
        CountDownLatch done = new CountDownLatch(1);
        Future<Void> waiting = waitForInput(done);
        action("{\"t\":\"action\",\"method\":\"selectButtonOk\"}");
        assertEquals(controllerCalls.poll(5, TimeUnit.SECONDS), "selectButtonOk");
        action("{\"t\":\"action\",\"method\":\"selectCard\",\"card\":" + mine.getId() + "}");
        assertEquals(controllerCalls.poll(5, TimeUnit.SECONDS), "selectCard card" + mine.getId() + " null null");
        action("{\"t\":\"action\",\"method\":\"selectPlayer\",\"player\":" + p1.getId() + "}");
        assertEquals(controllerCalls.poll(5, TimeUnit.SECONDS), "selectPlayer player" + p1.getId() + " null");
        action("{\"t\":\"action\",\"method\":\"useMana\",\"color\":2}");
        assertEquals(controllerCalls.poll(5, TimeUnit.SECONDS), "useMana 2");
        action("{\"t\":\"action\",\"method\":\"nextGameDecision\",\"decision\":\"QUIT\"}");
        assertEquals(controllerCalls.poll(5, TimeUnit.SECONDS), "nextGameDecision QUIT");
        for (String m : List.of("selectButtonCancel", "concede", "alphaStrike", "undoLastAction")) {
            action("{\"t\":\"action\",\"method\":\"" + m + "\"}");
            assertEquals(controllerCalls.poll(5, TimeUnit.SECONDS), m);
        }
        done.countDown();
        get(waiting);
    }

    @Test
    public void badActionsAreRejectedNotDispatched() throws Exception {
        start();
        Card theirs = TestEngine.add("Lightning Bolt", p1, ZoneType.Hand);
        stream.publish(List.of(), false);
        CountDownLatch done = new CountDownLatch(1);
        Future<Void> waiting = waitForInput(done);
        action("{\"t\":\"action\",\"method\":\"selectCard\",\"card\":" + theirs.getId() + "}");
        assertEquals(client.next("actionRejected").get("reason").getAsString(), "unknown card",
                "the engine id of a card the seat holds under an alias resolves to nothing");
        action("{\"t\":\"action\",\"method\":\"selectCard\",\"card\":123456}");
        client.next("actionRejected");
        action("{\"t\":\"action\",\"method\":\"launchMissiles\"}");
        assertEquals(client.next("actionRejected").get("reason").getAsString(), "unknown action");
        action("{\"t\":\"action\",\"method\":\"nextGameDecision\",\"decision\":\"MAYBE\"}");
        client.next("actionRejected");
        action("{\"t\":\"hello\"}");
        client.next("rejected");
        assertNull(controllerCalls.poll(200, TimeUnit.MILLISECONDS));
        done.countDown();
        get(waiting);
    }

    // --- threads (issue #53): only the game thread changes the game ---

    @Test
    public void actionsRunOnTheGameThreadWaitingForTheInput() throws Exception {
        start();
        CountDownLatch done = new CountDownLatch(1);
        Future<Void> waiting = waitForInput(done);
        action("{\"t\":\"action\",\"method\":\"selectButtonOk\"}");
        assertEquals(controllerCalls.poll(5, TimeUnit.SECONDS), "selectButtonOk");
        assertEquals(callThreads.poll(), "Game-test", "the game thread, not the seat's action thread");
        done.countDown();
        get(waiting);
    }

    /** The engine's safe point while no input of the seat waits: a player gets priority (issue #61). */
    private void priorityOnTheGameThread() throws Exception {
        get(onGameThread(() -> {
            game.fireEvent(new GameEventPlayerPriority(p1.getView(), PhaseType.MAIN1, p1.getView()));
            return null;
        }));
    }

    @Test
    public void withNoInputWaitingInputActionsAreDroppedAndGameActionsWaitForTheGameThread() throws Exception {
        start();
        Card mine = TestEngine.add("Grizzly Bears", p0, ZoneType.Hand);
        stream.publish(List.of(), false);
        action("{\"t\":\"action\",\"method\":\"selectButtonOk\"}");
        // (sendYieldUpdate needs a PlayerControllerHuman: HumanSeatConcedeTest)
        for (String m : List.of("concede", "drawOfferAction\",\"action\":\"OFFER")) {
            action("{\"t\":\"action\",\"method\":\"" + m + "\"}");
        }
        action("{\"t\":\"action\",\"method\":\"reorderHand\",\"card\":" + mine.getId() + ",\"index\":0}");
        action("{\"t\":\"action\",\"method\":\"getActivateDescription\",\"card\":" + mine.getId() + "}");
        assertNull(controllerCalls.poll(300, TimeUnit.MILLISECONDS), "nothing runs while the game thread is busy elsewhere");
        priorityOnTheGameThread();
        assertEquals(new ArrayList<>(controllerCalls), List.of("concede", "drawOfferAction OFFER",
                "reorderHand card" + mine.getId() + " 0", "getActivateDescription card" + mine.getId()), "OK found no input");
        assertEquals(new ArrayList<>(callThreads), List.of("Game-test", "Game-test", "Game-test", "Game-test"));
        assertEquals(client.next("activateDescription").get("card").getAsInt(), mine.getId());
        for (JsonObject m : client.msgs) {
            assertFalse(m.get("t").getAsString().endsWith("ejected"), "not an error: " + m);
        }
    }

    @Test
    public void aGameActionSentWhileTheGameRunsRunsAtTheSeatsNextInput() throws Exception {
        start();
        action("{\"t\":\"action\",\"method\":\"concede\"}");
        assertNull(controllerCalls.poll(300, TimeUnit.MILLISECONDS));
        CountDownLatch done = new CountDownLatch(1);
        Future<Void> waiting = waitForInput(done);
        assertEquals(controllerCalls.poll(5, TimeUnit.SECONDS), "concede");
        assertEquals(callThreads.poll(), "Game-test");
        done.countDown();
        get(waiting);
    }

    @Test
    public void gameActionsKeepTheirOrderWithInputActions() throws Exception {
        start();
        CountDownLatch done = new CountDownLatch(1);
        Future<Void> waiting = waitForInput(done);
        // the page's concede at priority: concede, then pass
        action("{\"t\":\"action\",\"method\":\"concede\"}");
        action("{\"t\":\"action\",\"method\":\"selectButtonOk\"}");
        assertEquals(controllerCalls.poll(5, TimeUnit.SECONDS), "concede");
        assertEquals(controllerCalls.poll(5, TimeUnit.SECONDS), "selectButtonOk");
        assertEquals(new ArrayList<>(callThreads), List.of("Game-test", "Game-test"));
        done.countDown();
        get(waiting);
    }

    @Test
    public void gameActionsLeftWhenTheGameEndsAreRejected() throws Exception {
        start();
        action("{\"t\":\"action\",\"method\":\"concede\"}");
        assertNull(controllerCalls.poll(300, TimeUnit.MILLISECONDS));
        get(onGameThread(() -> {
            game.fireEvent(new GameEventGameFinished());
            return null;
        }));
        assertEquals(client.next("actionRejected").get("reason").getAsString(), "game over");
        priorityOnTheGameThread();
        assertNull(controllerCalls.poll(300, TimeUnit.MILLISECONDS));
    }

    @Test
    public void aGameActionSentAsTheGameEndsIsNotAppliedToTheMatchsNextGame() throws Exception {
        start();
        get(onGameThread(() -> {
            game.fireEvent(new GameEventGameFinished());
            return null;
        }));
        action("{\"t\":\"action\",\"method\":\"concede\"}"); // sent before the seat saw the end
        assertNull(controllerCalls.poll(300, TimeUnit.MILLISECONDS));
        game = TestEngine.newGame(2); // the match's next game
        p0 = game.getPlayers().get(0);
        p1 = game.getPlayers().get(1);
        gui.setGameView(null); // as HostedMatch does for each game
        gui.setGameView(game.getView());
        gui.openView(new TrackableCollection<>(p0.getView()));
        priorityOnTheGameThread();
        assertEquals(client.next("actionRejected").get("reason").getAsString(), "game over");
        assertNull(controllerCalls.poll(300, TimeUnit.MILLISECONDS), "the next game is not conceded");
    }

    @Test
    public void anActionThatOpensAnotherInputLetsTheNextActionAnswerIt() throws Exception {
        start();
        Card mine = TestEngine.add("Grizzly Bears", p0, ZoneType.Hand);
        stream.publish(List.of(), false);
        List<String> order = new CopyOnWriteArrayList<>();
        CountDownLatch inner = new CountDownLatch(1);
        onCall.put("selectCard", () -> {
            order.add("card: another input");
            gui.awaitInput(inner); // e.g. a mana ability whose cost asks for a card
            order.add("card: done");
            return null;
        });
        onCall.put("selectButtonOk", () -> {
            order.add("ok");
            inner.countDown();
            return null;
        });
        CountDownLatch done = new CountDownLatch(1);
        Future<Void> waiting = waitForInput(done);
        action("{\"t\":\"action\",\"method\":\"selectCard\",\"card\":" + mine.getId() + "}");
        action("{\"t\":\"action\",\"method\":\"selectButtonOk\"}");
        assertEquals(controllerCalls.poll(5, TimeUnit.SECONDS), "selectCard card" + mine.getId() + " null null");
        assertEquals(controllerCalls.poll(5, TimeUnit.SECONDS), "selectButtonOk");
        long end = System.currentTimeMillis() + 5000;
        while (order.size() < 3 && System.currentTimeMillis() < end) {
            Thread.sleep(5);
        }
        assertEquals(order, List.of("card: another input", "ok", "card: done"));
        assertEquals(new ArrayList<>(callThreads), List.of("Game-test", "Game-test"));
        done.countDown();
        get(waiting);
    }

    @Test
    public void edtWorkQueuedBeforeAnActionRunsFirstAndWhatItQueuesRunsBeforeTheGameGoesOn() throws Exception {
        start();
        List<String> order = new CopyOnWriteArrayList<>();
        CountDownLatch done = new CountDownLatch(1);
        onCall.put("selectButtonOk", () -> {
            order.add("action");
            FThreads.invokeInEdtLater(() -> {
                sleep(150);
                order.add("refresh the action queued"); // InputPayMana.updateMessage
            });
            done.countDown(); // the action ends the input
            return null;
        });
        Future<Void> waiting = onGameThread(() -> {
            gui.awaitInput(done);
            order.add("game goes on");
            return null;
        });
        awaitWaiting();
        FThreads.invokeInEdtLater(() -> {
            sleep(150);
            order.add("input display queued before"); // InputProxy: showMessageInitial
        });
        action("{\"t\":\"action\",\"method\":\"selectButtonOk\"}");
        get(waiting);
        assertEquals(order, List.of("input display queued before", "action", "refresh the action queued", "game goes on"));
    }

    /**
     * Issue #60: an input that ends on the EDT (its display stops it, e.g. {@code InputPayMana.showMessage} once paid)
     * lets the game go on only once that EDT work is over: {@code InputPayMana.updateMessage} swaps the player's
     * controller for an AI one there ({@code runAsAi}), and the game thread must not read it meanwhile.
     */
    @Test
    public void anInputEndedOnTheEdtLetsTheGameGoOnOnlyOnceTheEdtWorkIsOver() throws Exception {
        start();
        List<String> order = new CopyOnWriteArrayList<>();
        CountDownLatch done = new CountDownLatch(1);
        Future<Void> waiting = waitForInput(done);
        CountDownLatch inEdt = new CountDownLatch(1);
        FThreads.invokeInEdtLater(() -> {
            done.countDown();
            inEdt.countDown();
            sleep(300);
            order.add("EDT work after the input ended"); // runAsAi swaps the controller back
        });
        assertTrue(inEdt.await(5, TimeUnit.SECONDS));
        get(onGameThreadAfter(waiting, () -> order.add("game goes on")));
        assertEquals(order, List.of("EDT work after the input ended", "game goes on"));
    }

    /** Runs {@code then} on the game thread once {@code first} (queued there before it) is over. */
    private Future<Void> onGameThreadAfter(Future<Void> first, Runnable then) {
        return onGameThread(() -> {
            assertTrue(first.isDone());
            then.run();
            return null;
        });
    }

    @Test
    public void aCallLeavesOutCardsTheSeatHasNoIdFor() throws Exception {
        start();
        Card land = TestEngine.add("Forest", p0, ZoneType.Battlefield);
        // in no zone: as a Treasure sacrificed since InputPayMana computed its auto-pay plan
        Card gone = Card.fromPaperCard(FModel.getMagicDb().getCommonCards().getCard("Forest"), p0);
        onGameThread(() -> {
            gui.setWeaklySelectable(List.of(land.getView(), gone.getView(), land.getView()));
            return null;
        }).get(5, TimeUnit.SECONDS);
        JsonObject call;
        do {
            call = client.next("call");
        } while (!"setWeaklySelectable".equals(call.get("method").getAsString()));
        JsonArray cards = call.getAsJsonArray("args").get(0).getAsJsonArray();
        assertEquals(cards.size(), 2, "the strength-2 entry of the land stays, the unknown card goes: " + cards);
        for (JsonElement c : cards) {
            assertEquals(c.getAsJsonObject().get("id").getAsInt(), land.getId());
        }
    }

    @Test
    public void aCallFromTheEdtWhileTheGameThreadWaitsNamesCardsNewSinceTheLastFlush() throws Exception {
        start();
        CountDownLatch done = new CountDownLatch(1);
        Future<Void> waiting = waitForInput(done);
        Card land = TestEngine.add("Forest", p0, ZoneType.Battlefield); // e.g. a mana source the auto-pay plan names
        FThreads.invokeInEdtLater(() -> gui.setWeaklySelectable(List.of(land.getView()))); // InputPayMana.updateMessage
        JsonObject call;
        do {
            call = client.next("call");
        } while (!"setWeaklySelectable".equals(call.get("method").getAsString()));
        assertEquals(call.getAsJsonArray("args").get(0).getAsJsonArray().get(0).getAsJsonObject().get("id").getAsInt(), land.getId(),
                "published before the call, not -1 (a card the seat was never told of)");
        done.countDown();
        get(waiting);
    }

    @Test
    public void offTheGameThreadTheSeatsGuiWalksTheGameOnlyWhileTheGameThreadWaits() throws Exception {
        start();
        GameEventForwarder fwd = new GameEventForwarder(gui);
        gui.setForwarder(fwd);
        fwd.receiveGameEvent(new GameEventCombatChanged());
        gui.setWeaklySelectable(List.of()); // as an input refresh on the EDT, while the game may be changing
        assertTrue(fwd.hasPendingEvents(), "not flushed off the game thread while the game runs");
        CountDownLatch done = new CountDownLatch(1);
        Future<Void> waiting = waitForInput(done);
        gui.setWeaklySelectable(List.of());
        assertFalse(fwd.hasPendingEvents(), "flushed while the game thread waits for the seat");
        done.countDown();
        get(waiting);
    }

    @Test
    public void theSeatsNextGameClosesThePreviousActionThread() {
        start();
        SeatSession first = gui.session();
        assertFalse(first.isClosed());
        WebGuiGame next = seats.newSeat(0); // --games N: one GUI per game
        assertTrue(first.isClosed());
        assertFalse(next.session().isClosed());
    }

    @Test
    public void aReplacedSeatClosesItsOpenPromptsAndSendsNothingMore() throws Exception {
        start();
        Future<List<String>> f = onGameThread(() -> gui.getChoices("Pick", 1, 2, List.of("a", "b", "c"), null, null));
        client.next("prompt");
        seats.newSeat(0); // another match takes the seat while this game still runs
        assertEquals(get(f), List.of("a"), "the open prompt gets its engine default at once");

        Future<Boolean> g = onGameThread(() -> gui.confirm(null, "Q?", true, null));
        assertTrue(get(g), "later prompts of the old game: their default, without asking");
        gui.showPromptMessage(p0.getView(), "old game", null);
        onGameThread(() -> {
            gui.handleGameEvents(List.of());
            return null;
        }).get(5, TimeUnit.SECONDS);
        assertNull(client.msgs.poll(300, TimeUnit.MILLISECONDS), "the seat's page belongs to the new match");
    }

    @Test
    public void thePublishingSeatsGameEventsReachTheEventSink() throws Exception {
        // The launcher plays Forge's sounds from these (a Swing match's FControlGameEventHandler does it there).
        start();
        List<GameEvent> heard = new CopyOnWriteArrayList<>();
        seats.setEventSink(heard::addAll);
        GameEvent shuffle = new GameEventShuffle(p0.getView());
        onGameThread(() -> {
            gui.handleGameEvents(List.of(shuffle));
            return null;
        }).get(5, TimeUnit.SECONDS);
        assertEquals(heard, List.of(shuffle));

        // A second human seat of the same game does not publish: its batches would play every sound twice.
        WebGuiGame other = seats.newSeat(1);
        other.setGameView(game.getView());
        other.openView(new TrackableCollection<>(p1.getView()));
        onGameThread(() -> {
            other.handleGameEvents(List.of(new GameEventShuffle(p1.getView())));
            return null;
        }).get(5, TimeUnit.SECONDS);
        assertEquals(heard, List.of(shuffle));

        // A sink that throws never reaches the game thread.
        seats.setEventSink(events -> {
            throw new IllegalStateException("no audio device");
        });
        onGameThread(() -> {
            gui.handleGameEvents(List.of(shuffle));
            return null;
        }).get(5, TimeUnit.SECONDS);
    }

    @Test
    public void openViewIsTheSeatsOwnPlayer() throws Exception {
        start();
        Client c = new Client();
        stream.addClient(c, 0);
        List<JsonObject> greeting = c.until("call");
        JsonObject open = greeting.get(greeting.size() - 1);
        assertEquals(open.get("method").getAsString(), "openView");
        assertEquals(open.getAsJsonArray("args").get(0).getAsJsonArray().get(0).getAsJsonObject().get("id").getAsInt(), p0.getId());
        assertSame(stream.gameView(), game.getView());
        assertNotNull(gui);
    }
}
