package forge.fork.web.seat;

import static org.testng.Assert.assertEquals;
import static org.testng.Assert.assertNotNull;
import static org.testng.Assert.assertTrue;
import static org.testng.Assert.fail;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
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

import com.google.common.eventbus.Subscribe;
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
import forge.game.event.GameEventCardTapped;
import forge.game.phase.PhaseHandler;
import forge.game.phase.PhaseType;
import forge.game.player.Player;
import forge.game.player.RegisteredPlayer;
import forge.game.zone.ZoneType;
import forge.gamemodes.match.input.Input;
import forge.gamemodes.match.input.InputAttack;
import forge.gamemodes.match.input.InputConfirm;
import forge.gamemodes.match.input.InputPassPriority;
import forge.gamemodes.match.input.InputPayMana;
import forge.gui.control.GameEventForwarder;
import forge.player.LobbyPlayerHuman;
import forge.player.PlayerControllerHuman;
import forge.trackable.TrackableCollection;
import forge.fork.web.bridge.ClientSink;
import forge.fork.web.bridge.GameStream;
import forge.fork.web.bridge.GameStream.HiddenPolicy;
import forge.fork.web.bridge.visibility.TestEngine;

/**
 * Issue #46: triggered abilities controlled by the web human seat. A real game (seat 0 = {@code PlayerControllerHuman}
 * on a {@link WebGuiGame}, two AI opponents) runs the engine's own loop on a game thread; a scripted client plays the
 * seat only through its WebSocket messages (actions and prompt replies). Each test asserts the trigger reached the
 * stack, the seat saw it there, and its effect happened.
 */
public class HumanSeatTriggersTest {

    private ExecutorService gameThread;
    private Game game;
    private Player me;
    private Player opp1;
    private Player opp2;
    private PlayerControllerHuman pch;
    private GameStream stream;
    private Seat seat;
    private TriggerAudit audit;

    /** The seat's browser: records every frame; the test thread reads them. */
    static final class Seat implements ClientSink {
        final LinkedBlockingQueue<JsonObject> inbox = new LinkedBlockingQueue<>();
        final List<String> frames = new ArrayList<>();

        @Override
        public synchronized void send(String json) {
            frames.add(json);
            inbox.add(JsonParser.parseString(json).getAsJsonObject());
        }

        /** How many calls {@code method} the seat received. */
        synchronized int count(String method) {
            int n = 0;
            for (String f : frames) {
                if (f.contains("\"method\":\"" + method + "\"")) {
                    n++;
                }
            }
            return n;
        }

        /** The last call {@code method} the seat received, as text. */
        synchronized String lastCall(String method) {
            for (int i = frames.size() - 1; i >= 0; i--) {
                if (frames.get(i).contains("\"method\":\"" + method + "\"")) {
                    return frames.get(i);
                }
            }
            return null;
        }

        synchronized String all() {
            return String.join("\n", frames);
        }

        /** Every stack item object the seat received (snapshot, new or changed), as text. */
        synchronized List<String> stackItems() {
            List<String> l = new ArrayList<>();
            for (String f : frames) {
                JsonObject m = JsonParser.parseString(f).getAsJsonObject();
                for (String k : new String[] {"objects", "new", "changed"}) {
                    if (m.has(k) && m.get(k).isJsonArray()) {
                        for (JsonElement o : m.getAsJsonArray(k)) {
                            if ("stackItem".equals(o.getAsJsonObject().get("type").getAsString())) {
                                l.add(o.toString());
                            }
                        }
                    }
                }
            }
            return l;
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

    /** No question to the seat may be answered for it: strict mode throws on the game thread, and the count must stay 0. */
    private void assertNoSilentDefault() {
        assertEquals(SilentDefaults.count(), 0, "silent defaults: " + SilentDefaults.recent());
    }

    /** As {@code HostedMatch.startGame} wires a {@code ProtocolGuiGame} human, then seat 0's client connects. */
    private void start() {
        start(new LobbyPlayerHuman("You"));
    }

    /** As {@link #start()}, the seat's player being {@code human} (e.g. a {@link TriggerAudit.Human}). */
    private void start(LobbyPlayerHuman human) {
        SilentDefaults.reset();
        SilentDefaults.setStrict(true);
        gameThread = Executors.newSingleThreadExecutor(r -> new Thread(r, "Game-46"));
        List<RegisteredPlayer> rps = new ArrayList<>();
        rps.add(new RegisteredPlayer(new Deck()).setPlayer(human));
        rps.add(new RegisteredPlayer(new Deck()).setPlayer(new LobbyPlayerAi("ai1", null)));
        rps.add(new RegisteredPlayer(new Deck()).setPlayer(new LobbyPlayerAi("ai2", null)));
        GameRules rules = new GameRules(GameType.Constructed);
        game = new Game(rps, rules, new Match(rules, rps, "Test"));
        game.setAge(GameStage.Play);
        me = game.getPlayers().get(0);
        opp1 = game.getPlayers().get(1);
        opp2 = game.getPlayers().get(2);
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
        // libraries, so nobody loses to an empty draw
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

    // --- driving the seat through its messages ---

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
     * Runs the engine's main loop on the game thread until {@code done}, playing the seat: {@code onInput} acts on each
     * new input of the seat (null = press OK: pass priority, confirm, auto-pay), {@code onPrompt} answers each prompt.
     * Returns the inputs and prompts seen, for failure messages.
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
        long actedAt = 0;
        long end = System.currentTimeMillis() + 30_000;
        while (!loop.isDone()) {
            if (System.currentTimeMillis() > end) {
                fail("game loop stuck; seen " + seen + "; input " + pch.getInputQueue().getInput() + "; last message " + seat.lastCall("showPromptMessage"));
            }
            JsonObject m = seat.inbox.poll(10, TimeUnit.MILLISECONDS);
            if (m != null && "prompt".equals(m.get("t").getAsString())) {
                seen.add("prompt " + m.get("method").getAsString() + " " + m.get("message"));
                JsonElement v = onPrompt == null ? null : onPrompt.apply(m);
                if (v == null) {
                    fail("unexpected prompt " + m + "; seen " + seen);
                }
                JsonObject r = new JsonObject();
                r.addProperty("t", "reply");
                r.add("id", m.get("id"));
                r.add("value", v);
                stream.clientMessage(0, r, seat);
            }
            Input in = pch.getInputQueue().getInput();
            // act once the seat's actions reach this input (InputProxy), as a click would
            if (in == null || pch.getInputProxy().getInput() != in) {
                continue;
            }
            if (in != acted) {
                seen.add(in.getClass().getSimpleName());
                acted = in;
            } else if (System.currentTimeMillis() - actedAt < 1000) {
                continue; // acted on this input: wait for the game to move on
            }
            // a new input, or one still open after the last action (e.g. attackers selected, OK next)
            actedAt = System.currentTimeMillis();
            Runnable r = onInput == null ? null : onInput.apply(in);
            (r == null ? (Runnable) this::ok : r).run();
        }
        loop.get(1, TimeUnit.SECONDS);
        return seen;
    }

    private String stackText(String name) {
        for (String s : seat.stackItems()) {
            if (s.contains(name)) {
                return s;
            }
        }
        return null;
    }

    // --- threads (issue #53) ---

    /**
     * The seat pays a spell by tapping its lands one at a time. Each mana ability runs on the game thread that waits for
     * the payment input: before, each ran on a second game thread while the EDT refreshed the input, and the two
     * threads met in the game state (ConcurrentModificationException, about 1 game in 36 in the sweep).
     */
    @Test
    public void theSeatsManaAbilitiesRunOnTheGameThreadItsPaymentWaitsOn() throws Exception {
        start();
        List<Card> plains = new ArrayList<>();
        for (int i = 0; i < 3; i++) {
            plains.add(add("Plains", me, ZoneType.Battlefield));
        }
        Card anthem = add("Glorious Anthem", me, ZoneType.Hand);
        Thread loopThread = gameThread.submit(Thread::currentThread).get(5, TimeUnit.SECONDS);
        List<String> tappedOn = new CopyOnWriteArrayList<>();
        game.subscribeToEvents(new Object() {
            @Subscribe
            public void tapped(GameEventCardTapped e) {
                if (e.tapped()) {
                    Thread t = Thread.currentThread();
                    tappedOn.add(t == loopThread ? "game loop" : t.getName());
                }
            }
        });
        game.getPhaseHandler().devModeSet(PhaseType.MAIN1, me);
        game.getPhaseHandler().onStackResolved();
        boolean[] cast = {false};
        List<String> seen = play(() -> anthem.getZone() != null && anthem.getZone().is(ZoneType.Battlefield)
                        || game.getPhaseHandler().getPhase() != PhaseType.MAIN1,
                in -> {
                    if (in instanceof InputPassPriority && !cast[0]) {
                        cast[0] = true;
                        return () -> select(anthem);
                    }
                    if (in instanceof InputPayMana) {
                        for (Card c : plains) {
                            if (!c.isTapped()) {
                                return () -> select(c);
                            }
                        }
                    }
                    return null;
                }, null);
        assertTrue(game.getCardState(anthem).isInZone(ZoneType.Battlefield), "the seat cast it; seen " + seen);
        assertEquals(tappedOn, List.of("game loop", "game loop", "game loop"), "each land tapped by the seat; seen " + seen);
        assertNoSilentDefault();
    }

    // --- the playtest's cards ---

    @Test
    public void grayMerchantCastByTheSeatDrainsEachOpponent() throws Exception {
        start();
        for (int i = 0; i < 5; i++) {
            add("Swamp", me, ZoneType.Battlefield);
        }
        Card merchant = add("Gray Merchant of Asphodel", me, ZoneType.Hand);
        game.getPhaseHandler().devModeSet(PhaseType.MAIN1, me);
        game.getPhaseHandler().onStackResolved();
        boolean[] cast = {false};
        List<String> seen = play(() -> cast[0] && game.getStack().isEmpty() && me.getLife() != 20 || game.getPhaseHandler().getPhase() != PhaseType.MAIN1,
                in -> {
                    if (in instanceof InputPassPriority && !cast[0] && game.getStack().isEmpty()) {
                        cast[0] = true;
                        return () -> select(merchant);
                    }
                    return null;
                }, null);
        // devotion to black 2 (its own {B}{B}): each opponent loses 2, the seat gains 4
        assertEquals(opp1.getLife(), 18, "seen " + seen);
        assertEquals(opp2.getLife(), 18);
        assertEquals(me.getLife(), 24);
        assertNotNull(stackText("Gray Merchant"), "the seat saw the trigger on the stack: " + seat.stackItems());
        assertNoSilentDefault();
    }

    @Test
    public void phyrexianArenaTriggersInTheSeatsUpkeep() throws Exception {
        start();
        add("Phyrexian Arena", me, ZoneType.Battlefield);
        int hand = me.getCardsIn(ZoneType.Hand).size();
        game.getPhaseHandler().devModeSet(PhaseType.UNTAP, me);
        Future<?> f = gameThread.submit(() -> game.getPhaseHandler().devAdvanceToPhase(PhaseType.UPKEEP));
        f.get(10, TimeUnit.SECONDS);
        game.getPhaseHandler().onStackResolved();
        List<String> seen = play(() -> me.getLife() != 20 && game.getStack().isEmpty() || game.getPhaseHandler().getPhase() != PhaseType.UPKEEP, null, null);
        assertEquals(me.getCardsIn(ZoneType.Hand).size(), hand + 1, "drew a card; seen " + seen);
        assertEquals(me.getLife(), 19);
        assertNotNull(stackText("Phyrexian Arena"), "the seat saw the trigger on the stack: " + seat.stackItems());
        assertNoSilentDefault();
    }

    /** Cumulative upkeep paid from a single graveyard: the seat picks the player, then the cards, through its inputs. */
    @Test
    public void jotunGruntsUpkeepIsPaidFromTheGraveyardTheSeatPicks() throws Exception {
        start();
        Card grunt = add("Jötun Grunt", me, ZoneType.Battlefield);
        List<Card> plains = new ArrayList<>();
        for (int i = 0; i < 2; i++) {
            plains.add(add("Plains", opp1, ZoneType.Graveyard));
        }
        game.getPhaseHandler().devModeSet(PhaseType.UNTAP, me);
        Future<?> f = gameThread.submit(() -> game.getPhaseHandler().devAdvanceToPhase(PhaseType.UPKEEP));
        f.get(10, TimeUnit.SECONDS);
        game.getPhaseHandler().onStackResolved();
        List<String> seen = play(() -> opp1.getCardsIn(ZoneType.Graveyard).isEmpty() && game.getStack().isEmpty()
                        || !game.getCardState(grunt).isInZone(ZoneType.Battlefield)
                        || game.getPhaseHandler().getPhase() != PhaseType.UPKEEP,
                in -> {
                    if (in instanceof forge.gamemodes.match.input.InputSelectCardsFromList) {
                        return () -> plains.forEach(this::select); // then OK
                    }
                    if (in instanceof forge.gamemodes.match.input.InputSelectEntitiesFromList) {
                        return () -> action("selectPlayer", "\"player\":" + opp1.getId());
                    }
                    return null;
                },
                p -> "confirm".equals(p.get("shape").getAsString()) ? JsonParser.parseString("true") : null);
        assertNoSilentDefault();
        assertTrue(game.getCardState(grunt).isInZone(ZoneType.Battlefield), "upkeep paid; seen " + seen);
        assertTrue(opp1.getCardsIn(ZoneType.Graveyard).isEmpty(), "the two Plains left ai1's graveyard; seen " + seen);
        assertEquals(grunt.getCounters(forge.game.card.CounterEnumType.AGE), 1);
    }

    @Test
    public void triarchPraetorianUnearthedByTheSeatDrawsTwoAndLosesTwo() throws Exception {
        start();
        for (int i = 0; i < 5; i++) {
            add("Swamp", me, ZoneType.Battlefield);
        }
        Card praetorian = add("Triarch Praetorian", me, ZoneType.Graveyard);
        int hand = me.getCardsIn(ZoneType.Hand).size();
        game.getPhaseHandler().devModeSet(PhaseType.MAIN1, me);
        game.getPhaseHandler().onStackResolved();
        boolean[] activated = {false};
        List<String> seen = play(() -> activated[0] && game.getStack().isEmpty() && me.getLife() != 20 || game.getPhaseHandler().getPhase() != PhaseType.MAIN1,
                in -> {
                    if (in instanceof InputPassPriority && !activated[0] && game.getStack().isEmpty()) {
                        activated[0] = true;
                        return () -> select(praetorian); // Unearth, its only ability from the graveyard
                    }
                    return null;
                }, null);
        assertTrue(praetorian.getZone() != null && game.getCardState(praetorian).isInZone(ZoneType.Battlefield), "unearthed; seen " + seen);
        assertEquals(me.getCardsIn(ZoneType.Hand).size(), hand + 2, "drew two");
        assertEquals(me.getLife(), 18);
        assertNotNull(stackText("Triarch Praetorian"), "the seat saw the trigger on the stack: " + seat.stackItems());
        assertNoSilentDefault();
    }

    /** Declares {@code attacker} through the seat's attack input, then plays on until {@code done}. */
    private List<String> attackWith(Card attacker, BooleanSupplier done, Function<Input, Runnable> onInput, Function<JsonObject, JsonElement> onPrompt) throws Exception {
        game.getPhaseHandler().devModeSet(PhaseType.MAIN1, me);
        game.getPhaseHandler().onStackResolved();
        boolean[] declared = {false};
        return play(done, in -> {
            if (in instanceof InputAttack) {
                if (!declared[0]) {
                    declared[0] = true;
                    return () -> select(attacker);
                }
                return null; // OK: attackers declared
            }
            return onInput == null ? null : onInput.apply(in);
        }, onPrompt);
    }

    @Test
    public void szarekhAttackMillsThreeAndOffersTheArtifactCreature() throws Exception {
        start();
        Card szarekh = add("Szarekh, the Silent King", me, ZoneType.Battlefield);
        // top three of the library: two lands and an artifact creature
        Card ornithopter = add("Ornithopter", me, ZoneType.Library);
        me.getZone(ZoneType.Library).remove(ornithopter);
        me.getZone(ZoneType.Library).add(ornithopter, 0);
        Card top2 = me.getCardsIn(ZoneType.Library).get(1);
        Card top3 = me.getCardsIn(ZoneType.Library).get(2);
        int library = me.getCardsIn(ZoneType.Library).size();
        List<String> offered = new ArrayList<>();
        List<String> seen = attackWith(szarekh, () -> game.getPhaseHandler().getPhase() == PhaseType.COMBAT_DECLARE_BLOCKERS
                        || game.getPhaseHandler().getPhase().isAfter(PhaseType.COMBAT_DECLARE_BLOCKERS),
                in -> {
                    if (!(in instanceof InputPassPriority) && !(in instanceof InputConfirm) && !(in instanceof InputPayMana)) {
                        // the follow-up choice as an input: pick Ornithopter
                        offered.add(in.getClass().getSimpleName());
                        return () -> {
                            select(ornithopter);
                            ok();
                        };
                    }
                    return null;
                },
                p -> {
                    offered.add(p.toString());
                    JsonArray choices = p.getAsJsonArray("choices");
                    for (int i = 0; choices != null && i < choices.size(); i++) {
                        if (choices.get(i).toString().contains("Ornithopter")) {
                            return JsonParser.parseString("[" + i + "]");
                        }
                    }
                    return null;
                });
        assertEquals(me.getCardsIn(ZoneType.Library).size(), library - 3, "milled three; seen " + seen);
        assertTrue(game.getCardState(top2).isInZone(ZoneType.Graveyard) && game.getCardState(top3).isInZone(ZoneType.Graveyard), "the lands stay milled");
        assertEquals(offered.size(), 1, "the seat chose among the milled cards: " + offered + "; seen " + seen);
        assertTrue(game.getCardState(ornithopter).isInZone(ZoneType.Hand), "Ornithopter offered and put in hand: " + offered + "; seen " + seen);
        assertNotNull(stackText("Szarekh"), "the seat saw the trigger on the stack: " + seat.stackItems());
        assertNoSilentDefault();
    }

    @Test
    public void anrakyrAttackLetsTheSeatCastAnArtifactForLife() throws Exception {
        start();
        Card anrakyr = add("Anrakyr the Traveller", me, ZoneType.Battlefield);
        Card stone = add("Mind Stone", me, ZoneType.Hand);
        List<String> seen = attackWith(anrakyr, () -> game.getCardState(stone).isInZone(ZoneType.Battlefield)
                        || game.getPhaseHandler().getPhase().isAfter(PhaseType.COMBAT_DECLARE_BLOCKERS),
                null,
                p -> {
                    String method = p.get("method").getAsString();
                    if ("confirm".equals(p.get("shape").getAsString())) {
                        return JsonParser.parseString("true");
                    }
                    JsonArray choices = p.getAsJsonArray("choices");
                    for (int i = 0; choices != null && i < choices.size(); i++) {
                        if (choices.get(i).toString().contains("Mind Stone")) {
                            return JsonParser.parseString("[" + i + "]");
                        }
                    }
                    fail("unexpected prompt " + method + ": " + p);
                    return null;
                });
        assertTrue(game.getCardState(stone).isInZone(ZoneType.Battlefield), "Mind Stone cast and resolved; seen " + seen);
        assertTrue(seen.contains("InputConfirm"), "the optional trigger asked the seat: " + seen);
        assertEquals(me.getLife(), 18, "paid life equal to its mana value");
        assertNotNull(stackText("Anrakyr"), "the seat saw the trigger on the stack: " + seat.stackItems());
        assertNoSilentDefault();
    }

    // --- issue #63: a trigger whose target restriction depends on the triggering object ---

    /** The first choice whose text names {@code name}, else the first legal answer (as the sweep's seat). */
    private static JsonElement pick(JsonObject p, String name) {
        JsonArray choices = p.getAsJsonArray("choices");
        for (int i = 0; name != null && choices != null && i < choices.size(); i++) {
            if (choices.get(i).toString().contains(name)) {
                return JsonParser.parseString("[" + i + "]");
            }
        }
        return ScriptedSeat.answer(p);
    }

    /**
     * Kuldotha Forgemaster (mana value 5) sacrifices itself and two Ornithopters (0): three Scrap Trawler triggers from
     * one trigger of one host. The Forgemaster's has Mind Stone (2) to return; the Ornithopters' have no artifact card of
     * lesser mana value. The audit must match the trigger cast to the Forgemaster's and count the other two as having
     * no legal target (the sweep reported the Forgemaster's as dropped).
     */
    @Test
    public void scrapTrawlerReturnsALesserArtifactAndTheAuditCountsTheOthersAsNoTarget() throws Exception {
        audit = new TriggerAudit(100);
        start(new TriggerAudit.Human(audit));
        add("Scrap Trawler", me, ZoneType.Battlefield);
        Card forgemaster = add("Kuldotha Forgemaster", me, ZoneType.Battlefield);
        Card o1 = add("Ornithopter", me, ZoneType.Battlefield);
        Card o2 = add("Ornithopter", me, ZoneType.Battlefield);
        Card stone = add("Mind Stone", me, ZoneType.Graveyard);
        Card sphere = add("Myr Battlesphere", me, ZoneType.Graveyard);
        game.getPhaseHandler().devModeSet(PhaseType.MAIN1, me);
        game.getPhaseHandler().onStackResolved();
        boolean[] activated = {false};
        List<String> seen = play(() -> activated[0] && game.getStack().isEmpty() && game.getCardState(stone).isInZone(ZoneType.Hand)
                        || game.getPhaseHandler().getPhase() != PhaseType.MAIN1,
                in -> {
                    if (in instanceof InputPassPriority && !activated[0] && game.getStack().isEmpty()) {
                        activated[0] = true;
                        return () -> select(forgemaster);
                    }
                    if (in instanceof forge.gamemodes.match.input.InputSelectCardsFromList && forgemaster.isInPlay()) {
                        return () -> List.of(o1, o2, forgemaster).forEach(this::select); // then OK
                    }
                    if (in instanceof forge.gamemodes.match.input.InputSelectTargets) {
                        return () -> select(stone);
                    }
                    return null;
                },
                p -> pick(p, "Mind Stone"));
        assertTrue(game.getCardState(forgemaster).isInZone(ZoneType.Graveyard), "sacrificed; seen " + seen);
        assertTrue(game.getCardState(stone).isInZone(ZoneType.Hand), "the Forgemaster's trigger returned Mind Stone; seen " + seen);
        assertTrue(game.getCardState(sphere).isInZone(ZoneType.Graveyard), "Myr Battlesphere (7) was never a legal target");
        assertNotNull(stackText("Scrap Trawler"), "the seat saw the trigger on the stack: " + seat.stackItems());
        assertEquals(audit.dropped, List.of(), audit.dropped + "; seen " + seen);
        assertEquals(audit.onStack, 1, "the Forgemaster's trigger");
        assertEquals(audit.noLegalTarget, 2, "the Ornithopters' triggers: " + audit.noTargetCards);
        assertEquals(audit.handed, 3);
        assertNoSilentDefault();
    }

    /** Kuldotha Forgemaster (5) dies alone; the graveyard holds only Myr Battlesphere (7): no legal target, counted so. */
    @Test
    public void scrapTrawlerWithNoLesserArtifactHasNoLegalTarget() throws Exception {
        audit = new TriggerAudit(100);
        start(new TriggerAudit.Human(audit));
        add("Scrap Trawler", me, ZoneType.Battlefield);
        Card forgemaster = add("Kuldotha Forgemaster", me, ZoneType.Battlefield);
        Card vampire = add("Bloodthrone Vampire", me, ZoneType.Battlefield);
        Card sphere = add("Myr Battlesphere", me, ZoneType.Graveyard);
        game.getPhaseHandler().devModeSet(PhaseType.MAIN1, me);
        game.getPhaseHandler().onStackResolved();
        boolean[] activated = {false};
        List<String> seen = play(() -> activated[0] && game.getStack().isEmpty() && vampire.getNetPower() == 3
                        || game.getPhaseHandler().getPhase() != PhaseType.MAIN1,
                in -> {
                    if (in instanceof InputPassPriority && !activated[0] && game.getStack().isEmpty()) {
                        activated[0] = true;
                        return () -> select(vampire);
                    }
                    if (in instanceof forge.gamemodes.match.input.InputSelectCardsFromList && forgemaster.isInPlay()) {
                        return () -> select(forgemaster); // then OK
                    }
                    return null;
                },
                p -> pick(p, null));
        assertTrue(game.getCardState(forgemaster).isInZone(ZoneType.Graveyard), "sacrificed; seen " + seen);
        assertTrue(game.getCardState(sphere).isInZone(ZoneType.Graveyard), "Myr Battlesphere (7) is no legal target");
        assertEquals(vampire.getNetPower(), 3, "the Vampire's ability resolved; seen " + seen);
        assertEquals(audit.dropped, List.of(), "seen " + seen);
        assertEquals(audit.onStack, 0);
        assertEquals(audit.handed, 1, "the Forgemaster's trigger was handed to the seat");
        assertEquals(audit.noLegalTarget, 1, "counted as no legal target: " + audit.noTargetCards);
        assertNoSilentDefault();
    }
}
