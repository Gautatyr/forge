package forge.fork.web.seat;

import static org.testng.Assert.assertEquals;
import static org.testng.Assert.assertTrue;
import static org.testng.Assert.fail;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.function.BooleanSupplier;
import java.util.function.Function;
import java.util.function.Supplier;

import org.testng.annotations.AfterMethod;
import org.testng.annotations.BeforeClass;
import org.testng.annotations.Test;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

import forge.ai.LobbyPlayerAi;
import forge.deck.Deck;
import forge.fork.web.bridge.GameStream;
import forge.fork.web.bridge.GameStream.HiddenPolicy;
import forge.fork.web.bridge.visibility.TestEngine;
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
import forge.gui.control.GameEventForwarder;
import forge.player.LobbyPlayerHuman;
import forge.player.PlayerControllerHuman;
import forge.trackable.TrackableCollection;

/**
 * Issue #174: a card the engine lets the seat play from a zone other than the hand (the top of the library with Mystic
 * Forge, Bolas's Citadel…; exile; graveyard) is lit by {@code setWeaklySelectable} for the seat that may see it, and a
 * {@code selectCard} on it casts or plays it, as the page sends it. Each case builds the game state, runs the engine to
 * the seat's first main phase priority, reads the seat's own messages for the highlight, clicks the card by the id the
 * seat was sent, and checks the engine: the card is on the stack (or played) and what was paid.
 */
public class HumanSeatOtherZonesTest {

    private ExecutorService gameThread;
    private Game game;
    private Player me;
    private Player ai;
    private PlayerControllerHuman pch;
    private GameStream stream;
    private HumanSeatTriggersTest.Seat seat;
    /** Answers the seat's prompts (the value of the reply), or null to fail on one. */
    private Function<JsonObject, JsonElement> promptAnswer;

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
        promptAnswer = null;
        SilentDefaults.reset();
        SilentDefaults.setStrict(true);
        gameThread = Executors.newSingleThreadExecutor(r -> new Thread(r, "Game-ozn"));
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

    /** A card put on top of the library. */
    private Card top(String name, Player p) {
        Card c = TestEngine.add(name, p, ZoneType.Library);
        p.getZone(ZoneType.Library).remove(c);
        p.getZone(ZoneType.Library).add(c, 0);
        return c;
    }

    private void lands(String name, int n) {
        for (int i = 0; i < n; i++) {
            add(name, me, ZoneType.Battlefield);
        }
    }

    private void action(String method, String extra) {
        JsonObject a = JsonParser.parseString("{\"t\":\"action\",\"method\":\"" + method + "\"" + (extra == null ? "" : "," + extra) + "}").getAsJsonObject();
        stream.clientMessage(0, a, seat);
    }

    /** What one click saw. */
    private static final class Run {
        /** Wire card ids of the seat's last {@code setWeaklySelectable} at the priority the click was made at. */
        Set<Integer> lit = new LinkedHashSet<>();
        /** The wire id the seat was sent for the card (-1: none). */
        int wire = -1;
        final List<String> rejected = new ArrayList<>();
        final List<String> inputs = new ArrayList<>();

        boolean litCard() {
            return wire >= 0 && lit.contains(wire);
        }

        @Override
        public String toString() {
            return "lit " + lit + " wire " + wire + " rejected " + rejected + " inputs " + inputs;
        }
    }

    private Set<Integer> litIds() {
        Set<Integer> ids = new LinkedHashSet<>();
        String call = seat.lastCall("setWeaklySelectable");
        if (call != null) {
            JsonObject m = JsonParser.parseString(call).getAsJsonObject();
            JsonArray args = m.getAsJsonArray("args");
            if (args != null && args.size() > 0 && args.get(0).isJsonArray()) {
                for (JsonElement e : args.get(0).getAsJsonArray()) {
                    if (e.isJsonObject() && e.getAsJsonObject().has("id")) {
                        ids.add(e.getAsJsonObject().get("id").getAsInt());
                    } else if (e.isJsonPrimitive()) {
                        ids.add(e.getAsInt());
                    }
                }
            }
        }
        return ids;
    }

    /** Picks for the seat's current input: its first {@code min} cards, else its first target. */
    private void pickSelection() {
        String call = seat.lastCall("setSelection");
        if (call == null) {
            return;
        }
        JsonObject sel = JsonParser.parseString(call).getAsJsonObject().getAsJsonArray("args").get(0).getAsJsonObject();
        int picked = 0;
        for (JsonElement e : sel.getAsJsonArray("cards")) {
            if (picked < sel.get("min").getAsInt() && e.isJsonObject()) {
                action("selectCard", "\"card\":" + e.getAsJsonObject().get("id").getAsInt());
                picked++;
            }
        }
        if (picked == 0 && sel.getAsJsonArray("targets").size() > 0) {
            JsonObject t = sel.getAsJsonArray("targets").get(0).getAsJsonObject();
            int id = t.get("id").getAsInt();
            switch (t.get("type").getAsString()) {
                case "card" -> action("selectCard", "\"card\":" + id);
                case "player" -> action("selectPlayer", "\"player\":" + id);
                default -> action("selectStackItem", "\"stackItem\":" + id);
            }
        }
    }

    /**
     * One click: the card (resolved when the seat has priority), and what ends it. By default the click is made with an empty
     * stack and ends when {@code done} holds with an empty stack again; {@code startOnStack}: made at a priority with something
     * on the stack; {@code finishOnStack}: ends as soon as {@code done} holds, whatever is on the stack.
     */
    private record Step(Supplier<Card> card, BooleanSupplier done, boolean startOnStack, boolean finishOnStack) { }

    private static Step step(Supplier<Card> card, BooleanSupplier done) {
        return new Step(card, done, false, false);
    }

    /**
     * Runs the engine from the seat's MAIN1; at each empty-stack priority input of the seat, takes the next step: reads the
     * highlight, clicks the card by the id the seat holds ({@code click} false: only reads it, then stops), answers every
     * other input with OK. A step is over when its {@code done} holds with an empty stack; a click with no effect for 3 s ends
     * the run. Returns what each step saw.
     */
    private List<Run> run(boolean click, Step... steps) throws Exception {
        game.getPhaseHandler().devModeSet(PhaseType.MAIN1, me);
        game.getPhaseHandler().onStackResolved();
        PhaseHandler ph = game.getPhaseHandler();
        List<Run> runs = new ArrayList<>();
        boolean[] over = {false};
        Future<?> loop = gameThread.submit(() -> {
            for (int i = 0; i < 400 && !over[0] && !game.isGameOver(); i++) {
                ph.mainLoopStep();
            }
        });
        Run cur = null;
        int next = 0;
        int promptsAtAct = 0;
        long clickedAt = 0;
        long end = System.currentTimeMillis() + 90_000;
        while (!loop.isDone()) {
            if (System.currentTimeMillis() > end) {
                fail("game loop stuck; runs " + runs + "; input " + pch.getInputQueue().getInput());
            }
            JsonObject m = seat.inbox.poll(10, TimeUnit.MILLISECONDS);
            if (m != null && "prompt".equals(m.get("t").getAsString())) {
                JsonElement answer = promptAnswer == null ? null : promptAnswer.apply(m);
                if (answer == null) {
                    fail("unexpected prompt " + m);
                }
                JsonObject reply = new JsonObject();
                reply.addProperty("t", "reply");
                reply.add("id", m.get("id"));
                reply.add("value", answer);
                stream.clientMessage(0, reply, seat);
            }
            if (m != null && "actionRejected".equals(m.get("t").getAsString()) && cur != null) {
                cur.rejected.add(m.toString());
            }
            Input in = pch.getInputQueue().getInput();
            if (in == null || pch.getInputProxy().getInput() != in || seat.count("showPromptMessage") <= promptsAtAct) {
                if (cur != null && clickedAt > 0 && System.currentTimeMillis() - clickedAt > 3000) {
                    over[0] = true;
                    gameThread.shutdownNow();
                    return runs;
                }
                continue;
            }
            promptsAtAct = seat.count("showPromptMessage");
            if (cur != null) {
                cur.inputs.add(in.getClass().getSimpleName());
            }
            boolean priority = in instanceof InputPassPriority;
            boolean stackEmpty = game.getStack().isEmpty();
            if (priority && cur != null && steps[next - 1].done().getAsBoolean() && (steps[next - 1].finishOnStack() || stackEmpty)) {
                cur = null; // the step took effect
                clickedAt = 0;
            }
            boolean ready = priority && cur == null && (next == steps.length || steps[next].startOnStack() != stackEmpty);
            if (ready) {
                if (next == steps.length) {
                    over[0] = true;
                    gameThread.shutdownNow();
                    return runs;
                }
                Thread.sleep(200); // let the flush and the highlight reach the seat
                Card card = steps[next].card().get();
                cur = new Run();
                runs.add(cur);
                next++;
                cur.lit = litIds();
                cur.wire = wireId(card);
                if (!click) {
                    over[0] = true;
                    gameThread.shutdownNow();
                    return runs;
                }
                clickedAt = System.currentTimeMillis();
                action("selectCard", "\"card\":" + cur.wire);
                continue;
            }
            if (priority && cur != null && stackEmpty) {
                continue; // clicked: waiting for the effect (or the 3 s)
            }
            if (in.getClass().getSimpleName().startsWith("InputSelect")) {
                Thread.sleep(150); // the input's selection follows its prompt
                pickSelection();
            }
            action("selectButtonOk", null);
            clickedAt = cur == null ? 0 : System.currentTimeMillis();
        }
        loop.get(1, TimeUnit.SECONDS);
        return runs;
    }

    /** The id the seat was sent for the card outside zone lists, as its prompts and calls name it (-1: never told). */
    private int wireId(Card c) {
        int[] id = {-1};
        stream.sendToSeat(0, refs -> {
            id[0] = refs.card(c.getId());
            JsonObject o = new JsonObject();
            o.addProperty("t", "probe");
            return o;
        }, null);
        return id[0];
    }

    private boolean in(Card c, ZoneType z) {
        return game.getCardState(c).isInZone(z);
    }

    private String where(Card c) {
        Card now = game.getCardState(c);
        return now.getZone() == null ? "nowhere" : now.getZone().getZoneType().name();
    }

    private void assertPlayed(List<Run> runs, Card c, String why) {
        Run r = runs.get(0);
        assertTrue(r.litCard(), why + ": the engine lights the card for the seat: " + r);
        assertTrue(r.rejected.isEmpty(), why + ": no refused action: " + r);
        assertTrue(in(c, ZoneType.Battlefield), why + ": played; it is in " + where(c) + "; " + r);
        assertEquals(SilentDefaults.count(), 0, "silent defaults: " + SilentDefaults.recent());
    }

    @Test
    public void mysticForgeTopCard() throws Exception {
        start();
        add("Mystic Forge", me, ZoneType.Battlefield);
        lands("Mountain", 1);
        Card sol = top("Sol Ring", me);
        assertPlayed(run(true, step(() -> sol, () -> !in(sol, ZoneType.Library))), sol, "Mystic Forge, Sol Ring");
        assertTrue(me.getZone(ZoneType.Battlefield).getCards().stream().filter(c -> c.getName().equals("Mountain")).allMatch(Card::isTapped), "the Mountain paid");
    }

    @Test
    public void mysticForgeDoesNotLightAColoredSpell() throws Exception {
        start();
        add("Mystic Forge", me, ZoneType.Battlefield);
        lands("Forest", 2);
        Card bears = top("Grizzly Bears", me);
        List<Run> runs = run(false, step(() -> bears, () -> false));
        assertTrue(!runs.get(0).litCard(), "a colored creature spell is not playable from the top with Mystic Forge: " + runs.get(0));
    }

    @Test
    public void bolasCitadelPaysLifeForTheTopSpell() throws Exception {
        start();
        add("Bolas's Citadel", me, ZoneType.Battlefield);
        Card bears = top("Grizzly Bears", me);
        int life = me.getLife();
        assertPlayed(run(true, step(() -> bears, () -> !in(bears, ZoneType.Library))), bears, "Bolas's Citadel");
        assertEquals(me.getLife(), life - 2, "paid 2 life (mana value) instead of mana");
    }

    @Test
    public void bolasCitadelPlaysATopLand() throws Exception {
        start();
        add("Bolas's Citadel", me, ZoneType.Battlefield);
        Card forest = top("Forest", me);
        assertPlayed(run(true, step(() -> forest, () -> !in(forest, ZoneType.Library))), forest, "Bolas's Citadel land");
    }

    @Test
    public void futureSightTopSpell() throws Exception {
        start();
        add("Future Sight", me, ZoneType.Battlefield);
        lands("Forest", 2);
        Card bears = top("Grizzly Bears", me);
        assertPlayed(run(true, step(() -> bears, () -> !in(bears, ZoneType.Library))), bears, "Future Sight");
    }

    @Test
    public void courserOfKruphixTopLand() throws Exception {
        start();
        add("Courser of Kruphix", me, ZoneType.Battlefield);
        Card forest = top("Forest", me);
        assertPlayed(run(true, step(() -> forest, () -> !in(forest, ZoneType.Library))), forest, "Courser of Kruphix");
    }

    @Test
    public void experimentalFrenzyTopSpell() throws Exception {
        start();
        add("Experimental Frenzy", me, ZoneType.Battlefield);
        lands("Forest", 2);
        Card bears = top("Grizzly Bears", me);
        assertPlayed(run(true, step(() -> bears, () -> !in(bears, ZoneType.Library))), bears, "Experimental Frenzy");
    }

    @Test
    public void vizierOfTheMenagerieTopCreature() throws Exception {
        start();
        add("Vizier of the Menagerie", me, ZoneType.Battlefield);
        lands("Forest", 2);
        Card bears = top("Grizzly Bears", me);
        assertPlayed(run(true, step(() -> bears, () -> !in(bears, ZoneType.Library))), bears, "Vizier of the Menagerie");
    }

    @Test
    public void flashbackFromTheGraveyard() throws Exception {
        start();
        lands("Island", 3);
        Card looting = add("Think Twice", me, ZoneType.Graveyard);
        List<Run> runs = run(true, step(() -> looting, () -> in(looting, ZoneType.Exile)));
        assertTrue(runs.get(0).litCard(), "flashback card lit: " + runs.get(0));
        assertTrue(in(looting, ZoneType.Exile), "flashed back (exiled after resolving); it is in " + where(looting) + "; " + runs.get(0));
    }

    @Test
    public void escapeFromTheGraveyard() throws Exception {
        start();
        lands("Mountain", 4);
        for (int i = 0; i < 3; i++) {
            add("Plains", me, ZoneType.Graveyard);
        }
        Card kroxa = add("Phoenix of Ash", me, ZoneType.Graveyard);
        List<Run> runs = run(true, step(() -> kroxa, () -> in(kroxa, ZoneType.Battlefield)));
        assertTrue(runs.get(0).litCard(), "escape card lit: " + runs.get(0));
        assertTrue(in(kroxa, ZoneType.Battlefield), "escaped; it is in " + where(kroxa) + "; " + runs.get(0));
    }

    /** The reply picking the choice whose label contains {@code word}. */
    private static Function<JsonObject, JsonElement> pick(String word) {
        return m -> {
            for (JsonElement c : m.getAsJsonArray("choices")) {
                if (c.getAsJsonObject().get("label").getAsString().contains(word)) {
                    return JsonParser.parseString("[" + c.getAsJsonObject().get("i").getAsInt() + "]");
                }
            }
            return null;
        };
    }

    /** Abstruse Archaic (no summoning sickness) and Mind Stone on the battlefield, two Mountains. */
    private Card[] archaicBoard() {
        add("Mountain", me, ZoneType.Battlefield);
        add("Mountain", me, ZoneType.Battlefield);
        Card stone = add("Mind Stone", me, ZoneType.Battlefield);
        Card archaic = add("Abstruse Archaic", me, ZoneType.Battlefield);
        return new Card[] {stone, archaic};
    }

    @Test
    public void abstruseArchaicCopiesAColorlessAbilityOnTheStack() throws Exception {
        start();
        Card[] b = archaicBoard();
        Card stone = b[0];
        Card archaic = b[1];
        promptAnswer = pick("Draw a card");
        List<Run> runs = run(true,
                new Step(() -> stone, () -> !in(stone, ZoneType.Battlefield), false, true),
                new Step(() -> archaic, () -> game.getCardState(archaic).isTapped(), true, true));
        assertEquals(runs.size(), 2, "two clicks: " + runs);
        assertTrue(runs.get(1).litCard(), "Archaic is lit with Mind Stone's ability on the stack: " + runs.get(1));
        assertTrue(game.getCardState(archaic).isTapped(), "Archaic was activated; " + runs.get(1));
        assertEquals(game.getStack().size(), 2, "Mind Stone's ability and the Archaic ability that targets it: " + game.getStack());
    }

    @Test
    public void abstruseArchaicHasNothingToDoWithAnEmptyStack() throws Exception {
        start();
        Card archaic = archaicBoard()[1];
        List<Run> runs = run(true, step(() -> archaic, () -> game.getCardState(archaic).isTapped()));
        assertTrue(!runs.get(0).litCard(), "no legal target: not lit: " + runs.get(0));
        assertTrue(!game.getCardState(archaic).isTapped(), "the click did nothing");
        assertTrue(runs.get(0).rejected.isEmpty(), "and the seat is told nothing: " + runs.get(0));
    }

    @Test
    public void abstruseArchaicIsNotLitWhileSummoningSick() throws Exception {
        start();
        Card[] b = archaicBoard();
        b[1].setSickness(true);
        Card stone = b[0];
        promptAnswer = pick("Draw a card");
        List<Run> runs = run(true,
                new Step(() -> stone, () -> !in(stone, ZoneType.Battlefield), false, true),
                new Step(() -> b[1], () -> game.getCardState(b[1]).isTapped(), true, true));
        assertTrue(!runs.get(1).litCard(), "summoning sick: not lit even with a legal target: " + runs.get(1));
    }

    @Test
    public void theTopOfTheLibraryIsHiddenFromEveryoneButTheSeatThatMayLook() throws Exception {
        start();
        add("Mystic Forge", me, ZoneType.Battlefield);
        lands("Mountain", 1);
        Card mine = top("Sol Ring", me);
        Card theirs = top("Gilded Lotus", ai);
        run(false, step(() -> mine, () -> false));
        String seat0 = stream.snapshot(0);
        assertTrue(seat0.contains("Sol Ring"), "the seat that may look sees its top card");
        assertTrue(!seat0.contains("Gilded Lotus"), "and not the opponent's: " + where(theirs));
        assertTrue(!stream.snapshot(1).contains("Sol Ring"), "the opponent's seat does not see it");
        assertTrue(!stream.snapshot().contains("Sol Ring"), "nor does a spectator");
        assertEquals(stream.realCardId(1, mine.getId()), -1, "no real id for the opponent's seat");
    }

    @Test
    public void adventureCardInExile() throws Exception {
        start();
        lands("Forest", 4);
        Card beast = add("Lovestruck Beast", me, ZoneType.Hand);
        promptAnswer = pick("Human creature token");
        List<Run> runs = run(true,
                step(() -> beast, () -> in(beast, ZoneType.Exile)),
                step(() -> beast, () -> in(beast, ZoneType.Battlefield)));
        assertEquals(runs.size(), 2, "two clicks: " + runs);
        assertTrue(runs.get(1).litCard(), "the card on an adventure is lit: " + runs.get(1));
        assertTrue(in(beast, ZoneType.Battlefield), "Lovestruck Beast cast from exile; it is in " + where(beast) + "; " + runs.get(1));
    }

    @Test
    public void anOpponentsCardExiledByGonti() throws Exception {
        start();
        lands("Swamp", 5);
        Card gonti = add("Gonti, Lord of Luxury", me, ZoneType.Hand);
        Card sol = top("Sol Ring", ai);
        promptAnswer = m -> m.has("choices") && m.getAsJsonArray("choices").size() > 0 && m.get("max").getAsInt() == 0 ? JsonParser.parseString("[]")
                : m.has("choices") && m.getAsJsonArray("choices").size() > 0
                ? JsonParser.parseString("[" + m.getAsJsonArray("choices").get(0).getAsJsonObject().get("i").getAsInt() + "]") : null;
        List<Run> runs = run(true,
                step(() -> gonti, () -> in(gonti, ZoneType.Battlefield) && game.getCardsIn(ZoneType.Exile).size() > 0),
                step(() -> game.getCardsIn(ZoneType.Exile).get(0), () -> game.getCardsIn(ZoneType.Exile).isEmpty()));
        assertEquals(runs.size(), 2, "two clicks: " + runs + " gonti " + where(gonti) + " sol " + where(sol) + " exile " + game.getCardsIn(ZoneType.Exile) + " stack " + game.getStack() + " input " + pch.getInputQueue().getInput() + " log " + game.getGameLog().getLogEntries(null));
        assertTrue(runs.get(1).litCard(), "the opponent's exiled card is lit: " + runs.get(1));
        assertTrue(game.getCardsIn(ZoneType.Exile).isEmpty(), "the exiled card was cast; " + runs.get(1) + " sol in " + where(sol));
    }

    @Test
    public void foretoldCardInExile() throws Exception {
        start();
        lands("Plains", 3);
        Card doomskar = add("Doomskar", me, ZoneType.Exile);
        doomskar.setForetold(true);
        doomskar.turnFaceDownNoUpdate();
        game.getAction().checkStaticAbilities();
        List<Run> runs = run(true, step(() -> doomskar, () -> in(doomskar, ZoneType.Graveyard)));
        assertTrue(runs.get(0).litCard(), "the foretold card is lit: " + runs.get(0));
        assertTrue(in(doomskar, ZoneType.Graveyard), "Doomskar cast for its foretell cost; it is in " + where(doomskar) + "; " + runs.get(0));
    }

    @Test
    public void impulseDrawnExileCards() throws Exception {
        start();
        lands("Mountain", 4);
        Card impulse = add("Reckless Impulse", me, ZoneType.Hand);
        Card land = top("Forest", me);
        Card sol = top("Sol Ring", me);
        List<Run> runs = run(true,
                step(() -> impulse, () -> in(impulse, ZoneType.Graveyard)),
                step(() -> sol, () -> !in(sol, ZoneType.Exile)),
                step(() -> land, () -> !in(land, ZoneType.Exile)));
        assertEquals(runs.size(), 3, "three clicks: " + runs);
        assertTrue(runs.get(1).litCard(), "the exiled spell is lit: " + runs.get(1));
        assertTrue(in(sol, ZoneType.Battlefield), "Sol Ring cast from exile; it is in " + where(sol) + "; " + runs.get(1));
        assertTrue(runs.get(2).litCard(), "the exiled land is lit: " + runs.get(2));
        assertTrue(in(land, ZoneType.Battlefield), "Forest played from exile; it is in " + where(land) + "; " + runs.get(2));
    }
}
