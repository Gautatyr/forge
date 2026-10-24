package forge.fork.web.seat;

import static org.testng.Assert.assertEquals;
import static org.testng.Assert.assertTrue;
import static org.testng.Assert.fail;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import org.testng.annotations.AfterMethod;
import org.testng.annotations.BeforeClass;
import org.testng.annotations.Test;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

import forge.ai.LobbyPlayerAi;
import forge.deck.Deck;
import forge.game.Game;
import forge.game.GameObject;
import forge.game.GameRules;
import forge.game.GameStage;
import forge.game.GameType;
import forge.game.ability.AbilityFactory;
import forge.game.Match;
import forge.game.card.Card;
import forge.game.phase.PhaseHandler;
import forge.game.phase.PhaseType;
import forge.game.player.Player;
import forge.game.player.RegisteredPlayer;
import forge.game.spellability.SpellAbility;
import forge.game.zone.ZoneType;
import forge.gamemodes.match.input.Input;
import forge.gamemodes.match.input.InputBlock;
import forge.gamemodes.match.input.InputPassPriority;
import forge.gui.control.GameEventForwarder;
import forge.player.LobbyPlayerHuman;
import forge.player.PlayerControllerHuman;
import forge.trackable.TrackableCollection;
import forge.fork.web.bridge.GameStream;
import forge.fork.web.bridge.GameStream.HiddenPolicy;
import forge.fork.web.bridge.visibility.TestEngine;

/**
 * "Skip spells between opponents" (owner ruling 2026-10-24), with a real engine in a 4-player game: seat 0 is a
 * {@code PlayerControllerHuman} on a {@link WebGuiGame}, seats 1–3 are AIs. Opponent 1 puts a spell or ability on the
 * stack at its first main phase (a real stack item: the card moved to the stack, its targets chosen) and the seat's
 * priority inputs with a non-empty stack are counted: 0 when the bridge passes for the seat, 1 when the seat is asked.
 */
public class HumanSeatOpponentStackTest {

    private ExecutorService gameThread;
    private Game game;
    private Player me;
    private List<Player> opps;
    private PlayerControllerHuman pch;
    private GameStream stream;
    private HumanSeatInvolvedStopsTest.Seat seat;

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

    private void start(boolean skip) {
        SilentDefaults.reset();
        SilentDefaults.setStrict(true);
        gameThread = Executors.newSingleThreadExecutor(r -> new Thread(r, "Game-oppstack"));
        List<RegisteredPlayer> rps = new ArrayList<>();
        rps.add(new RegisteredPlayer(new Deck()).setPlayer(new LobbyPlayerHuman("You")));
        for (int i = 1; i <= 3; i++) {
            rps.add(new RegisteredPlayer(new Deck()).setPlayer(new LobbyPlayerAi("ai" + i, null)));
        }
        GameRules rules = new GameRules(GameType.Constructed);
        game = new Game(rps, rules, new Match(rules, rps, "Test"));
        game.setAge(GameStage.Play);
        me = game.getPlayers().get(0);
        opps = game.getPlayers().subList(1, 4);
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
        seat = new HumanSeatInvolvedStopsTest.Seat();
        stream.addClient(seat, 0);
        stream.clientMessage(0, JsonParser.parseString("{\"t\":\"setSkipOpponentStack\",\"on\":" + skip + "}").getAsJsonObject(), seat);
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

    /** What an opponent casts: the card goes to the stack with its targets chosen, as the engine does for a cast. */
    private SpellAbility cast(Player caster, String card, GameObject... targets) {
        Card c = add(card, caster, ZoneType.Hand);
        return stackIt(c, c.getSpells().get(0), caster, targets);
    }

    /** The first activated ability of the permanent {@code source}. */
    private SpellAbility activate(Player controller, Card source, GameObject... targets) {
        SpellAbility ability = source.getSpellAbilities().stream().filter(SpellAbility::isActivatedAbility).findFirst().orElseThrow();
        return stackIt(source, ability, controller, targets);
    }

    private SpellAbility stackIt(Card c, SpellAbility sa, Player activator, GameObject... targets) {
        sa.setActivatingPlayer(activator);
        for (GameObject t : targets) {
            sa.getTargets().add(t);
        }
        if (sa.isSpell()) {
            game.getAction().moveToStack(c, sa);
        }
        game.getStack().add(sa);
        return sa;
    }

    private void action(String method, String extra) {
        JsonObject a = JsonParser.parseString("{\"t\":\"action\",\"method\":\"" + method + "\"" + (extra == null ? "" : "," + extra) + "}").getAsJsonObject();
        stream.clientMessage(0, a, seat);
    }

    /**
     * Opponent 1's main phase, with what is on the stack: plays until the stack is empty. Returns the stack-top
     * descriptions of the priority inputs the seat was asked with something on the stack.
     */
    private List<String> askedWithStack() throws Exception {
        return askedWithStack(PhaseType.MAIN1);
    }

    /** The same, from the start of {@code from} on opponent 1's turn (what its permanents trigger then goes on the stack). */
    private List<String> askedWithStack(PhaseType from) throws Exception {
        final PhaseHandler ph = game.getPhaseHandler();
        ph.devModeSet(from, opps.get(0));
        ph.onStackResolved();
        Future<?> loop = gameThread.submit(() -> {
            // until what was put on the stack, or triggered by what happened, has resolved
            boolean seen = !game.getStack().isEmpty();
            for (int i = 0; i < 300 && !game.isGameOver() && !(seen && game.getStack().isEmpty()); i++) {
                ph.mainLoopStep();
                seen |= !game.getStack().isEmpty();
            }
        });
        List<String> asked = new ArrayList<>();
        Input acted = null;
        long end = System.currentTimeMillis() + 30_000;
        while (!loop.isDone()) {
            if (System.currentTimeMillis() > end) {
                fail("game loop stuck; asked " + asked + "; input " + pch.getInputQueue().getInput());
            }
            JsonObject m = seat.inbox.poll(10, TimeUnit.MILLISECONDS);
            if (m != null && "prompt".equals(m.get("t").getAsString())) {
                fail("unexpected prompt " + m + "; asked " + asked);
            }
            Input in = pch.getInputQueue().getInput();
            if (in == null || in == acted || pch.getInputProxy().getInput() != in) {
                continue;
            }
            acted = in;
            if (in instanceof InputPassPriority && !game.getStack().isEmpty()) {
                String top = game.getStack().peek().getSpellAbility().getHostCard().getName();
                if (!passedByTheBridge(in)) {
                    asked.add(top);
                }
            } else if (in instanceof InputBlock) {
                asked.add("block");
            }
            action("selectButtonOk", null);
        }
        loop.get(1, TimeUnit.SECONDS);
        assertTrue(game.getStack().isEmpty(), "the stack resolved");
        game.getAction().checkStateEffects(true); // what the next priority would do
        assertEquals(SilentDefaults.count(), 0, "silent defaults: " + SilentDefaults.recent());
        return asked;
    }

    /**
     * The seat's priority input exists for a moment before the bridge passes it (the engine builds it, then the game
     * thread's wait runs the pass): it was asked only if it is still the seat's input after a grace period.
     */
    private boolean passedByTheBridge(Input in) throws InterruptedException {
        long end = System.currentTimeMillis() + 1500;
        while (pch.getInputQueue().getInput() == in && System.currentTimeMillis() < end) {
            Thread.sleep(10);
        }
        return pch.getInputQueue().getInput() != in;
    }

    @Test
    public void aSpellBetweenOpponentsIsPassedWhenOn() throws Exception {
        start(true);
        Card victim = add("Grizzly Bears", opps.get(1), ZoneType.Battlefield);
        cast(opps.get(0), "Lightning Bolt", victim);
        assertEquals(askedWithStack(), List.of(), "the seat was not asked");
        assertTrue(game.getCardState(victim).isInZone(ZoneType.Graveyard), "the bolt resolved on the other opponent's creature");
    }

    @Test
    public void aSpellBetweenOpponentsStillAsksTheSeatWhenOff() throws Exception {
        start(false);
        Card victim = add("Grizzly Bears", opps.get(1), ZoneType.Battlefield);
        cast(opps.get(0), "Lightning Bolt", victim);
        assertEquals(askedWithStack(), List.of("Lightning Bolt"), "asked, as before");
    }

    @Test
    public void aSpellAtAnotherOpponentsFaceIsPassed() throws Exception {
        start(true);
        cast(opps.get(0), "Lightning Bolt", opps.get(2));
        assertEquals(askedWithStack(), List.of());
        assertEquals(opps.get(2).getLife(), 17);
    }

    @Test
    public void aCreatureSpellBetweenOpponentsIsPassed() throws Exception {
        start(true);
        cast(opps.get(0), "Grizzly Bears");
        assertEquals(askedWithStack(), List.of());
    }

    /** The effect of a land's "when enters" trigger (its SVar), on the stack for the land's controller. */
    private void enterEffect(Player p, String land, String svar) {
        Card c = add(land, p, ZoneType.Battlefield);
        stackIt(c, AbilityFactory.getAbility(c.getSVar(svar), c), p);
    }

    @Test
    public void anEnterTriggerOfAnOpponentsLandIsPassed() throws Exception {
        start(true);
        enterEffect(opps.get(1), "Dismal Backwater", "TrigGainLife"); // "you gain 1 life": no Defined at all
        assertEquals(askedWithStack(), List.of());
        assertEquals(opps.get(1).getLife(), 21);
    }

    @Test
    public void anEnterTriggerThatBouncesTheOpponentsOwnLandIsPassed() throws Exception {
        start(true);
        add("Forest", opps.get(1), ZoneType.Battlefield);
        enterEffect(opps.get(1), "Gruul Turf", "TrigReturn"); // "return a land you control to its owner's hand"
        assertEquals(askedWithStack(), List.of());
    }

    /** A real trigger of an opponent's permanent, which only concerns that opponent: Phyrexian Arena draws and loses life for its controller. */
    @Test
    public void aTriggerThatOnlyConcernsItsControllerIsPassed() throws Exception {
        start(true);
        add("Phyrexian Arena", opps.get(0), ZoneType.Battlefield);
        assertEquals(askedWithStack(PhaseType.UPKEEP), List.of());
        assertEquals(opps.get(0).getLife(), 19, "the trigger resolved");
    }

    /** A real trigger whose effect reaches the seat ("each opponent loses 1 life"): the wrapped ability's parameters decide. */
    @Test
    public void aTriggerThatReachesTheSeatStops() throws Exception {
        start(true);
        add("Agent of Masks", opps.get(0), ZoneType.Battlefield);
        assertEquals(askedWithStack(PhaseType.UPKEEP), List.of("Agent of Masks"));
        assertTrue(me.getLife() < 20, "the trigger resolved: " + me.getLife());
    }

    /** A spell whose reach is in an SVar static ("your opponents can't cast spells this turn"): unsure, so it stops. */
    @Test
    public void anEffectWithStaticsStopsEvenWhenOn() throws Exception {
        start(true);
        cast(opps.get(0), "Silence");
        assertEquals(askedWithStack(), List.of("Silence"));
    }

    /** An ability of an opponent's permanent, written as the card scripts do, with no target. */
    private void opponentAbility(String script) {
        Card host = add("Howling Mine", opps.get(0), ZoneType.Battlefield);
        stackIt(host, AbilityFactory.getAbility(script, host), opps.get(0));
    }

    /** "Search your library for a basic land": the activator's library, not the seat's lands. */
    @Test
    public void aLibrarySearchBetweenOpponentsIsPassedWhateverTheSeatControls() throws Exception {
        start(true);
        add("Forest", me, ZoneType.Battlefield);
        opponentAbility("AB$ ChangeZone | Cost$ 0 | Origin$ Library | Destination$ Battlefield | ChangeType$ Land.Basic | Hidden$ True");
        assertEquals(askedWithStack(), List.of());
    }

    /** "Return a creature card from a graveyard": a shared zone, so the seat's graveyard is within reach. */
    @Test
    public void aGraveyardEffectThatCanTakeTheSeatsCardsStops() throws Exception {
        start(true);
        add("Grizzly Bears", me, ZoneType.Graveyard);
        opponentAbility("AB$ ChangeZone | Cost$ 0 | Origin$ Graveyard | Destination$ Battlefield | ChangeType$ Creature | Hidden$ True");
        assertEquals(askedWithStack(), List.of("Howling Mine"));
    }

    @Test
    public void aGraveyardEffectOnTheOpponentsOwnCardsIsPassed() throws Exception {
        start(true);
        add("Grizzly Bears", me, ZoneType.Graveyard);
        opponentAbility("AB$ ChangeZone | Cost$ 0 | Origin$ Graveyard | Destination$ Battlefield | ChangeType$ Creature.YouOwn | Hidden$ True");
        assertEquals(askedWithStack(), List.of());
    }

    @Test
    public void aSpellAtTheSeatStopsEvenWhenOn() throws Exception {
        start(true);
        cast(opps.get(0), "Lightning Bolt", me);
        assertEquals(askedWithStack(), List.of("Lightning Bolt"));
        assertEquals(me.getLife(), 17);
    }

    @Test
    public void aSpellAtTheSeatsCreatureStopsEvenWhenOn() throws Exception {
        start(true);
        Card mine = add("Grizzly Bears", me, ZoneType.Battlefield);
        cast(opps.get(0), "Lightning Bolt", mine);
        assertEquals(askedWithStack(), List.of("Lightning Bolt"));
    }

    @Test
    public void aWrathLikeEffectStopsEvenWhenOn() throws Exception {
        start(true);
        add("Grizzly Bears", me, ZoneType.Battlefield);
        cast(opps.get(0), "Wrath of God");
        assertEquals(askedWithStack(), List.of("Wrath of God"));
    }

    @Test
    public void anEffectOnEachOtherPlayerStopsEvenWhenOn() throws Exception {
        start(true);
        cast(opps.get(0), "Syphon Soul");
        assertEquals(askedWithStack(), List.of("Syphon Soul"));
        assertEquals(me.getLife(), 18);
    }

    @Test
    public void anAbilityBetweenOpponentsIsPassed() throws Exception {
        start(true);
        Card sorcerer = add("Prodigal Sorcerer", opps.get(0), ZoneType.Battlefield);
        activate(opps.get(0), sorcerer, opps.get(1));
        assertEquals(askedWithStack(), List.of());
        assertEquals(opps.get(1).getLife(), 19);
    }

    /** Howling Mine's draw, as its trigger resolves it: every player (a "Defined$ Player" effect, no targets). */
    @Test
    public void anAbilityThatAffectsEveryPlayerStopsEvenWhenOn() throws Exception {
        start(true);
        Card mine = add("Howling Mine", opps.get(0), ZoneType.Battlefield);
        stackIt(mine, AbilityFactory.getAbility("AB$ Draw | Cost$ 0 | Defined$ Player", mine), opps.get(0));
        assertEquals(askedWithStack(), List.of("Howling Mine"));
    }

    /** The same effect aimed only at the activator ("Defined$ You"): between opponents, passed. */
    @Test
    public void anAbilityOnItsOwnersOnlyIsPassed() throws Exception {
        start(true);
        Card mine = add("Howling Mine", opps.get(0), ZoneType.Battlefield);
        stackIt(mine, AbilityFactory.getAbility("AB$ Draw | Cost$ 0 | Defined$ You", mine), opps.get(0));
        assertEquals(askedWithStack(), List.of());
    }

    @Test
    public void theSeatsOwnSpellOnTheStackStopsEvenWhenAnOpponentRespondsBetweenOthers() throws Exception {
        start(true);
        Card victim = add("Grizzly Bears", opps.get(1), ZoneType.Battlefield);
        cast(me, "Lightning Bolt", victim);
        cast(opps.get(0), "Grizzly Bears");
        List<String> asked = askedWithStack();
        assertTrue(!asked.isEmpty(), "the seat kept its priority with its own spell on the stack: " + asked);
    }
}
