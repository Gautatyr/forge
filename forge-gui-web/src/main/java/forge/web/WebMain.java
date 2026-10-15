package forge.web;

import java.io.File;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.EnumSet;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

import forge.deck.Deck;
import forge.deck.DeckgenUtil;
import forge.deck.io.DeckSerializer;
import forge.game.GameRules;
import forge.game.GameType;
import forge.game.player.RegisteredPlayer;
import forge.gamemodes.match.HostedMatch;
import forge.gui.GuiBase;
import forge.gui.interfaces.IGuiGame;
import forge.localinstance.properties.ForgeConstants;
import forge.localinstance.properties.ForgePreferences.FPref;
import forge.model.FModel;
import forge.player.GamePlayerUtil;
import forge.player.LobbyPlayerHuman;
import forge.web.bridge.GameStream;
import forge.web.bridge.WebSpectatorGuiGame;
import forge.web.seat.WebSeats;
import forge.web.server.AccessPolicy;
import forge.web.server.StreamHub;
import forge.web.server.WebServer;

/**
 * Dev entry point: boots the engine headless, serves the viewer on one port and runs games: AI only
 * (streamed to spectators), or with one human seat played over the WebSocket.
 *
 * <pre>
 * --mode duel|commander   1v1 constructed (default) or Commander
 * --players N             player count (default: duel 2, commander 4)
 * --human-seat K          deck slot K is played by a human over the WebSocket (no Swing app);
 *                         the human is seat 0 of the game (HostedMatch puts humans first)
 * --deckK path.dck        deck file of slot K (read only); a missing slot falls back to --decks, then to
 *                         the defaults (duel: geneticaidecks; commander: generated Commander decks)
 * --decks a.dck,b.dck     deck names in the default deck folder (duel: geneticaidecks, commander: quest/commanderprecons)
 * --life N                starting life of every player (commander default 40)
 * --prompt-timeout S      seconds a human prompt waits for an answer before the engine default (default 900)
 * --disconnect-grace S    seconds an open prompt waits for a disconnected seat to come back (default 60)
 * --games N               games to play in sequence (default 1)
 * --speed normal|fast     spectator playback pauses (fast = 10x shorter; AI-only games)
 * --hidden redact|full    redact: each seat sees what the engine lets that player see, the
 *                         spectator what every player may see (default); full: omniscient, debug only
 * --port 7655  --assets forge-gui/  --home &lt;dir&gt;  --viewer &lt;dir&gt;
 * --wait-client SECONDS   wait for a client (the human seat's, if any) before the first game
 * --exit                  stop the server after the last game
 * </pre>
 * Every view has its own per-launch token, printed once: the spectator's as "[web] serving URL",
 * each seat's as "[web] seat N (...): URL". A token opens only its own view.
 */
public final class WebMain {

    private static final List<String> DEFAULT_DUEL = Arrays.asList(
            "GAL_19_18_Burn Red Burn-sligh Generated Deck_27_18.dck",
            "GAL_1_28_Legacy Merfolk Merfolks Generated Deck_5_19.dck");
    private static final List<String> DEFAULT_COMMANDER = Arrays.asList(
            "Draconic Domination [C17] [2017].dck",
            "Feline Ferocity [C17] [2017].dck",
            "Arcane Maelstrom [C20] [2020].dck",
            "Enhanced Evolution [C20] [2020].dck");

    private WebMain() { }

    /** One player of the match, in seat order. */
    private record Slot(int slot, Deck deck, boolean human) { }

    public static void main(String[] args) throws Exception {
        Map<String, String> opt = parse(args);
        Path moduleDir = Files.isDirectory(Paths.get("spike-viewer")) ? Paths.get(".") : Paths.get("forge-gui-web");
        String assets = opt.getOrDefault("assets", Files.isDirectory(Paths.get("../forge-gui/res")) ? "../forge-gui/" : "forge-gui/");
        if (!assets.endsWith("/")) {
            assets += "/";
        }
        // Deck paths are resolved before user.home moves (a relative or ~ path names the caller's files)
        Map<Integer, File> deckFiles = new HashMap<>();
        for (Map.Entry<String, String> e : opt.entrySet()) {
            if (e.getKey().matches("deck\\d+")) {
                deckFiles.put(Integer.parseInt(e.getKey().substring(4)), deckFile(e.getValue()));
            }
        }
        // Isolated profile: the engine derives its user dir (~/.forge) from user.home. Never touch the real one.
        Path home = Paths.get(opt.getOrDefault("home", moduleDir.resolve("target/forge-home").toString())).toAbsolutePath();
        Files.createDirectories(home);
        System.setProperty("user.home", home.toString());
        System.setProperty("java.awt.headless", "true");
        System.setProperty("java.util.Arrays.useLegacyMergeSort", "true");

        boolean commander = "commander".equals(opt.get("mode"));
        boolean fast = "fast".equals(opt.get("speed"));
        GameStream.HiddenPolicy hidden = "full".equals(opt.get("hidden")) ? GameStream.HiddenPolicy.FULL : GameStream.HiddenPolicy.REDACT;
        int port = Integer.parseInt(opt.getOrDefault("port", "7655"));
        int games = Integer.parseInt(opt.getOrDefault("games", "1"));
        int playerCount = Integer.parseInt(opt.getOrDefault("players", commander ? "4" : "2"));
        int humanSlot = opt.containsKey("human-seat") ? Integer.parseInt(opt.get("human-seat")) : -1;
        if (humanSlot >= playerCount) {
            throw new IllegalArgumentException("--human-seat " + humanSlot + " but only " + playerCount + " players");
        }
        String label = opt.getOrDefault("label", (commander ? "commander" + playerCount : "duel") + "-" + hidden.name().toLowerCase());

        GameStream stream = new GameStream(hidden, moduleDir.resolve("target/spike-metrics"));
        stream.setLabel(label);
        GuiBase.setInterface(new HeadlessWebGui(assets, () -> new WebSpectatorGuiGame(stream, fast)));
        WebSeats seats = new WebSeats(stream, new WebSeats.Timeouts(
                1000L * Long.parseLong(opt.getOrDefault("prompt-timeout", "900")),
                1000L * Long.parseLong(opt.getOrDefault("disconnect-grace", "60"))));

        long t0 = System.nanoTime();
        FModel.initialize(null, null);
        long bootMs = (System.nanoTime() - t0) / 1_000_000;
        System.out.println("[web] card database ready in " + bootMs + " ms (user dir " + ForgeConstants.USER_DIR + ")");
        // a blank name makes HostedMatch ask for one through a dialog
        FModel.getPreferences().setPref(FPref.PLAYER_NAME, "You");

        // with --deckK files and no --decks, the other Commander slots get generated decks, not the precons
        List<String> deckNames = opt.containsKey("decks") ? Arrays.asList(opt.get("decks").split(","))
                : !commander ? DEFAULT_DUEL : deckFiles.isEmpty() ? DEFAULT_COMMANDER : List.of();
        File deckDir = new File(assets, commander ? "res/quest/commanderprecons" : "res/geneticaidecks");
        List<Slot> slots = new ArrayList<>();
        for (int i = 0; i < playerCount; i++) {
            slots.add(new Slot(i, loadDeck(i, deckFiles, deckNames, deckDir, commander), i == humanSlot));
        }
        // seat order = the game's player order: HostedMatch sorts human players first (stable)
        slots.sort((a, b) -> Boolean.compare(b.human(), a.human()));

        // per-launch tokens, printed once and never stored: the spectator's first (the page URL), then one per seat
        Map<String, Integer> tokens = new LinkedHashMap<>();
        tokens.put(AccessPolicy.newToken(), GameStream.SPECTATOR);
        List<String> seatTokens = new ArrayList<>();
        for (int s = 0; s < slots.size(); s++) {
            String t = AccessPolicy.newToken();
            tokens.put(t, s);
            seatTokens.add(t);
        }
        WebServer server = new WebServer(port, Paths.get(opt.getOrDefault("viewer", moduleDir.resolve("spike-viewer").toString())),
                StreamHub.of(stream), tokens);
        server.start();
        for (int s = 0; s < slots.size(); s++) {
            Slot sl = slots.get(s);
            System.out.println("[web] seat " + s + " (" + (sl.human() ? "human" : "AI") + ", deck" + sl.slot() + " " + sl.deck().getName()
                    + "): " + server.pageUrl(seatTokens.get(s)));
        }

        boolean withHuman = humanSlot >= 0;
        int waitClient = Integer.parseInt(opt.getOrDefault("wait-client", "0"));
        for (int i = 0; i < waitClient * 10 && (withHuman ? stream.seatClientCount(0) : stream.clientCount()) == 0; i++) {
            Thread.sleep(100);
        }

        for (int g = 1; g <= games; g++) {
            long gs = System.currentTimeMillis();
            CountDownLatch over = startGame(commander, slots, opt.containsKey("life") ? Integer.parseInt(opt.get("life")) : -1, stream, seats);
            if (!over.await(120, TimeUnit.MINUTES)) {
                System.out.println("[web] game " + g + " timed out");
            }
            System.out.println("[web] game " + g + " finished in " + (System.currentTimeMillis() - gs) + " ms");
            for (String m : stream.describe()) {
                System.out.println("[web] metrics " + m);
            }
        }
        if (opt.containsKey("exit")) {
            Thread.sleep(1000); // let the final delta leave
            server.stop();
            System.exit(0);
        }
        System.out.println("[web] games done; still serving (Ctrl+C to stop)");
    }

    private static File deckFile(String path) {
        if (path.startsWith("~/")) {
            path = System.getProperty("user.home") + path.substring(1);
        }
        return new File(path).getAbsoluteFile();
    }

    private static Deck loadDeck(int slot, Map<Integer, File> deckFiles, List<String> deckNames, File deckDir, boolean commander) {
        File f = deckFiles.get(slot);
        if (f == null && slot < deckNames.size()) {
            f = new File(deckDir, deckNames.get(slot));
        }
        if (f != null) {
            Deck deck = DeckSerializer.fromFile(f);
            if (deck == null) {
                throw new IllegalArgumentException("cannot load deck " + f);
            }
            return deck;
        }
        if (!commander) {
            throw new IllegalArgumentException("no deck for slot " + slot + ": pass --deck" + slot);
        }
        Deck deck = DeckgenUtil.generateCommanderDeck(true, GameType.Commander);
        System.out.println("[web] slot " + slot + ": generated Commander deck " + deck.getName());
        return deck;
    }

    private static CountDownLatch startGame(boolean commander, List<Slot> slots, int life, GameStream stream, WebSeats seats) {
        GameType type = commander ? GameType.Commander : GameType.Constructed;
        List<RegisteredPlayer> players = new ArrayList<>();
        Map<RegisteredPlayer, IGuiGame> guis = new LinkedHashMap<>();
        for (int s = 0; s < slots.size(); s++) {
            Slot sl = slots.get(s);
            RegisteredPlayer rp = commander ? RegisteredPlayer.forCommander(sl.deck()) : new RegisteredPlayer(sl.deck());
            if (life > 0) {
                rp.setStartingLife(life);
            }
            if (sl.human()) {
                rp.setPlayer(new LobbyPlayerHuman("You"));
                guis.put(rp, seats.newSeat(s));
            } else {
                rp.setPlayer(GamePlayerUtil.createAiPlayer("AI " + s + " (" + sl.deck().getName() + ")", s));
            }
            players.add(rp);
        }
        GameRules rules = new GameRules(type);
        rules.setAppliedVariants(EnumSet.of(type));
        rules.setGamesPerMatch(1);
        HostedMatch match = GuiBase.getInterface().hostMatch();
        // no human seat: HostedMatch attaches getNewGuiGame() as a spectator, which binds the stream;
        // a human seat's WebGuiGame binds it in openView
        match.startMatch(rules, null, players, guis.isEmpty() ? null : guis, null);
        return stream.gameOverLatch();
    }

    private static Map<String, String> parse(String[] args) {
        Map<String, String> m = new HashMap<>();
        for (int i = 0; i < args.length; i++) {
            if (!args[i].startsWith("--")) {
                continue;
            }
            String k = args[i].substring(2);
            if (i + 1 < args.length && !args[i + 1].startsWith("--")) {
                m.put(k, args[++i]);
            } else {
                m.put(k, "true");
            }
        }
        return m;
    }
}
