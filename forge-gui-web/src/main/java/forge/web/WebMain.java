package forge.web;

import java.io.File;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.EnumSet;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

import forge.deck.Deck;
import forge.deck.io.DeckSerializer;
import forge.game.GameRules;
import forge.game.GameType;
import forge.game.player.RegisteredPlayer;
import forge.gamemodes.match.HostedMatch;
import forge.gui.GuiBase;
import forge.localinstance.properties.ForgeConstants;
import forge.model.FModel;
import forge.player.GamePlayerUtil;
import forge.web.bridge.GameStream;
import forge.web.bridge.WebSpectatorGuiGame;
import forge.web.server.WebServer;

/**
 * Spike entry point: boots the engine headless, serves the viewer on one port and streams
 * AI-only games to it.
 *
 * <pre>
 * --mode duel|commander   1v1 constructed (default) or 4-player Commander
 * --decks a.dck,b.dck     deck files (duel: geneticaidecks, commander: quest/commanderprecons)
 * --games N               games to play in sequence (default 1)
 * --speed normal|fast     playback pauses (fast = 10x shorter)
 * --hidden redact|full    what viewers see of Library/Hand (default redact)
 * --port 7655  --assets forge-gui/  --home &lt;dir&gt;  --viewer &lt;dir&gt;
 * --wait-client SECONDS   wait for a WebSocket client before the first game
 * --exit                  stop the server after the last game
 * </pre>
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

    public static void main(String[] args) throws Exception {
        Map<String, String> opt = parse(args);
        Path moduleDir = Files.isDirectory(Paths.get("spike-viewer")) ? Paths.get(".") : Paths.get("forge-gui-web");
        String assets = opt.getOrDefault("assets", Files.isDirectory(Paths.get("../forge-gui/res")) ? "../forge-gui/" : "forge-gui/");
        if (!assets.endsWith("/")) {
            assets += "/";
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
        String label = opt.getOrDefault("label", (commander ? "commander4" : "duel") + "-" + hidden.name().toLowerCase());

        GameStream stream = new GameStream(hidden, moduleDir.resolve("target/spike-metrics"));
        stream.setLabel(label);
        GuiBase.setInterface(new HeadlessWebGui(assets, () -> new WebSpectatorGuiGame(stream, fast)));

        long t0 = System.nanoTime();
        FModel.initialize(null, null);
        long bootMs = (System.nanoTime() - t0) / 1_000_000;
        System.out.println("[web] card database ready in " + bootMs + " ms (user dir " + ForgeConstants.USER_DIR + ")");

        WebServer server = new WebServer(port, Paths.get(opt.getOrDefault("viewer", moduleDir.resolve("spike-viewer").toString())), stream);
        server.start();

        int waitClient = Integer.parseInt(opt.getOrDefault("wait-client", "0"));
        for (int i = 0; i < waitClient * 10 && stream.clientCount() == 0; i++) {
            Thread.sleep(100);
        }

        List<String> deckNames = opt.containsKey("decks") ? Arrays.asList(opt.get("decks").split(","))
                : commander ? DEFAULT_COMMANDER : DEFAULT_DUEL;
        File deckDir = new File(assets, commander ? "res/quest/commanderprecons" : "res/geneticaidecks");
        for (int g = 1; g <= games; g++) {
            long gs = System.currentTimeMillis();
            CountDownLatch over = startGame(commander, deckDir, deckNames, stream);
            if (!over.await(60, TimeUnit.MINUTES)) {
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

    private static CountDownLatch startGame(boolean commander, File deckDir, List<String> deckNames, GameStream stream) {
        GameType type = commander ? GameType.Commander : GameType.Constructed;
        List<RegisteredPlayer> players = new ArrayList<>();
        int i = 0;
        for (String name : deckNames) {
            Deck deck = DeckSerializer.fromFile(new File(deckDir, name));
            if (deck == null) {
                throw new IllegalArgumentException("cannot load deck " + new File(deckDir, name));
            }
            RegisteredPlayer rp = commander ? RegisteredPlayer.forCommander(deck) : new RegisteredPlayer(deck);
            rp.setPlayer(GamePlayerUtil.createAiPlayer("AI " + (i + 1) + " (" + deck.getName() + ")", i));
            players.add(rp);
            i++;
        }
        GameRules rules = new GameRules(type);
        rules.setAppliedVariants(EnumSet.of(type));
        rules.setGamesPerMatch(1);
        HostedMatch match = GuiBase.getInterface().hostMatch();
        // no human seat: HostedMatch attaches getNewGuiGame() as a spectator, which binds the stream
        match.startMatch(rules, null, players, (RegisteredPlayer) null, null);
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
