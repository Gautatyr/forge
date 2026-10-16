package forge.web.seat;

import static org.testng.Assert.assertEquals;
import static org.testng.Assert.assertTrue;

import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.EnumSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Random;
import java.util.Set;
import java.util.TreeSet;
import java.util.concurrent.ConcurrentLinkedQueue;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

import org.testng.annotations.Test;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;

import forge.deck.Deck;
import forge.deck.DeckSection;
import forge.deck.DeckgenUtil;
import forge.deck.io.DeckSerializer;
import forge.game.GameRules;
import forge.game.GameType;
import forge.game.player.RegisteredPlayer;
import forge.gamemodes.match.HostedMatch;
import forge.gui.GuiBase;
import forge.gui.interfaces.IGuiGame;
import forge.item.PaperCard;
import forge.localinstance.properties.ForgePreferences.FPref;
import forge.model.FModel;
import forge.player.GamePlayerUtil;
import forge.web.bridge.GameStream;
import forge.web.bridge.GameStream.HiddenPolicy;
import forge.web.bridge.visibility.TestEngine;

/**
 * Card-pool sweep (issue #46): full games with a {@link ScriptedSeat} human seat 0 against AIs, across many decks,
 * in strict mode ({@link SilentDefaults}). Each game asserts no silent default, no seat error, and that every trigger
 * the engine hands the seat reaches the stack (or has no legal target) and resolves ({@link TriggerAudit}).
 * Not a default test (no {@code Test} suffix): {@code make web-sweep} runs it. Properties ({@code -D}):
 * <pre>
 * forge.web.sweep.duel N         1v1 Constructed games, geneticaidecks for both seats (default 16)
 * forge.web.sweep.cmd2 N         1v1 Commander games (default 8)
 * forge.web.sweep.cmd4 N         4-player Commander games (default 12)
 * forge.web.sweep.ownerDecks DIR Commander decks played by the seat first, read only (default: none)
 * forge.web.sweep.seed S         deck choice (default 46)
 * forge.web.sweep.shard I/N      play only games I, I+N, I+2N... (default 0/1)
 * forge.web.sweep.only I,J,...   play only these game indices (default: all)
 * forge.web.sweep.out DIR        report (default target/sweep)
 * </pre>
 * The seat's Commander decks: each owner's deck in a 1v1 and a 4-player game, then Forge's Commander precons and
 * generated decks; Commander opponents get generated decks.
 */
public class HumanSeatSweep {

    private static final long GAME_MS = 15 * 60_000L;
    /** No event and no seat message for this long, or one turn for {@link #TURN_MS}: the game stopped moving. */
    private static final long HUNG_MS = 90_000L;
    private static final long TURN_MS = 150_000L;
    private static final String AI_LOOP = "AI loop";
    /** The game thread died in engine or AI code (no seat frame): an upstream bug, reported, not failed. */
    private static final String ENGINE_EXCEPTION = "engine exception";

    /** One planned game. */
    private record Plan(int index, String mode, int players, Deck seatDeck, String seatSource, List<Deck> opponents) { }

    /** One game's report. */
    @SuppressWarnings("unused")
    private static final class Result {
        int index;
        String mode;
        int players;
        String seatDeck;
        String seatSource;
        List<String> opponents = new ArrayList<>();
        String end;
        /** For a game that stopped moving: the game thread's top frames. */
        List<String> stalledAt = new ArrayList<>();
        boolean capped;
        int turns;
        long seconds;
        long silentDefaults;
        List<String> silent = new ArrayList<>();
        List<String> seatErrors = new ArrayList<>();
        List<String> crashes = new ArrayList<>();
        /** Exceptions on other threads (e.g. the headless EDT refreshing highlights): reported, not failed. */
        List<String> otherThreadCrashes = new ArrayList<>();
        int triggersHanded;
        int triggersOnStack;
        int staticTriggersPlayed;
        int triggersWithoutLegalTarget;
        int triggersAfterGameOver;
        int triggersResolved;
        int triggersStillOnStackAtEnd;
        List<String> droppedTriggers = new ArrayList<>();
        List<String> unresolvedTriggers = new ArrayList<>();
        List<String> noTargetTriggers = new ArrayList<>();
        Set<String> triggerCards = new TreeSet<>();
        Set<String> playedCards = new TreeSet<>();
        int spellsCast;
        int abilitiesActivated;
        int landsPlayed;
        Map<String, Integer> prompts = new LinkedHashMap<>();
        Map<String, Integer> promptTexts = new LinkedHashMap<>();
        Map<String, Integer> actions = new LinkedHashMap<>();
        Set<String> seatDeckCards = new TreeSet<>();

        boolean passed() {
            return ("finished".equals(end) || AI_LOOP.equals(end) || ENGINE_EXCEPTION.equals(end)) && silentDefaults == 0 && seatErrors.isEmpty()
                    && crashes.stream().noneMatch(c -> c.contains("at forge.web."))
                    && droppedTriggers.isEmpty() && unresolvedTriggers.isEmpty();
        }
    }

    private final ConcurrentLinkedQueue<String> crashes = new ConcurrentLinkedQueue<>();

    @Test
    public void sweep() throws Exception {
        TestEngine.boot(false);
        FModel.getPreferences().setPref(FPref.PLAYER_NAME, "You");
        FModel.getPreferences().setPref(FPref.UI_SHOW_ACTIONABLE_HIGHLIGHTS, true);
        SilentDefaults.setStrict(true);
        Thread.setDefaultUncaughtExceptionHandler((t, e) -> {
            if (e instanceof ThreadDeath) {
                return; // halt() stopping an abandoned game
            }
            StringBuilder sb = new StringBuilder(t.getName() + ": " + e);
            StackTraceElement[] st = e.getStackTrace();
            for (int i = 0; i < Math.min(st.length, 60); i++) {
                sb.append("\n    at ").append(st[i]);
            }
            crashes.add(sb.toString());
            System.err.println("[sweep] crash " + sb);
        });

        List<Plan> plans = plan();
        String[] shard = System.getProperty("forge.web.sweep.shard", "0/1").split("/");
        int si = Integer.parseInt(shard[0]);
        int sn = Integer.parseInt(shard[1]);
        Path out = Paths.get(System.getProperty("forge.web.sweep.out", "target/sweep"));
        Files.createDirectories(out);
        List<Result> results = new ArrayList<>();
        Set<String> only = new TreeSet<>(Arrays.asList(System.getProperty("forge.web.sweep.only", "").split(",")));
        only.remove("");
        for (Plan p : plans) {
            if (p.index() % sn != si || !only.isEmpty() && !only.contains(String.valueOf(p.index()))) {
                continue;
            }
            Result r = play(p);
            results.add(r);
            System.out.println("[sweep] game " + r.index + " " + r.mode + " " + r.players + "p seat deck \"" + r.seatDeck + "\": " + r.end
                    + ", " + r.turns + " turns, " + r.seconds + " s, triggers " + r.triggersHanded + " handed / " + r.triggersOnStack + " on stack / "
                    + r.staticTriggersPlayed + " static / " + r.triggersWithoutLegalTarget + " no target / " + r.triggersResolved + " resolved"
                    + (r.passed() ? "" : " FAILED: silent " + r.silent + " errors " + r.seatErrors + " crashes " + r.crashes
                            + " dropped " + r.droppedTriggers + " unresolved " + r.unresolvedTriggers));
            Files.writeString(out.resolve("report-" + si + "of" + sn + ".json"), report(results), StandardCharsets.UTF_8);
        }
        String summary = summary(results);
        System.out.println(summary);
        Files.writeString(out.resolve("summary-" + si + "of" + sn + ".txt"), summary, StandardCharsets.UTF_8);
        List<String> failed = results.stream().filter(r -> !r.passed()).map(r -> "game " + r.index + " (" + r.seatDeck + "): " + r.end).toList();
        assertTrue(failed.isEmpty(), "failed games: " + failed + " (report in " + out + ")");
        assertEquals(results.stream().mapToLong(r -> r.silentDefaults).sum(), 0L);
    }

    // --- planning ---

    private static Path res() {
        return Files.isDirectory(Paths.get("../forge-gui/res")) ? Paths.get("../forge-gui/res") : Paths.get("forge-gui/res");
    }

    private static List<File> dcks(Path dir) {
        File[] fs = dir.toFile().listFiles((d, n) -> n.endsWith(".dck"));
        List<File> l = fs == null ? new ArrayList<>() : new ArrayList<>(Arrays.asList(fs));
        Collections.sort(l);
        return l;
    }

    private static Deck load(File f) {
        Deck d = DeckSerializer.fromFile(f);
        if (d == null) {
            throw new IllegalArgumentException("cannot load deck " + f);
        }
        return d;
    }

    private static List<Plan> plan() {
        Random rnd = new Random(Long.getLong("forge.web.sweep.seed", 46L));
        int duels = Integer.getInteger("forge.web.sweep.duel", 16);
        int cmd2 = Integer.getInteger("forge.web.sweep.cmd2", 8);
        int cmd4 = Integer.getInteger("forge.web.sweep.cmd4", 12);
        List<File> genetic = dcks(res().resolve("geneticaidecks"));
        List<File> precons = dcks(res().resolve("quest/commanderprecons"));
        Collections.shuffle(genetic, rnd);
        Collections.shuffle(precons, rnd);
        String owner = System.getProperty("forge.web.sweep.ownerDecks", "");
        List<File> ownerDecks = owner.isEmpty() ? List.of() : dcks(Paths.get(owner));

        List<Plan> plans = new ArrayList<>();
        int g = 0;
        for (int i = 0; i < duels; i++) {
            plans.add(new Plan(g++, "duel", 2, load(genetic.get(2 * i % genetic.size())), "geneticaidecks",
                    List.of(load(genetic.get((2 * i + 1) % genetic.size())))));
        }
        // each owner deck once in 1v1 and once in 4-player Commander, then precons and generated decks, alternating
        int precon = 0;
        for (int players : new int[] {2, 4}) {
            int total = players == 2 ? cmd2 : cmd4;
            for (int i = 0; i < total; i++) {
                Deck seat;
                String source;
                if (i < ownerDecks.size()) {
                    seat = load(ownerDecks.get(i));
                    source = "owner";
                } else if (i % 2 == 0 && precon < precons.size()) {
                    seat = load(precons.get(precon++));
                    source = "precon";
                } else {
                    seat = DeckgenUtil.generateCommanderDeck(true, GameType.Commander);
                    source = "generated";
                }
                List<Deck> opp = new ArrayList<>();
                for (int k = 1; k < players; k++) {
                    opp.add(DeckgenUtil.generateCommanderDeck(true, GameType.Commander));
                }
                plans.add(new Plan(g++, "commander", players, seat, source, opp));
            }
        }
        return plans;
    }

    // --- one game ---

    private Result play(Plan p) throws Exception {
        Result r = new Result();
        r.index = p.index();
        r.mode = p.mode();
        r.players = p.players();
        r.seatDeck = p.seatDeck().getName();
        r.seatSource = p.seatSource();
        for (Deck d : p.opponents()) {
            r.opponents.add(d.getName());
        }
        for (DeckSection s : new DeckSection[] {DeckSection.Main, DeckSection.Commander}) {
            if (p.seatDeck().has(s)) {
                for (Map.Entry<PaperCard, Integer> e : p.seatDeck().get(s)) {
                    r.seatDeckCards.add(e.getKey().getName());
                }
            }
        }
        boolean commander = !"duel".equals(p.mode());
        crashes.clear();
        SilentDefaults.reset();
        long t0 = System.currentTimeMillis();

        GameStream stream = new GameStream(HiddenPolicy.REDACT, null);
        WebSeats seats = new WebSeats(stream, new WebSeats.Timeouts(120_000, 120_000));
        TriggerAudit audit = new TriggerAudit(commander ? 40 : 30);
        List<RegisteredPlayer> players = new ArrayList<>();
        Map<RegisteredPlayer, IGuiGame> guis = new LinkedHashMap<>();
        RegisteredPlayer human = commander ? RegisteredPlayer.forCommander(p.seatDeck()) : new RegisteredPlayer(p.seatDeck());
        human.setPlayer(new TriggerAudit.Human(audit));
        WebGuiGame gui = seats.newSeat(0);
        guis.put(human, gui);
        players.add(human);
        for (int i = 0; i < p.opponents().size(); i++) {
            Deck d = p.opponents().get(i);
            RegisteredPlayer rp = commander ? RegisteredPlayer.forCommander(d) : new RegisteredPlayer(d);
            rp.setPlayer(GamePlayerUtil.createAiPlayer("AI " + (i + 1), i + 1));
            players.add(rp);
        }
        GameType type = commander ? GameType.Commander : GameType.Constructed;
        GameRules rules = new GameRules(type);
        rules.setAppliedVariants(EnumSet.of(type));
        rules.setGamesPerMatch(1);

        // the client connects first, as a browser waiting for the game; it learns the game from the audit
        DeferredSeat client = new DeferredSeat(stream, audit);
        stream.addClient(client, 0);
        HostedMatch match = GuiBase.getInterface().hostMatch();
        match.startMatch(rules, null, players, guis, null);
        client.begin();
        CountDownLatch over = stream.gameOverLatch();
        long lastActivity = System.currentTimeMillis();
        int lastTurn = -1;
        String end = null;
        while (end == null) {
            if (over.await(500, TimeUnit.MILLISECONDS)) {
                end = "finished";
            } else if (SilentDefaults.count() > 0) {
                end = "silent default";
            } else if (crashes.stream().anyMatch(c -> c.startsWith("Game"))) {
                // an exception in seat code fails; one in engine or AI code (no forge.web frame) is an engine exception
                end = crashes.stream().anyMatch(c -> c.startsWith("Game") && c.contains("at forge.web.")) ? "crashed" : ENGINE_EXCEPTION;
            } else if (client.seat() != null && client.seat().errors.stream().anyMatch(e -> e.startsWith("input stuck") || e.startsWith("seat driver"))) {
                end = "seat stuck";
            } else if (System.currentTimeMillis() - t0 > GAME_MS) {
                end = "timed out";
            } else {
                int turn = audit.game() == null ? -1 : audit.game().getPhaseHandler().getTurn();
                long seen = Math.max(client.lastMessageAt(), audit.lastEventAt);
                if (turn != lastTurn) {
                    lastTurn = turn;
                    lastActivity = System.currentTimeMillis();
                } else if (System.currentTimeMillis() - Math.max(lastActivity, seen) > HUNG_MS
                        || System.currentTimeMillis() - lastActivity > TURN_MS) {
                    end = stalled(r);
                }
            }
        }
        r.seconds = (System.currentTimeMillis() - t0) / 1000;
        // the game's own silent defaults; abandoning a game closes the seat, whose open prompts then report too
        r.silentDefaults = SilentDefaults.count();
        if ("finished".equals(end)) {
            Thread.sleep(200); // trailing calls
        } else {
            forge.game.Game g = audit.game();
            if (g != null) {
                StringBuilder sb = new StringBuilder("game: over " + g.isGameOver() + ", turn " + g.getPhaseHandler().getTurn() + " "
                        + g.getPhaseHandler().getPhase() + " of " + g.getPhaseHandler().getPlayerTurn() + ", stack " + g.getStack().size());
                for (forge.game.player.Player pl : g.getRegisteredPlayers()) {
                    sb.append("; ").append(pl).append(" life ").append(pl.getLife()).append(pl.hasLost() ? " lost" : "");
                }
                r.stalledAt.add(0, sb.toString());
            }
            if (client.seat() != null) {
                r.stalledAt.add(1, "seat: " + client.seat().state());
            }
            halt();
            gui.close();
        }
        r.end = end;
        r.capped = audit.capped;
        r.turns = audit.game() == null ? 0 : audit.game().getPhaseHandler().getTurn();
        if (audit.game() != null && audit.game().isGameOver()) {
            audit.finish();
        }
        ScriptedSeat seat = client.seat();
        if (seat != null) {
            seat.stop();
            r.seatErrors.addAll(seat.errors);
            r.prompts.putAll(seat.prompts);
            r.promptTexts.putAll(seat.promptTexts);
            r.actions.putAll(seat.actions);
        }
        stream.removeClient(client);
        r.silent.addAll(SilentDefaults.recent());
        for (String c : crashes) {
            (c.startsWith("Game") ? r.crashes : r.otherThreadCrashes).add(c);
        }
        r.triggersHanded = audit.handed;
        r.triggersOnStack = audit.onStack;
        r.staticTriggersPlayed = audit.noStackPlayed;
        r.triggersWithoutLegalTarget = audit.noLegalTarget;
        r.triggersAfterGameOver = audit.afterGameOver;
        r.triggersResolved = audit.resolved;
        r.triggersStillOnStackAtEnd = audit.stillOnStackAtEnd;
        r.droppedTriggers.addAll(audit.dropped);
        r.unresolvedTriggers.addAll(audit.unresolved);
        r.noTargetTriggers.addAll(audit.noTargetCards);
        r.triggerCards.addAll(audit.triggerCards);
        r.playedCards.addAll(audit.playedCards);
        r.spellsCast = audit.spellsCast;
        r.abilitiesActivated = audit.abilitiesActivated;
        r.landsPlayed = audit.landsPlayed;
        return r;
    }

    /**
     * The engine's game threads ({@code ThreadUtil}'s cached "Game" pool) that run Forge code. A game hops between
     * pool threads ({@code invokeInGameThread}), so no single thread is "the" game thread.
     */
    private static Map<Thread, StackTraceElement[]> gameThreads() {
        return forgeThreads("Game");
    }

    /** Threads whose name starts with one of {@code prefixes} and that run Forge code. */
    private static Map<Thread, StackTraceElement[]> forgeThreads(String... prefixes) {
        Map<Thread, StackTraceElement[]> busy = new LinkedHashMap<>();
        for (Map.Entry<Thread, StackTraceElement[]> e : Thread.getAllStackTraces().entrySet()) {
            if (Arrays.stream(prefixes).anyMatch(e.getKey().getName()::startsWith)
                    && Arrays.stream(e.getValue()).anyMatch(f -> f.getClassName().startsWith("forge."))) {
                busy.put(e.getKey(), e.getValue());
            }
        }
        return busy;
    }

    /**
     * A game that stopped moving: an AI loop (a running game thread in AI code and no game thread in seat or input
     * code: an upstream AI bug, not the seat's; the game is abandoned, not failed), or hung (waiting on the seat, or
     * looping in seat or input code).
     */
    private static String stalled(Result r) {
        boolean aiRunning = false;
        boolean seat = false;
        for (Map.Entry<Thread, StackTraceElement[]> e : forgeThreads("web-").entrySet()) {
            r.stalledAt.add(e.getKey().getName() + " " + e.getKey().getState() + ":");
            Arrays.stream(e.getValue()).limit(30).forEach(f -> r.stalledAt.add("  " + f));
        }
        for (Map.Entry<Thread, StackTraceElement[]> e : gameThreads().entrySet()) {
            StackTraceElement[] st = e.getValue();
            boolean ai = false;
            r.stalledAt.add(e.getKey().getName() + " " + e.getKey().getState() + ":");
            for (int i = 0; i < st.length; i++) {
                String c = st[i].getClassName();
                ai |= c.startsWith("forge.ai.");
                seat |= c.startsWith("forge.player.") || c.startsWith("forge.web.") || c.startsWith("forge.gamemodes.match.input.");
                if (i < 30) {
                    r.stalledAt.add("  " + st[i]);
                }
            }
            aiRunning |= ai && e.getKey().getState() == Thread.State.RUNNABLE;
        }
        return aiRunning && !seat ? AI_LOOP : "hung";
    }

    /** Stops an abandoned game's threads (JDK 17 {@code Thread.stop}), so a looping AI does not keep a core busy. */
    @SuppressWarnings({"deprecation", "removal"})
    private static void halt() {
        for (Thread gt : gameThreads().keySet()) {
            try {
                gt.stop();
            } catch (UnsupportedOperationException e) {
                System.err.println("[sweep] cannot stop " + gt.getName() + ": " + e);
            }
        }
    }

    /** Connects before the game exists; starts its {@link ScriptedSeat} once the audit knows the game and the player. */
    private static final class DeferredSeat implements forge.web.bridge.ClientSink {
        private final GameStream stream;
        private final TriggerAudit audit;
        private final List<String> early = new ArrayList<>();
        private volatile ScriptedSeat seat;

        DeferredSeat(GameStream stream, TriggerAudit audit) {
            this.stream = stream;
            this.audit = audit;
        }

        @Override
        public synchronized void send(String json) {
            if (seat == null) {
                early.add(json);
            } else {
                seat.send(json);
            }
        }

        synchronized void begin() {
            ScriptedSeat s = new ScriptedSeat(stream, audit.game(), audit.me(), this);
            for (String m : early) {
                s.send(m);
            }
            early.clear();
            seat = s;
            s.start();
        }

        ScriptedSeat seat() {
            return seat;
        }

        long lastMessageAt() {
            ScriptedSeat s = seat;
            return s == null ? 0 : s.lastMessageAt();
        }
    }

    // --- reporting ---

    private static String report(List<Result> results) {
        Gson gson = new GsonBuilder().setPrettyPrinting().disableHtmlEscaping().create();
        return gson.toJson(results);
    }

    /** Merges the shards' reports in {@code args[0]} (default target/sweep) and prints the summary. */
    public static void main(String[] args) throws IOException {
        Path dir = Paths.get(args.length > 0 ? args[0] : "target/sweep");
        List<Result> all = new ArrayList<>();
        try (java.util.stream.Stream<Path> files = Files.list(dir)) {
            for (Path f : files.filter(f -> f.getFileName().toString().matches("report-.*\\.json")).sorted().toList()) {
                all.addAll(Arrays.asList(new Gson().fromJson(Files.readString(f), Result[].class)));
            }
        }
        all.sort(java.util.Comparator.comparingInt(r -> r.index));
        String summary = summary(all);
        Files.writeString(dir.resolve("summary.txt"), summary + "\n", StandardCharsets.UTF_8);
        System.out.println(summary);
    }

    private static String summary(List<Result> results) {
        Set<String> decks = new TreeSet<>();
        Set<String> seatDecks = new TreeSet<>();
        Set<String> seatCards = new TreeSet<>();
        Set<String> played = new TreeSet<>();
        Set<String> triggerCards = new TreeSet<>();
        int handed = 0;
        int onStack = 0;
        int stat = 0;
        int noTarget = 0;
        int afterOver = 0;
        int dropped = 0;
        int resolved = 0;
        int stillOnStack = 0;
        int unresolved = 0;
        int spells = 0;
        int abilities = 0;
        int lands = 0;
        long silent = 0;
        int passed = 0;
        int other = 0;
        int capped = 0;
        List<String> aiLoops = new ArrayList<>();
        List<String> engineExceptions = new ArrayList<>();
        List<String> failed = new ArrayList<>();
        Map<String, Integer> byMode = new LinkedHashMap<>();
        Map<String, Integer> prompts = new java.util.TreeMap<>();
        Map<String, Integer> actions = new java.util.TreeMap<>();
        for (Result r : results) {
            byMode.merge(r.mode + " " + r.players + "p", 1, Integer::sum);
            decks.add(r.seatDeck);
            decks.addAll(r.opponents);
            seatDecks.add(r.seatSource + ": " + r.seatDeck);
            seatCards.addAll(r.seatDeckCards);
            played.addAll(r.playedCards);
            triggerCards.addAll(r.triggerCards);
            handed += r.triggersHanded;
            onStack += r.triggersOnStack;
            stat += r.staticTriggersPlayed;
            noTarget += r.triggersWithoutLegalTarget;
            afterOver += r.triggersAfterGameOver;
            dropped += r.droppedTriggers.size();
            resolved += r.triggersResolved;
            stillOnStack += r.triggersStillOnStackAtEnd;
            unresolved += r.unresolvedTriggers.size();
            spells += r.spellsCast;
            abilities += r.abilitiesActivated;
            lands += r.landsPlayed;
            silent += r.silentDefaults;
            other += r.otherThreadCrashes.size();
            capped += r.capped ? 1 : 0;
            passed += r.passed() ? 1 : 0;
            if (AI_LOOP.equals(r.end)) {
                aiLoops.add("game " + r.index + " turn " + r.turns);
            }
            if (ENGINE_EXCEPTION.equals(r.end)) {
                engineExceptions.add("game " + r.index + " turn " + r.turns + ": " + r.crashes.get(0).lines().limit(4).toList());
            }
            if (!r.passed()) {
                failed.add("game " + r.index + " (" + r.seatDeck + "): " + r.end);
            }
            r.prompts.forEach((k, v) -> prompts.merge(k, v, Integer::sum));
            r.actions.forEach((k, v) -> actions.merge(k, v, Integer::sum));
        }
        return "[sweep] games " + results.size() + " " + byMode + ": passed " + passed + ", failed " + failed
                + "; ended at the turn cap " + capped + "\n[sweep] not failed: AI loops " + aiLoops + "; engine exceptions " + engineExceptions
                + "\n[sweep] decks " + decks.size() + "; the seat's " + seatDecks.size() + ": " + seatDecks
                + "\n[sweep] distinct cards: in the seat's decks " + seatCards.size() + ", played by the seat " + played.size()
                + ", with seat triggers " + triggerCards.size()
                + "\n[sweep] the seat cast " + spells + " spells, activated " + abilities + " abilities (stack), played " + lands + " lands"
                + "\n[sweep] seat triggers: " + handed + " handed to the seat, " + onStack + " on the stack, " + stat + " static (no stack), "
                + noTarget + " without legal target, " + afterOver + " handed as the game ended, " + dropped + " dropped; of those on the stack "
                + resolved + " resolved or removed, " + stillOnStack + " still there at game over, " + unresolved + " lost"
                + "\n[sweep] silent defaults " + silent + "; exceptions outside the game thread (not failed) " + other
                + "\n[sweep] prompts " + prompts + "\n[sweep] seat actions " + actions;
    }
}
