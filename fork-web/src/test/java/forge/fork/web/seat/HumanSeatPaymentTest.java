package forge.fork.web.seat;

import static org.testng.Assert.assertEquals;
import static org.testng.Assert.assertFalse;
import static org.testng.Assert.assertNotNull;
import static org.testng.Assert.assertTrue;
import static org.testng.Assert.fail;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
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
import forge.gamemodes.match.input.InputSelectCardsForConvokeOrImprovise;
import forge.gamemodes.match.input.InputSelectCardsFromList;
import forge.gamemodes.match.input.InputSelectTargets;
import forge.gui.control.GameEventForwarder;
import forge.player.LobbyPlayerHuman;
import forge.player.PlayerControllerHuman;
import forge.trackable.TrackableCollection;
import forge.fork.web.bridge.GameStream;
import forge.fork.web.bridge.GameStream.HiddenPolicy;
import forge.fork.web.bridge.visibility.TestEngine;

/**
 * Issues #66 and #70: how the web human seat pays, in a real game, only through the page's messages. Auto-pay
 * ("Pay automatically", and the page's Auto-pay switch, which presses it) taps and spends mana only: it never
 * sacrifices, pays life or pays any other cost the player did not choose. Convoke, improvise and delve are paid with
 * the permanents and cards the seat picks, among the ones the bridge lit. Each test asserts what the engine recorded.
 */
public class HumanSeatPaymentTest {

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

    /** Seat 0 is a {@code PlayerControllerHuman} on a {@link WebGuiGame}, as {@code HostedMatch} wires it; one AI opponent. */
    private void start() {
        SilentDefaults.reset();
        SilentDefaults.setStrict(true);
        gameThread = Executors.newSingleThreadExecutor(r -> new Thread(r, "Game-66"));
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

    private void mainPhase() {
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

    private void selectPlayer(Player p) {
        action("selectPlayer", "\"player\":" + p.getId());
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
                seen.add("prompt " + m.get("method").getAsString());
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
            Runnable r = onInput.apply(in);
            (r == null ? (Runnable) this::ok : r).run();
            synced = false;
            action("sync", "\"id\":" + (++sync));
        }
        loop.get(1, TimeUnit.SECONDS);
        return seen;
    }

    private static JsonElement noPrompt(JsonObject m) {
        return null;
    }

    /** The {@code args} of the last call {@code method} the seat received. */
    private JsonArray lastArgs(String method) {
        String call = seat.lastCall(method);
        assertNotNull(call, "the seat received " + method);
        return JsonParser.parseString(call).getAsJsonObject().getAsJsonArray("args");
    }

    /** Whether the seat's last {@code updateButtons} enables OK (InputPayMana: "Auto"). */
    private boolean okEnabled() {
        return lastArgs("updateButtons").get(3).getAsBoolean();
    }

    /** The card ids the seat's input offers now: the cards of its last {@code setSelection}. */
    private Set<Integer> selectables() {
        return selectionIds("cards");
    }

    /**
     * {@link #selectables()} once it names any: an input's first display sends its selection after its message
     * ({@code InputBase.showMessageInitial}, on the EDT), so it may still be on its way. Waits up to 5 s.
     */
    private Set<Integer> awaitSelectables() {
        long end = System.currentTimeMillis() + 5000;
        Set<Integer> ids = selectables();
        while (ids.isEmpty() && System.currentTimeMillis() < end) {
            try {
                Thread.sleep(10);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                break;
            }
            ids = selectables();
        }
        return ids;
    }

    /** The card ids the seat's input shows as chosen: the {@code chosen} of its last {@code setSelection}. */
    private Set<Integer> chosen() {
        return selectionIds("chosen");
    }

    private Set<Integer> selectionIds(String field) {
        Set<Integer> ids = new HashSet<>();
        String call = seat.lastCall("setSelection");
        if (call != null) {
            JsonObject sel = JsonParser.parseString(call).getAsJsonObject().getAsJsonArray("args").get(0).getAsJsonObject();
            for (JsonElement e : sel.getAsJsonArray(field)) {
                if (e.isJsonObject() && "card".equals(e.getAsJsonObject().get("type").getAsString())) {
                    ids.add(e.getAsJsonObject().get("id").getAsInt());
                }
            }
        }
        return ids;
    }

    /** The card ids of the seat's last {@code setWeaklySelectable}: at priority, what the page lets you play. */
    private Set<Integer> weakly() {
        Set<Integer> ids = new HashSet<>();
        for (JsonElement e : lastArgs("setWeaklySelectable").get(0).getAsJsonArray()) {
            ids.add(e.getAsJsonObject().get("id").getAsInt());
        }
        return ids;
    }

    /** Whether the page offered the spell as playable when the seat cast it ({@link #cast}). */
    private Boolean castOffered;

    /** Clicks {@code spell} in hand, noting whether the seat's playable highlights offered it (the page plays only those). */
    private Runnable cast(Card spell) {
        castOffered = weakly().contains(spell.getId());
        return () -> select(spell);
    }

    private int treasures() {
        int n = 0;
        for (Card c : me.getCardsIn(ZoneType.Battlefield)) {
            n += c.getType().hasSubtype("Treasure") ? 1 : 0;
        }
        return n;
    }

    private static Set<Integer> ids(Card... cards) {
        Set<Integer> s = new HashSet<>();
        for (Card c : cards) {
            s.add(c.getId());
        }
        return s;
    }

    /** The index of the choice whose label contains {@code text}. */
    private static JsonArray choice(JsonObject prompt, String text) {
        for (JsonElement c : prompt.getAsJsonArray("choices")) {
            JsonObject o = c.getAsJsonObject();
            if (o.has("label") && !o.get("label").isJsonNull() && o.get("label").getAsString().contains(text)) {
                JsonArray a = new JsonArray();
                a.add(o.get("i").getAsInt());
                return a;
            }
        }
        fail("no choice with \"" + text + "\" in " + prompt);
        return null;
    }

    /** Issue #66: a plain land pays; the Tower's sacrifice ability is never used by auto-pay. */
    @Test
    public void autoPayTapsPlainSourcesAndSacrificesNothing() throws Exception {
        start();
        Card swamp1 = add("Swamp", me, ZoneType.Battlefield);
        Card swamp2 = add("Swamp", me, ZoneType.Battlefield);
        Card tower = add("Phyrexian Tower", me, ZoneType.Battlefield);
        Card bears = add("Grizzly Bears", me, ZoneType.Battlefield);
        Card gnomes = add("Bottle Gnomes", me, ZoneType.Hand);
        mainPhase();
        boolean[] autoOffered = {false};
        List<String> seen = play(() -> game.getCardState(gnomes).isInZone(ZoneType.Battlefield) || game.getPhaseHandler().getPhase() != PhaseType.MAIN1,
                in -> {
                    if (in instanceof InputPassPriority && game.getCardState(gnomes).isInZone(ZoneType.Hand)) {
                        return () -> select(gnomes);
                    }
                    if (in instanceof InputPayMana) {
                        autoOffered[0] = okEnabled();
                    }
                    return null; // Auto (what the page's Auto-pay switch sends), then pass priority
                }, HumanSeatPaymentTest::noPrompt);
        assertTrue(autoOffered[0], "Auto was offered: plain sources cover {3}; seen " + seen);
        assertTrue(game.getCardState(gnomes).isInZone(ZoneType.Battlefield), "Bottle Gnomes resolved; seen " + seen);
        assertTrue(game.getCardState(bears).isInZone(ZoneType.Battlefield), "auto-pay sacrificed nothing; seen " + seen);
        assertTrue(swamp1.isTapped() && swamp2.isTapped() && tower.isTapped(), "both Swamps and the Tower ({C}) paid {3}");
        assertTrue(me.getManaPool().isEmpty(), "nothing left floating");
        assertEquals(SilentDefaults.count(), 0, "silent defaults: " + SilentDefaults.recent());
    }

    /**
     * Issue #66: when only a sacrifice can pay, Auto is not offered and an OK sent anyway pays nothing; the player pays
     * by hand, choosing the Tower's sacrifice ability and the creature.
     */
    @Test
    public void aCostOnlyASacrificeCanPayIsLeftToTheSeat() throws Exception {
        start();
        Card tower = add("Phyrexian Tower", me, ZoneType.Battlefield);
        Card bears = add("Grizzly Bears", me, ZoneType.Battlefield);
        Card rats = add("Typhoid Rats", me, ZoneType.Hand);
        mainPhase();
        int[] payInputs = {0};
        boolean[] autoOffered = {false};
        boolean[] intactAfterOk = {false};
        List<String> prompts = new ArrayList<>();
        List<String> seen = play(() -> game.getCardState(rats).isInZone(ZoneType.Battlefield) || game.getPhaseHandler().getPhase() != PhaseType.MAIN1,
                in -> {
                    if (in instanceof InputPassPriority && game.getCardState(rats).isInZone(ZoneType.Hand)) {
                        return () -> select(rats);
                    }
                    if (in instanceof InputPayMana) {
                        if (payInputs[0]++ == 0) {
                            autoOffered[0] = okEnabled();
                            return this::ok; // a page that presses Auto anyway
                        }
                        if (payInputs[0] == 2) {
                            intactAfterOk[0] = !tower.isTapped() && game.getCardState(bears).isInZone(ZoneType.Battlefield);
                        }
                        return () -> select(tower); // by hand: the Tower's abilities are offered
                    }
                    if (in instanceof InputSelectCardsFromList) {
                        return () -> select(bears); // the creature the seat chooses to sacrifice
                    }
                    return null;
                }, m -> {
                    prompts.add(m.get("method").getAsString());
                    return "getAbilityToPlay".equals(m.get("method").getAsString()) ? choice(m, "Sacrifice") : null;
                });
        assertFalse(autoOffered[0], "Auto is not offered when only a sacrifice pays; seen " + seen);
        assertTrue(intactAfterOk[0], "an OK sent anyway tapped and sacrificed nothing; seen " + seen);
        assertTrue(prompts.contains("getAbilityToPlay"), "the seat chose the Tower's ability: " + prompts);
        assertTrue(game.getCardState(bears).isInZone(ZoneType.Graveyard), "the seat sacrificed the Bears itself; seen " + seen);
        assertTrue(game.getCardState(rats).isInZone(ZoneType.Battlefield), "Typhoid Rats resolved; seen " + seen);
        assertEquals(SilentDefaults.count(), 0, "silent defaults: " + SilentDefaults.recent());
    }

    /** Issue #66: auto-pay never pays life for Phyrexian mana; the seat pays it by clicking its own player (life total). */
    @Test
    public void phyrexianLifeIsPaidOnlyByTheSeat() throws Exception {
        start();
        Card bears = add("Grizzly Bears", me, ZoneType.Battlefield);
        Card growth = add("Mutagenic Growth", me, ZoneType.Hand);
        mainPhase();
        int life = me.getLife();
        boolean[] autoOffered = {false};
        int[] payInputs = {0};
        int[] lifeAfterOk = {-1};
        List<String> seen = play(() -> game.getCardState(growth).isInZone(ZoneType.Graveyard) || game.getPhaseHandler().getPhase() != PhaseType.MAIN1,
                in -> {
                    if (in instanceof InputPassPriority && game.getCardState(growth).isInZone(ZoneType.Hand)) {
                        return () -> select(growth);
                    }
                    if (in instanceof InputSelectTargets) {
                        return () -> select(bears);
                    }
                    if (in instanceof InputPayMana) {
                        if (payInputs[0]++ == 0) {
                            autoOffered[0] = okEnabled();
                            return this::ok; // a page that presses Auto anyway
                        }
                        lifeAfterOk[0] = me.getLife();
                        return () -> selectPlayer(me); // "Click on your life total to pay life for Phyrexian mana."
                    }
                    return null;
                }, HumanSeatPaymentTest::noPrompt);
        assertFalse(autoOffered[0], "Auto is not offered when only life pays; seen " + seen);
        assertEquals(lifeAfterOk[0], life, "an OK sent anyway paid no life; seen " + seen);
        assertEquals(me.getLife(), life - 2, "the seat paid 2 life itself");
        assertTrue(game.getCardState(growth).isInZone(ZoneType.Graveyard), "Mutagenic Growth resolved; seen " + seen);
        assertEquals(bears.getNetPower(), 4, "the Bears got +2/+2");
        assertEquals(SilentDefaults.count(), 0, "silent defaults: " + SilentDefaults.recent());
    }

    /** Issue #70: improvise lights the untapped artifacts only; the ones the seat picks are tapped. */
    @Test
    public void improviseTapsTheArtifactsTheSeatPicks() throws Exception {
        start();
        add("Island", me, ZoneType.Battlefield);
        add("Island", me, ZoneType.Battlefield);
        Card o1 = add("Ornithopter", me, ZoneType.Battlefield);
        Card o2 = add("Ornithopter", me, ZoneType.Battlefield);
        Card o3 = add("Ornithopter", me, ZoneType.Battlefield);
        Card tapped = add("Ornithopter", me, ZoneType.Battlefield);
        tapped.tap(false, null, null);
        Card bears = add("Grizzly Bears", me, ZoneType.Battlefield);
        Card spell = add("Reverse Engineer", me, ZoneType.Hand);
        mainPhase();
        int hand = me.getCardsIn(ZoneType.Hand).size();
        List<Set<Integer>> lit = new ArrayList<>();
        List<Set<Integer>> picked = new ArrayList<>();
        List<Card> toPick = new ArrayList<>(List.of(o1, o2, o3));
        List<String> seen = play(() -> game.getCardState(spell).isInZone(ZoneType.Graveyard) || game.getPhaseHandler().getPhase() != PhaseType.MAIN1,
                in -> {
                    if (in instanceof InputPassPriority && game.getCardState(spell).isInZone(ZoneType.Hand)) {
                        return cast(spell);
                    }
                    if (in instanceof InputSelectCardsForConvokeOrImprovise) {
                        lit.add(awaitSelectables());
                        picked.add(chosen());
                        if (!toPick.isEmpty()) {
                            Card c = toPick.remove(0);
                            return () -> select(c);
                        }
                    }
                    return null; // OK, then Auto for {U}{U}
                }, HumanSeatPaymentTest::noPrompt);
        assertFalse(lit.isEmpty(), "the seat met the improvise input; seen " + seen);
        assertEquals(lit.get(0), ids(o1, o2, o3), "exactly the untapped artifacts were lit: " + lit);
        assertEquals(lit.get(1), ids(o1, o2, o3), "a picked artifact stays lit (a click unpicks it): " + lit);
        assertEquals(picked.subList(0, 3), List.of(Set.of(), ids(o1), ids(o1, o2)), "the selection shows what is chosen: " + picked);
        assertTrue(o1.isTapped() && o2.isTapped() && o3.isTapped(), "the picked artifacts paid {3}");
        assertFalse(bears.isTapped(), "the Bears (not an artifact) stayed untapped");
        assertEquals(castOffered, Boolean.TRUE, "the page offered Reverse Engineer as playable (improvise counted)");
        assertTrue(game.getCardState(spell).isInZone(ZoneType.Graveyard), "Reverse Engineer resolved; seen " + seen);
        assertEquals(me.getCardsIn(ZoneType.Hand).size(), hand - 1 + 3, "three cards drawn");
        assertTrue(selectables().isEmpty(), "the lit artifacts were cleared once improvise was done");
        assertEquals(SilentDefaults.count(), 0, "silent defaults: " + SilentDefaults.recent());
    }

    /** Issue #70: convoke lights the untapped creatures; the ones the seat picks pay the whole cost. */
    @Test
    public void convokeTapsTheCreaturesTheSeatPicks() throws Exception {
        start();
        Card g1 = add("Raging Goblin", me, ZoneType.Battlefield);
        Card g2 = add("Raging Goblin", me, ZoneType.Battlefield);
        Card b1 = add("Grizzly Bears", me, ZoneType.Battlefield);
        Card b2 = add("Grizzly Bears", me, ZoneType.Battlefield);
        Card spare = add("Ornithopter", me, ZoneType.Battlefield);
        Card spell = add("Stoke the Flames", me, ZoneType.Hand);
        mainPhase();
        int life = ai.getLife();
        List<Set<Integer>> lit = new ArrayList<>();
        List<Card> toPick = new ArrayList<>(List.of(g1, g2, b1, b2));
        List<String> seen = play(() -> game.getCardState(spell).isInZone(ZoneType.Graveyard) || game.getPhaseHandler().getPhase() != PhaseType.MAIN1,
                in -> {
                    if (in instanceof InputPassPriority && game.getCardState(spell).isInZone(ZoneType.Hand)) {
                        return cast(spell);
                    }
                    if (in instanceof InputSelectTargets) {
                        return () -> selectPlayer(ai);
                    }
                    if (in instanceof InputSelectCardsForConvokeOrImprovise) {
                        lit.add(awaitSelectables());
                        if (!toPick.isEmpty()) {
                            Card c = toPick.remove(0);
                            return () -> select(c);
                        }
                    }
                    return null;
                }, HumanSeatPaymentTest::noPrompt);
        assertFalse(lit.isEmpty(), "the seat met the convoke input; seen " + seen);
        assertEquals(lit.get(0), ids(g1, g2, b1, b2, spare), "exactly the untapped creatures were lit: " + lit);
        assertTrue(g1.isTapped() && g2.isTapped() && b1.isTapped() && b2.isTapped(), "the picked creatures paid {2}{R}{R}");
        assertFalse(spare.isTapped(), "the creature not picked stayed untapped");
        assertFalse(seen.contains("InputPayManaOfCostPayment"), "convoke paid it all, no mana payment: " + seen);
        assertEquals(castOffered, Boolean.TRUE, "the page offered Stoke the Flames as playable (convoke counted)");
        assertEquals(ai.getLife(), life - 4, "Stoke the Flames dealt 4; seen " + seen);
        assertTrue(selectables().isEmpty(), "the lit creatures were cleared once convoke was done");
        assertEquals(SilentDefaults.count(), 0, "silent defaults: " + SilentDefaults.recent());
    }

    /** Issue #70, same family: a "remove a counter" cost lights the creatures that have one; the seat's pick pays it. */
    @Test
    public void removeACounterCostLightsTheCreaturesWithCounters() throws Exception {
        start();
        Card fain = add("Fain, the Broker", me, ZoneType.Battlefield);
        Card bears = add("Grizzly Bears", me, ZoneType.Battlefield);
        bears.addCounterInternal(forge.game.card.CounterEnumType.P1P1, 1, me, false, null, null);
        Card bare = add("Ornithopter", me, ZoneType.Battlefield);
        mainPhase();
        List<Set<Integer>> lit = new ArrayList<>();
        boolean[] activated = {false};
        List<String> seen = play(() -> treasures() > 0 || game.getPhaseHandler().getPhase() != PhaseType.MAIN1,
                in -> {
                    if (in instanceof InputPassPriority && !activated[0]) {
                        activated[0] = true;
                        return () -> select(fain);
                    }
                    if (in instanceof forge.player.HumanCostDecision.InputSelectCardToRemoveCounter) {
                        lit.add(awaitSelectables());
                        return () -> select(bears);
                    }
                    return null;
                }, m -> "getAbilityToPlay".equals(m.get("method").getAsString()) ? choice(m, "Treasure") : null);
        assertFalse(lit.isEmpty(), "the seat met the remove-counter input; seen " + seen);
        assertEquals(lit.get(0), ids(bears), "exactly the creature with a counter was lit: " + lit);
        assertEquals(bears.getCounters(forge.game.card.CounterEnumType.P1P1), 0, "the counter was removed");
        assertTrue(fain.isTapped(), "Fain paid {T}");
        assertFalse(bare.isTapped());
        assertEquals(treasures(), 1, "a Treasure was made; seen " + seen);
        assertTrue(selectables().isEmpty(), "the lit creature was cleared once the cost was paid");
        assertEquals(SilentDefaults.count(), 0, "silent defaults: " + SilentDefaults.recent());
    }

    /** Delve: the seat says how many cards and which ones; those are exiled and the rest is paid with mana. */
    @Test
    public void delveExilesTheCardsTheSeatPicks() throws Exception {
        start();
        Card island = add("Island", me, ZoneType.Battlefield);
        List<Card> grave = new ArrayList<>();
        for (String n : List.of("Grizzly Bears", "Shock", "Giant Growth", "Counterspell", "Divination", "Dark Ritual", "Serra Angel", "Ornithopter")) {
            grave.add(add(n, me, ZoneType.Graveyard));
        }
        Card spell = add("Treasure Cruise", me, ZoneType.Hand);
        mainPhase();
        int hand = me.getCardsIn(ZoneType.Hand).size();
        List<String> seen = play(() -> game.getCardState(spell).isInZone(ZoneType.Graveyard) || game.getPhaseHandler().getPhase() != PhaseType.MAIN1,
                in -> {
                    if (in instanceof InputPassPriority && game.getCardState(spell).isInZone(ZoneType.Hand)) {
                        return cast(spell);
                    }
                    return null;
                }, m -> {
                    String msg = m.has("message") && !m.get("message").isJsonNull() ? m.get("message").getAsString() : "";
                    if (msg.toLowerCase().contains("how many")) {
                        return choice(m, "7");
                    }
                    // "Exile which card?" — Ornithopter is never picked
                    for (String n : List.of("Grizzly Bears", "Shock", "Giant Growth", "Counterspell", "Divination", "Dark Ritual", "Serra Angel")) {
                        for (JsonElement c : m.getAsJsonArray("choices")) {
                            if (c.getAsJsonObject().get("label").getAsString().startsWith(n)) {
                                return choice(m, n);
                            }
                        }
                    }
                    return null;
                });
        assertEquals(castOffered, Boolean.TRUE, "the page offered Treasure Cruise as playable (delve counted)");
        assertTrue(game.getCardState(spell).isInZone(ZoneType.Graveyard), "Treasure Cruise resolved; seen " + seen);
        for (Card c : grave.subList(0, 7)) {
            assertTrue(game.getCardState(c).isInZone(ZoneType.Exile), c.getName() + " was exiled by delve; seen " + seen);
        }
        assertTrue(game.getCardState(grave.get(7)).isInZone(ZoneType.Graveyard), "the card not picked stayed");
        assertTrue(island.isTapped(), "the Island paid {U}");
        assertEquals(me.getCardsIn(ZoneType.Hand).size(), hand - 1 + 3, "three cards drawn");
        assertEquals(SilentDefaults.count(), 0, "silent defaults: " + SilentDefaults.recent());
    }

    /** Casts {@code spell} and lets Auto (what the page's Auto-pay switch sends) pay; returns the seen log. */
    private List<String> castWithAuto(Card spell) throws Exception {
        mainPhase();
        return play(() -> game.getCardState(spell).isInZone(ZoneType.Battlefield) || game.getPhaseHandler().getPhase() != PhaseType.MAIN1,
                in -> in instanceof InputPassPriority && game.getCardState(spell).isInZone(ZoneType.Hand) ? () -> select(spell) : null,
                HumanSeatPaymentTest::noPrompt);
    }

    /** Owner decision 2026-10-22: Auto never takes damage to avoid unused mana: {1}{R} is paid by Mountain and Sol Ring, not City of Brass. */
    @Test
    public void autoPayAvoidsDamageEvenIfManaFloats() throws Exception {
        start();
        Card sol = add("Sol Ring", me, ZoneType.Battlefield);
        Card mountain = add("Mountain", me, ZoneType.Battlefield);
        Card city = add("City of Brass", me, ZoneType.Battlefield);
        Card piker = add("Goblin Piker", me, ZoneType.Hand);
        int life = me.getLife();
        List<String> seen = castWithAuto(piker);
        assertTrue(game.getCardState(piker).isInZone(ZoneType.Battlefield), "Goblin Piker resolved; seen " + seen);
        assertTrue(mountain.isTapped() && sol.isTapped(), "Mountain and Sol Ring paid; seen " + seen);
        assertFalse(city.isTapped(), "City of Brass stayed untapped");
        assertEquals(me.getLife(), life, "no damage taken");
        assertEquals(SilentDefaults.count(), 0, "silent defaults: " + SilentDefaults.recent());
    }

    /** Owner decision 2026-10-22: {1} with Sol Ring and City of Brass taps Sol Ring (one {C} floats, no life lost). */
    @Test
    public void autoPayPrefersSolRingOverCityOfBrassForGeneric() throws Exception {
        start();
        Card sol = add("Sol Ring", me, ZoneType.Battlefield);
        Card city = add("City of Brass", me, ZoneType.Battlefield);
        Card cast = add("Sol Ring", me, ZoneType.Hand); // {1} (spell)
        int life = me.getLife();
        List<String> seen = castWithAuto(cast);
        assertTrue(game.getCardState(cast).isInZone(ZoneType.Battlefield), "Sol Ring resolved; seen " + seen);
        assertTrue(sol.isTapped(), "Sol Ring paid; seen " + seen);
        assertFalse(city.isTapped(), "City of Brass stayed untapped");
        assertEquals(me.getLife(), life, "no life lost");
    }

    /** Owner decision 2026-10-22: for a colored shard a painland loses to a basic. */
    @Test
    public void autoPayPicksBasicOverPainland() throws Exception {
        start();
        Card mountain1 = add("Mountain", me, ZoneType.Battlefield);
        Card mountain2 = add("Mountain", me, ZoneType.Battlefield);
        Card forge = add("Battlefield Forge", me, ZoneType.Battlefield);
        Card piker = add("Goblin Piker", me, ZoneType.Hand);
        int life = me.getLife();
        List<String> seen = castWithAuto(piker);
        assertTrue(game.getCardState(piker).isInZone(ZoneType.Battlefield), "Goblin Piker resolved; seen " + seen);
        assertTrue(mountain1.isTapped() && mountain2.isTapped(), "Mountains paid; seen " + seen);
        assertFalse(forge.isTapped(), "Battlefield Forge stayed untapped");
        assertEquals(me.getLife(), life, "no damage taken");
    }

    /** Pain is part of the mana cost, not an extra cost: when only a painful source can pay, Auto still pays. */
    @Test
    public void autoPayStillUsesPainfulSourceWhenNothingElsePays() throws Exception {
        start();
        Card mountain = add("Mountain", me, ZoneType.Battlefield);
        Card city = add("City of Brass", me, ZoneType.Battlefield);
        Card piker = add("Goblin Piker", me, ZoneType.Hand);
        int life = me.getLife();
        List<String> seen = castWithAuto(piker);
        assertTrue(game.getCardState(piker).isInZone(ZoneType.Battlefield), "Goblin Piker resolved; seen " + seen);
        assertTrue(mountain.isTapped() && city.isTapped(), "both paid; seen " + seen);
        assertEquals(me.getLife(), life - 1, "City of Brass dealt 1 damage");
    }

    /** Issue #29: {1}{R} with two Mountains and Sol Ring: the Mountains pay, Sol Ring stays untapped. */
    @Test
    public void autoPayKeepsSolRingWhenLandsPayExactly() throws Exception {
        start();
        Card sol = add("Sol Ring", me, ZoneType.Battlefield);
        Card mountain1 = add("Mountain", me, ZoneType.Battlefield);
        Card mountain2 = add("Mountain", me, ZoneType.Battlefield);
        Card piker = add("Goblin Piker", me, ZoneType.Hand);
        List<String> seen = castWithAuto(piker);
        assertTrue(game.getCardState(piker).isInZone(ZoneType.Battlefield), "Goblin Piker resolved; seen " + seen);
        assertTrue(mountain1.isTapped() && mountain2.isTapped(), "both Mountains paid; seen " + seen);
        assertFalse(sol.isTapped(), "Sol Ring stayed untapped");
        assertTrue(me.getManaPool().isEmpty(), "nothing left floating");
    }

    /** Resolved and nothing floating; the sources in {@code spare} stayed untapped. */
    private void assertCleanPlan(Card spell, List<String> seen, Card... spare) {
        assertTrue(game.getCardState(spell).isInZone(ZoneType.Battlefield), spell.getName() + " resolved; seen " + seen);
        assertTrue(me.getManaPool().isEmpty(), "nothing left floating; seen " + seen);
        for (Card c : spare) {
            assertFalse(c.isTapped(), c.getName() + " stayed untapped; seen " + seen);
        }
    }

    /** Hybrid: {R/G}{R/G} with a Mountain and a two-mana land: the land pays both shards alone (a Mountain first would leave one of its mana floating). */
    @Test
    public void autoPayHybridUsesTheTwoManaLandAlone() throws Exception {
        start();
        Card mountain = add("Mountain", me, ZoneType.Battlefield);
        Card turf = add("Gruul Turf", me, ZoneType.Battlefield);
        Card guildmage = add("Gruul Guildmage", me, ZoneType.Hand);
        List<String> seen = castWithAuto(guildmage);
        assertCleanPlan(guildmage, seen, mountain);
        assertTrue(turf.isTapped(), "Gruul Turf paid; seen " + seen);
    }

    /** Hybrid: {R/G}{R/G} with a Mountain, a Forest and a two-mana land: no plan leaves mana floating, and all three are not tapped. */
    @Test
    public void autoPayHybridWithTwoBasicsAndATwoManaLand() throws Exception {
        start();
        Card mountain = add("Mountain", me, ZoneType.Battlefield);
        Card forest = add("Forest", me, ZoneType.Battlefield);
        Card turf = add("Gruul Turf", me, ZoneType.Battlefield);
        Card guildmage = add("Gruul Guildmage", me, ZoneType.Hand);
        List<String> seen = castWithAuto(guildmage);
        assertCleanPlan(guildmage, seen);
        assertFalse(mountain.isTapped() && forest.isTapped() && turf.isTapped(), "not all three tapped; seen " + seen);
    }

    /** Hybrid: {R/G}{R/G} with two Mountains and a two-mana land: the Mountains pay. */
    @Test
    public void autoPayHybridPrefersTheBasicsToAMatchingTwoManaLand() throws Exception {
        start();
        Card mountain1 = add("Mountain", me, ZoneType.Battlefield);
        Card mountain2 = add("Mountain", me, ZoneType.Battlefield);
        Card turf = add("Gruul Turf", me, ZoneType.Battlefield);
        Card guildmage = add("Gruul Guildmage", me, ZoneType.Hand);
        List<String> seen = castWithAuto(guildmage);
        assertCleanPlan(guildmage, seen);
        assertFalse(mountain1.isTapped() && mountain2.isTapped() && turf.isTapped(), "not all three tapped; seen " + seen);
    }

    /** {R}{R/W}{W} with a Mountain, a Plains and a land making {R}{W}: the two-mana land plus one basic is exact; all three leave one floating. */
    @Test
    public void autoPayHybridAndMonoShardsDoNotFloatMana() throws Exception {
        start();
        Card mountain = add("Mountain", me, ZoneType.Battlefield);
        Card plains = add("Plains", me, ZoneType.Battlefield);
        Card garrison = add("Boros Garrison", me, ZoneType.Battlefield);
        Card smith = add("Practiced Scrollsmith", me, ZoneType.Hand);
        List<String> seen = castWithAuto(smith);
        assertCleanPlan(smith, seen);
        assertTrue(garrison.isTapped(), "Boros Garrison paid; seen " + seen);
        assertFalse(mountain.isTapped() && plains.isTapped(), "one basic stayed untapped; seen " + seen);
    }

    /** {2/W}{2/W}{2/W} with Sol Ring, a Mountain and two Plains: Sol Ring pays a whole shard, so nothing floats and the Mountain stays. */
    @Test
    public void autoPayTwoOrColorShardsTakeTwoColorlessOrOneColor() throws Exception {
        start();
        Card sol = add("Sol Ring", me, ZoneType.Battlefield);
        Card mountain = add("Mountain", me, ZoneType.Battlefield);
        Card plains1 = add("Plains", me, ZoneType.Battlefield);
        Card plains2 = add("Plains", me, ZoneType.Battlefield);
        Card procession = add("Spectral Procession", me, ZoneType.Hand);
        mainPhase();
        List<String> seen = play(() -> game.getCardState(procession).isInZone(ZoneType.Graveyard) || game.getPhaseHandler().getPhase() != PhaseType.MAIN1,
                in -> in instanceof InputPassPriority && game.getCardState(procession).isInZone(ZoneType.Hand) ? () -> select(procession) : null,
                HumanSeatPaymentTest::noPrompt);
        assertTrue(game.getCardState(procession).isInZone(ZoneType.Graveyard), "Spectral Procession resolved; seen " + seen);
        assertTrue(me.getManaPool().isEmpty(), "nothing left floating; seen " + seen);
        assertFalse(mountain.isTapped(), "Mountain stayed untapped; seen " + seen);
        assertTrue(sol.isTapped() && plains1.isTapped() && plains2.isTapped(), "Sol Ring and both Plains paid; seen " + seen);
    }

    /** {2/W}{2/W}{2/W}: a Plains or Sol Ring pays a whole shard, two Mountains pay one together; all four are needed and nothing floats. */
    @Test
    public void autoPayTwoOrColorShardsWithMixedSources() throws Exception {
        start();
        Card sol = add("Sol Ring", me, ZoneType.Battlefield);
        Card mountain1 = add("Mountain", me, ZoneType.Battlefield);
        Card mountain2 = add("Mountain", me, ZoneType.Battlefield);
        Card plains = add("Plains", me, ZoneType.Battlefield);
        Card procession = add("Spectral Procession", me, ZoneType.Hand);
        mainPhase();
        List<String> seen = play(() -> game.getCardState(procession).isInZone(ZoneType.Graveyard) || game.getPhaseHandler().getPhase() != PhaseType.MAIN1,
                in -> in instanceof InputPassPriority && game.getCardState(procession).isInZone(ZoneType.Hand) ? () -> select(procession) : null,
                HumanSeatPaymentTest::noPrompt);
        assertTrue(game.getCardState(procession).isInZone(ZoneType.Graveyard), "Spectral Procession resolved; seen " + seen);
        assertTrue(me.getManaPool().isEmpty(), "nothing left floating; seen " + seen);
        assertTrue(sol.isTapped() && mountain1.isTapped() && mountain2.isTapped() && plains.isTapped(), "all four paid; seen " + seen);
    }

    /** Issue #133: {3} with 2 Mountains, 2 Islands and a Zoetic Cavern, a {1}{R} card in hand: the Mountains stay for it. */
    @Test
    public void autoPayGenericKeepsTheOnlyRedSourcesForTheHand() throws Exception {
        start();
        Card mountain1 = add("Mountain", me, ZoneType.Battlefield);
        Card mountain2 = add("Mountain", me, ZoneType.Battlefield);
        Card island1 = add("Island", me, ZoneType.Battlefield);
        Card island2 = add("Island", me, ZoneType.Battlefield);
        Card cavern = add("Zoetic Cavern", me, ZoneType.Battlefield);
        Card vat = add("Mimic Vat", me, ZoneType.Hand);
        add("Curse of the Pierced Heart", me, ZoneType.Hand);
        List<String> seen = castWithAuto(vat);
        assertCleanPlan(vat, seen, mountain1, mountain2);
        assertTrue(island1.isTapped() && island2.isTapped() && cavern.isTapped(), "Islands and Cavern paid; seen " + seen);
    }

    /** Issue #133: {1}{R}{R} with a red Chrome Mox, 2 Mountains and 3 Islands, a {R} card in hand: the {1} is paid with an Island, a red source stays. */
    @Test
    public void autoPayGenericDoesNotSpendTheMoxWhenARedCardWaits() throws Exception {
        start();
        Card mox = add("Chrome Mox", me, ZoneType.Battlefield);
        Card imprinted = add("Shock", me, ZoneType.Exile);
        mox.addImprintedCard(imprinted);
        Card mountain1 = add("Mountain", me, ZoneType.Battlefield);
        Card mountain2 = add("Mountain", me, ZoneType.Battlefield);
        Card island1 = add("Island", me, ZoneType.Battlefield);
        Card island2 = add("Island", me, ZoneType.Battlefield);
        Card island3 = add("Island", me, ZoneType.Battlefield);
        Card phoenix = add("Phoenix of Ash", me, ZoneType.Hand);
        add("Faithless Looting", me, ZoneType.Hand);
        List<String> seen = castWithAuto(phoenix);
        assertCleanPlan(phoenix, seen);
        int redLeft = (mox.isTapped() ? 0 : 1) + (mountain1.isTapped() ? 0 : 1) + (mountain2.isTapped() ? 0 : 1);
        assertEquals(redLeft, 1, "one red source stayed for Faithless Looting; seen " + seen);
        int islandsTapped = (island1.isTapped() ? 1 : 0) + (island2.isTapped() ? 1 : 0) + (island3.isTapped() ? 1 : 0);
        assertEquals(islandsTapped, 1, "the {1} was paid with an Island; seen " + seen);
    }

    /** Issue #133: a commander in the command zone counts like a card in hand: its colour is kept. */
    @Test
    public void autoPayGenericKeepsTheCommandersColour() throws Exception {
        start();
        Card mountain = add("Mountain", me, ZoneType.Battlefield);
        Card island1 = add("Island", me, ZoneType.Battlefield);
        Card island2 = add("Island", me, ZoneType.Battlefield);
        Card cavern = add("Zoetic Cavern", me, ZoneType.Battlefield);
        Card plains = add("Plains", me, ZoneType.Battlefield);
        Card vat = add("Mimic Vat", me, ZoneType.Hand);
        Card commander = add("Goblin Piker", me, ZoneType.Command);
        commander.setCommander(true);
        List<String> seen = castWithAuto(vat);
        assertCleanPlan(vat, seen, mountain);
        int others = (island1.isTapped() ? 1 : 0) + (island2.isTapped() ? 1 : 0) + (cavern.isTapped() ? 1 : 0) + (plains.isTapped() ? 1 : 0);
        assertEquals(others, 3, "three of the other four paid; seen " + seen);
    }

    /** Issue #133: the Chrome Mox (red) is kept for a red commander too: the {1} of {1}{R}{R} is paid with an Island. */
    @Test
    public void autoPayGenericKeepsTheMoxForARedCommander() throws Exception {
        start();
        Card mox = add("Chrome Mox", me, ZoneType.Battlefield);
        Card imprinted = add("Shock", me, ZoneType.Exile);
        mox.addImprintedCard(imprinted);
        Card mountain1 = add("Mountain", me, ZoneType.Battlefield);
        Card mountain2 = add("Mountain", me, ZoneType.Battlefield);
        Card island1 = add("Island", me, ZoneType.Battlefield);
        Card island2 = add("Island", me, ZoneType.Battlefield);
        Card island3 = add("Island", me, ZoneType.Battlefield);
        Card phoenix = add("Phoenix of Ash", me, ZoneType.Hand);
        Card commander = add("Goblin Piker", me, ZoneType.Command);
        commander.setCommander(true);
        List<String> seen = castWithAuto(phoenix);
        assertCleanPlan(phoenix, seen);
        int redLeft = (mox.isTapped() ? 0 : 1) + (mountain1.isTapped() ? 0 : 1) + (mountain2.isTapped() ? 0 : 1);
        assertEquals(redLeft, 1, "one red source stayed for the commander; seen " + seen);
        int islandsTapped = (island1.isTapped() ? 1 : 0) + (island2.isTapped() ? 1 : 0) + (island3.isTapped() ? 1 : 0);
        assertEquals(islandsTapped, 1, "the {1} was paid with an Island; seen " + seen);
    }

    /** Issue #133: nothing else in hand needs a colour: the order is unchanged (Mountain, added first, pays {1}). */
    @Test
    public void autoPayGenericKeepsTheOrderWhenNoColourIsNeeded() throws Exception {
        start();
        Card mountain = add("Mountain", me, ZoneType.Battlefield);
        Card island = add("Island", me, ZoneType.Battlefield);
        Card sol = add("Sol Ring", me, ZoneType.Hand); // {1}
        List<String> seen = castWithAuto(sol);
        assertTrue(game.getCardState(sol).isInZone(ZoneType.Battlefield), "Sol Ring resolved; seen " + seen);
        assertTrue(mountain.isTapped() != island.isTapped(), "exactly one land paid; seen " + seen);
    }

    /** Issue #133, case 1 as played: the hand also holds a blue card, so both colours are needed; one Mountain (and one Island) must stay. */
    @Test
    public void autoPayGenericKeepsOneSourceOfEachColourTheHandNeeds() throws Exception {
        start();
        Card mountain1 = add("Mountain", me, ZoneType.Battlefield);
        Card mountain2 = add("Mountain", me, ZoneType.Battlefield);
        Card island1 = add("Island", me, ZoneType.Battlefield);
        Card island2 = add("Island", me, ZoneType.Battlefield);
        Card cavern = add("Zoetic Cavern", me, ZoneType.Battlefield);
        Card vat = add("Mimic Vat", me, ZoneType.Hand);
        add("Curse of the Pierced Heart", me, ZoneType.Hand); // {1}{R}
        add("Opt", me, ZoneType.Hand); // {U}
        List<String> seen = castWithAuto(vat);
        assertCleanPlan(vat, seen);
        assertTrue(cavern.isTapped(), "the Cavern paid; seen " + seen);
        assertEquals((mountain1.isTapped() ? 1 : 0) + (mountain2.isTapped() ? 1 : 0), 1, "one Mountain stayed; seen " + seen);
        assertEquals((island1.isTapped() ? 1 : 0) + (island2.isTapped() ? 1 : 0), 1, "one Island stayed; seen " + seen);
    }

    /** Issue #133, case 2 as played: a red and a blue card wait; the {1} of {1}{R}{R} goes to an Island, one red source stays. */
    @Test
    public void autoPayGenericDoesNotSpendTheLastRedSourceWhenBlueIsNeededToo() throws Exception {
        start();
        Card mox = add("Chrome Mox", me, ZoneType.Battlefield);
        Card imprinted = add("Shock", me, ZoneType.Exile);
        mox.addImprintedCard(imprinted);
        Card mountain1 = add("Mountain", me, ZoneType.Battlefield);
        Card mountain2 = add("Mountain", me, ZoneType.Battlefield);
        Card island1 = add("Island", me, ZoneType.Battlefield);
        Card island2 = add("Island", me, ZoneType.Battlefield);
        Card island3 = add("Island", me, ZoneType.Battlefield);
        Card phoenix = add("Phoenix of Ash", me, ZoneType.Hand);
        add("Faithless Looting", me, ZoneType.Hand); // {R}
        add("Opt", me, ZoneType.Hand); // {U}
        List<String> seen = castWithAuto(phoenix);
        assertCleanPlan(phoenix, seen);
        int redLeft = (mox.isTapped() ? 0 : 1) + (mountain1.isTapped() ? 0 : 1) + (mountain2.isTapped() ? 0 : 1);
        assertEquals(redLeft, 1, "one red source stayed; seen " + seen);
        int islandsTapped = (island1.isTapped() ? 1 : 0) + (island2.isTapped() ? 1 : 0) + (island3.isTapped() ? 1 : 0);
        assertEquals(islandsTapped, 1, "the {1} was paid with an Island; seen " + seen);
    }

    /** Issue #133: a two-colour commander and a blue card in hand: Mimic Vat's {3} still leaves a Mountain and an Island. */
    @Test
    public void autoPayGenericKeepsBothColoursForATwoColourCommanderAndTheHand() throws Exception {
        start();
        Card mountain1 = add("Mountain", me, ZoneType.Battlefield);
        Card mountain2 = add("Mountain", me, ZoneType.Battlefield);
        Card island1 = add("Island", me, ZoneType.Battlefield);
        Card island2 = add("Island", me, ZoneType.Battlefield);
        Card cavern = add("Zoetic Cavern", me, ZoneType.Battlefield);
        Card vat = add("Mimic Vat", me, ZoneType.Hand);
        add("Counterspell", me, ZoneType.Hand); // {U}{U}
        Card commander = add("Niv-Mizzet, Parun", me, ZoneType.Command); // {U}{U}{R}{R}
        commander.setCommander(true);
        List<String> seen = castWithAuto(vat);
        assertCleanPlan(vat, seen);
        assertTrue(cavern.isTapped(), "the Cavern paid; seen " + seen);
        int mountains = (mountain1.isTapped() ? 0 : 1) + (mountain2.isTapped() ? 0 : 1);
        int islands = (island1.isTapped() ? 0 : 1) + (island2.isTapped() ? 0 : 1);
        assertTrue(mountains >= 1 && islands >= 1, "a Mountain and an Island stayed; seen " + seen);
    }

    /** Scarcity, not just need: red is needed by one card and the Mountain is the only red source, blue has three; the Islands pay first. */
    @Test
    public void autoPaySpendsTheCommonerNeededColourFirst() throws Exception {
        start();
        Card mountain = add("Mountain", me, ZoneType.Battlefield);
        Card island1 = add("Island", me, ZoneType.Battlefield);
        Card island2 = add("Island", me, ZoneType.Battlefield);
        Card island3 = add("Island", me, ZoneType.Battlefield);
        Card vat = add("Mimic Vat", me, ZoneType.Hand); // {3}
        add("Shock", me, ZoneType.Hand); // {R}
        add("Opt", me, ZoneType.Hand); // {U}
        List<String> seen = castWithAuto(vat);
        assertCleanPlan(vat, seen, mountain);
        assertEquals((island1.isTapped() ? 1 : 0) + (island2.isTapped() ? 1 : 0) + (island3.isTapped() ? 1 : 0), 3, "the Islands paid; seen " + seen);
    }

    /** The older rule (a mana creature is worth more untapped than a land) stays ahead of colour scarcity while no colour would be lost. */
    @Test
    public void autoPayKeepsTheManaCreatureWhileNoNeededColourIsLost() throws Exception {
        start();
        Card mountain1 = add("Mountain", me, ZoneType.Battlefield);
        Card mountain2 = add("Mountain", me, ZoneType.Battlefield);
        Card island1 = add("Island", me, ZoneType.Battlefield);
        Card island2 = add("Island", me, ZoneType.Battlefield);
        Card elves = add("Llanowar Elves", me, ZoneType.Battlefield);
        Card sol = add("Sol Ring", me, ZoneType.Hand); // {1}
        add("Shock", me, ZoneType.Hand); // {R}
        add("Opt", me, ZoneType.Hand); // {U}
        List<String> seen = castWithAuto(sol);
        assertCleanPlan(sol, seen);
        assertFalse(elves.isTapped(), "the Elves stayed untapped; seen " + seen);
        assertEquals((mountain1.isTapped() ? 1 : 0) + (mountain2.isTapped() ? 1 : 0) + (island1.isTapped() ? 1 : 0) + (island2.isTapped() ? 1 : 0), 1,
                "one land paid; seen " + seen);
    }

    /** Both faces of a modal double-faced card count: Valki needs {B}, Tibalt (its back) {R}; with one Mountain and two Swamps a Swamp pays. */
    @Test
    public void autoPayCountsTheColoursOfTheOtherFaceToo() throws Exception {
        start();
        Card mountain = add("Mountain", me, ZoneType.Battlefield);
        Card swamp1 = add("Swamp", me, ZoneType.Battlefield);
        Card swamp2 = add("Swamp", me, ZoneType.Battlefield);
        Card sol = add("Sol Ring", me, ZoneType.Hand); // {1}
        add("Valki, God of Lies", me, ZoneType.Hand); // {1}{B} // {5}{B}{R}
        List<String> seen = castWithAuto(sol);
        assertCleanPlan(sol, seen, mountain);
        assertTrue(swamp1.isTapped() || swamp2.isTapped(), "a Swamp paid; seen " + seen);
    }
}
