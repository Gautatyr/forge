package forge.fork.web.seat;

import static org.testng.Assert.assertEquals;
import static org.testng.Assert.assertFalse;
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
import forge.game.spellability.SpellAbility;
import forge.game.zone.ZoneType;
import forge.gamemodes.match.input.Input;
import forge.gamemodes.match.input.InputPassPriority;
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
 * Issue #81: each {@code showPromptMessage} of a selection input carries what it asks ({@link InputInfo}): targets of a
 * spell, an activated or a triggered ability, or a pick for a cost or an effect, with what declining an "unless" cost
 * does. Asserted on the frames the seat received, and on what the engine did with the answers.
 */
public class InputInfoTest {

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
        gameThread = Executors.newSingleThreadExecutor(r -> new Thread(r, "Game-81"));
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

    /** The {@code input} of every showPromptMessage frame whose message contains {@code text}, in order. */
    private List<JsonObject> infos(String text) {
        List<JsonObject> out = new ArrayList<>();
        for (String f : seat.all().split("\n")) {
            JsonObject m = JsonParser.parseString(f).getAsJsonObject();
            if ("call".equals(m.get("t").getAsString()) && "showPromptMessage".equals(m.get("method").getAsString())
                    && m.getAsJsonArray("args").get(1).getAsString().contains(text)) {
                out.add(m.has("input") ? m.getAsJsonObject("input") : new JsonObject());
            }
        }
        return out;
    }

    private void main1() {
        game.getPhaseHandler().devModeSet(PhaseType.MAIN1, me);
        game.getPhaseHandler().onStackResolved();
    }

    @Test
    public void anActivatedAbilitysTargetsThenItsSacrificeCost() throws Exception {
        start();
        Card devotion = add("Fanatical Devotion", me, ZoneType.Battlefield);
        Card bears = add("Grizzly Bears", me, ZoneType.Battlefield);
        Card elves = add("Llanowar Elves", me, ZoneType.Battlefield);
        main1();
        boolean[] activated = {false};
        List<String> seen = play(() -> activated[0] && game.getStack().isEmpty() || game.getPhaseHandler().getPhase() != PhaseType.MAIN1,
                in -> {
                    if (in instanceof InputPassPriority && !activated[0]) {
                        activated[0] = true;
                        return () -> select(devotion);
                    }
                    if (in instanceof InputSelectTargets) {
                        return () -> select(bears);
                    }
                    if (in instanceof InputSelectCardsFromList && game.getCardState(elves).isInZone(ZoneType.Battlefield)) {
                        return () -> select(elves);
                    }
                    return null;
                });
        List<JsonObject> targeting = infos("Fanatical Devotion");
        assertFalse(targeting.isEmpty(), "the targeting message was sent; seen " + seen);
        JsonObject target = targeting.get(0);
        assertEquals(target.get("kind").getAsString(), "target", target.toString());
        assertEquals(target.get("ability").getAsString(), "activated", target.toString());
        List<JsonObject> sac = infos("to sacrifice");
        assertFalse(sac.isEmpty(), "the sacrifice message was sent; seen " + seen);
        assertEquals(sac.get(0).get("kind").getAsString(), "pick", sac.get(0).toString());
        assertFalse(sac.get(0).has("decline"), "a cost of the seat's own activation has nothing to decline into: " + sac.get(0));
        assertTrue(game.getCardState(elves).isInZone(ZoneType.Graveyard), "the Elves were sacrificed; seen " + seen);
        assertEquals(SilentDefaults.count(), 0, "silent defaults: " + SilentDefaults.recent());
    }

    @Test
    public void aSpellsTargetsAndATriggersTargets() throws Exception {
        start();
        for (int i = 0; i < 5; i++) {
            add("Mountain", me, ZoneType.Battlefield);
        }
        Card bolt = add("Lightning Bolt", me, ZoneType.Hand);
        Card kavu = add("Flametongue Kavu", me, ZoneType.Hand);
        Card ogre = add("Gray Ogre", ai, ZoneType.Battlefield);
        main1();
        List<String> seen = play(() -> game.getCardState(ogre).isInZone(ZoneType.Graveyard) && game.getStack().isEmpty()
                        || game.getPhaseHandler().getPhase() != PhaseType.MAIN1,
                in -> {
                    if (in instanceof InputPassPriority && game.getStack().isEmpty()) {
                        Card next = game.getCardState(bolt).isInZone(ZoneType.Hand) ? bolt : game.getCardState(kavu).isInZone(ZoneType.Hand) ? kavu : null;
                        return next == null ? null : () -> select(next);
                    }
                    if (in instanceof InputSelectTargets) {
                        // the Bolt at the AI; the Kavu's trigger (the Ogre or the Kavu itself) at the Ogre
                        return game.getCardState(kavu).isInZone(ZoneType.Battlefield)
                                ? () -> select(game.getCardState(ogre)) : () -> action("selectPlayer", "\"player\":" + ai.getId());
                    }
                    return null;
                });
        JsonObject spell = infos("Lightning Bolt").stream().filter(o -> o.has("kind")).findFirst().orElse(null);
        assertNotNull(spell, "the Bolt's targeting message carries its input; seen " + seen);
        assertEquals(spell.get("kind").getAsString(), "target", spell.toString());
        assertEquals(spell.get("ability").getAsString(), "spell", spell.toString());
        assertTrue(game.getCardState(ogre).isInZone(ZoneType.Graveyard), "the Kavu's trigger killed the Ogre; seen " + seen);
        JsonObject trigger = infos("Flametongue Kavu").stream().filter(o -> o.has("kind")).findFirst().orElse(null);
        assertNotNull(trigger, "the Kavu trigger's targeting message carries its input; seen " + seen);
        assertEquals(trigger.get("ability").getAsString(), "triggered", trigger.toString());
        assertEquals(SilentDefaults.count(), 0, "silent defaults: " + SilentDefaults.recent());
    }

    /** Drekavac: "When it enters, sacrifice it unless you discard a noncreature card." Cancel declines: the engine sacrifices it. */
    @Test
    public void aDeclinedUnlessCostSaysWhatHappens() throws Exception {
        start();
        add("Swamp", me, ZoneType.Battlefield);
        add("Swamp", me, ZoneType.Battlefield);
        Card drekavac = add("Drekavac", me, ZoneType.Hand);
        Card bolt = add("Lightning Bolt", me, ZoneType.Hand);
        main1();
        boolean[] cast = {false};
        boolean[] declined = {false};
        List<String> seen = play(() -> declined[0] && game.getStack().isEmpty() || game.getPhaseHandler().getPhase() != PhaseType.MAIN1,
                in -> {
                    if (in instanceof InputPassPriority && !cast[0]) {
                        cast[0] = true;
                        return () -> select(drekavac);
                    }
                    if (in instanceof InputSelectCardsFromList) {
                        declined[0] = true;
                        return () -> action("selectButtonCancel", null);
                    }
                    return null;
                });
        List<JsonObject> discard = infos("to discard");
        assertFalse(discard.isEmpty(), "the discard message was sent; seen " + seen);
        JsonObject info = discard.get(0);
        assertEquals(info.get("kind").getAsString(), "pick", info.toString());
        // The engine's "Sacrifices Drekavac (<id>)", worded for the seat (named "You") with no card id.
        assertEquals(info.has("decline") ? info.get("decline").getAsString() : null, "You sacrifice Drekavac", info.toString());
        assertTrue(game.getCardState(drekavac).isInZone(ZoneType.Graveyard), "declined: Drekavac was sacrificed; seen " + seen);
        assertTrue(game.getCardState(bolt).isInZone(ZoneType.Hand), "nothing was discarded; seen " + seen);
        assertEquals(SilentDefaults.count(), 0, "silent defaults: " + SilentDefaults.recent());
    }

    /**
     * Issue #88. Great Desert Hellion: "At the beginning of your upkeep, sacrifice it unless you discard a card", with
     * {@code OrString$ Sacrifice {c:Self}.}: Cancel's words resolve the placeholder as a stack description does.
     */
    @Test
    public void anOrStringResolvesItsPlaceholders() throws Exception {
        start();
        Card hellion = add("Great Desert Hellion", me, ZoneType.Battlefield);
        Card plains = add("Plains", me, ZoneType.Hand);
        game.getPhaseHandler().devModeSet(PhaseType.UNTAP, me, true, 2);
        game.getPhaseHandler().onStackResolved();
        boolean[] declined = {false};
        List<String> seen = play(() -> declined[0] && game.getStack().isEmpty()
                        || game.getPhaseHandler().getPhase().isAfter(PhaseType.UPKEEP),
                in -> {
                    if (in instanceof InputSelectCardsFromList) {
                        declined[0] = true;
                        return () -> action("selectButtonCancel", null);
                    }
                    return null;
                });
        List<JsonObject> discard = infos("to discard");
        assertFalse(discard.isEmpty(), "the discard message was sent; seen " + seen);
        JsonObject info = discard.get(0);
        assertEquals(info.has("decline") ? info.get("decline").getAsString() : null, "Sacrifice Great Desert Hellion", info.toString());
        assertTrue(game.getCardState(hellion).isInZone(ZoneType.Graveyard), "declined: the Hellion was sacrificed; seen " + seen);
        assertTrue(game.getCardState(plains).isInZone(ZoneType.Hand), "nothing was discarded; seen " + seen);
        assertEquals(SilentDefaults.count(), 0, "silent defaults: " + SilentDefaults.recent());
    }

    /**
     * Issue #88. Undercity Plunder cast by ai1 at the seat: the seat pays the "unless" cost whose
     * {@code OrString$ {p:You} conjures ... into your hand.} names the caster, and the script's "your" (the card's
     * controller, as in Oracle text) is the caster's, not the seat's.
     */
    @Test
    public void anOrStringPaidByAnOpponentNamesTheCaster() {
        start();
        Card plunder = add("Undercity Plunder", ai, ZoneType.Hand);
        SpellAbility spell = plunder.getFirstSpellAbility();
        spell.setActivatingPlayer(ai);
        SpellAbility unless = spell.getSubAbility();
        assertTrue(unless.hasParam("OrString"), "the unless sub-ability: " + unless);
        assertEquals(InputInfo.decline(unless, me),
                "ai1 conjures a duplicate of a random card from their library into ai1's hand");
        // Paid by its own caster (no such play in the pool): the script's "your" is the seat's.
        assertEquals(InputInfo.decline(unless, ai),
                "You conjure a duplicate of a random card from their library into your hand");
    }
}
