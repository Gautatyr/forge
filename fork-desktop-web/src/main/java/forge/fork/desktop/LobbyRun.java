package forge.fork.desktop;

import java.io.File;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Supplier;

import forge.deck.Deck;
import forge.deck.DeckgenUtil;
import forge.deck.io.DeckSerializer;
import forge.game.GameType;
import forge.game.player.Player;
import forge.gamemodes.match.HostedMatch;
import forge.gamemodes.match.LocalLobby;
import forge.gui.GuiBase;
import forge.localinstance.properties.ForgeConstants;
import forge.localinstance.properties.ForgePreferences.FPref;
import forge.model.FModel;
import forge.fork.web.HeadlessWebGui;
import forge.fork.web.seat.WebSeats;

/**
 * Headless check of the launcher's match path, without Swing: Forge's {@link LocalLobby} (the model behind
 * the desktop lobby screen) sets up a Commander match, Start runs it through {@link WebHostedMatch} with
 * the human in a web seat served by {@link WebMatchHost}. A scripted client plays the seat
 * ({@code check/lobby-run.sh}). Uses an isolated profile, never {@code ~/.forge}; deck files are read only.
 *
 * <pre>
 * --players N           lobby slots (default 4): slot 0 is the human, the others AIs
 * --deckK path.dck      deck of slot K (read only, ~/ allowed); missing slots get generated Commander decks
 * --port P              server port (default 0: free port)
 * --web-root DIR        page to serve (default ../fork-web/frontend/dist)
 * --home DIR            isolated profile (default target/forge-home-lobby)
 * --wait-client S       wait up to S seconds for a client on seat 0 before pressing Start
 * --games N             play N matches in a row on the same server and page (default 1)
 * --game-gap S          seconds between a match's end and the next Start (default 0)
 * </pre>
 * Prints "[web] seat N: URL" for every seat (AI seats too, for checking their views), plays the match(es),
 * then exits 0 once the last match has handed back to the lobby.
 */
public final class LobbyRun {

    private LobbyRun() { }

    /** Boots the engine headless with an isolated profile under {@code home}; {@code hostMatch()} returns {@code matches}. */
    static void boot(Path home, String assets, Supplier<HostedMatch> matches, boolean lazyCards) {
        Path h = home.toAbsolutePath();
        try {
            Files.createDirectories(h);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
        System.setProperty("user.home", h.toString());
        System.setProperty("java.awt.headless", "true");
        System.setProperty("java.util.Arrays.useLegacyMergeSort", "true");
        GuiBase.setInterface(new HeadlessWebGui(assets, () -> null, matches));
        if (!ForgeConstants.USER_DIR.startsWith(h.toString())) {
            throw new IllegalStateException("engine profile is " + ForgeConstants.USER_DIR + ", expected under " + h);
        }
        FModel.initialize(null, prefs -> {
            prefs.setPref(FPref.LOAD_CARD_SCRIPTS_LAZILY, lazyCards);
            prefs.setPref(FPref.UI_LANGUAGE, "en-US");
            prefs.setPref(FPref.PLAYER_NAME, "You"); // blank: HostedMatch asks for a name
            prefs.setPref(FPref.ENFORCE_DECK_LEGALITY, false); // headless: no dialog to accept an illegal deck
            return null;
        });
    }

    /** A local lobby as the desktop lobby screen builds it: slot 0 the local human, then AIs; Commander; one deck per slot. */
    static LocalLobby commanderLobby(List<Deck> decks) {
        LocalLobby lobby = new LocalLobby();
        lobby.applyVariant(GameType.Commander);
        while (lobby.getNumberOfSlots() < decks.size()) {
            lobby.addSlot();
        }
        for (int i = 0; i < decks.size(); i++) {
            lobby.getSlot(i).setDeck(decks.get(i));
        }
        return lobby;
    }

    /** The lobby's Start button: {@code startGame()}'s runnable, on the GUI thread. */
    static void pressStart(LocalLobby lobby) {
        Runnable start = lobby.startGame();
        if (start == null) {
            throw new IllegalStateException("the lobby refused to start (see the log)");
        }
        GuiBase.getInterface().invokeInEdtAndWait(start);
    }

    public static void main(String[] args) throws Exception {
        Map<String, String> opt = parse(args);
        int players = Integer.parseInt(opt.getOrDefault("players", "4"));
        Map<Integer, File> deckFiles = new HashMap<>();
        for (Map.Entry<String, String> e : opt.entrySet()) {
            if (e.getKey().matches("deck\\d+")) {
                String p = e.getValue().startsWith("~/") ? System.getProperty("user.home") + e.getValue().substring(1) : e.getValue();
                deckFiles.put(Integer.parseInt(e.getKey().substring(4)), new File(p).getAbsoluteFile());
            }
        }
        String assets = GuiDesktopWeb.assetsDir(System.getProperty(GuiDesktopWeb.ASSETS_PROPERTY),
                Files.isDirectory(Paths.get("../forge-gui/res")) ? "../forge-gui/" : "forge-gui/");
        WebMatchHost host = new WebMatchHost(new WebMatchHost.Options(Integer.parseInt(opt.getOrDefault("port", "0")),
                Paths.get(opt.getOrDefault("web-root", "../fork-web/frontend/dist")), WebSeats.Timeouts.DEFAULT),
                url -> System.out.println("[web] would open the browser at " + url));
        boot(Paths.get(opt.getOrDefault("home", "target/forge-home-lobby")), assets, () -> new WebHostedMatch(host, () -> true), false);

        List<Deck> decks = new ArrayList<>();
        for (int i = 0; i < players; i++) {
            File f = deckFiles.get(i);
            Deck d = f == null ? DeckgenUtil.generateCommanderDeck(true, GameType.Commander) : DeckSerializer.fromFile(f);
            if (d == null) {
                throw new IllegalArgumentException("cannot load deck " + f);
            }
            decks.add(d);
        }
        host.start();
        for (int s = 0; s < players; s++) {
            System.out.println("[web] seat " + s + " (" + (s == 0 ? "human" : "AI") + ", " + decks.get(s).getName() + "): " + host.seatUrl(s));
        }
        int wait = Integer.parseInt(opt.getOrDefault("wait-client", "0"));
        for (int i = 0; i < wait * 10 && host.stream().seatClientCount(0) == 0; i++) {
            Thread.sleep(100);
        }

        LocalLobby lobby = commanderLobby(decks);
        int games = Integer.parseInt(opt.getOrDefault("games", "1"));
        int gap = Integer.parseInt(opt.getOrDefault("game-gap", "0"));
        for (int g = 1; g <= games; g++) {
            if (g > 1) {
                System.out.println("[web] game " + g + " starts in " + gap + " s");
                Thread.sleep(gap * 1000L); // the page may be left on its result screen: it must show the next game
            }
            long t0 = System.currentTimeMillis();
            pressStart(lobby);
            HostedMatch match = lobby.getHostedMatch();
            System.out.println("[web] lobby started " + match.getClass().getSimpleName() + ", human GUI "
                    + match.getHumanControllers().get(0).getGui().getClass().getSimpleName());
            for (Player p : match.getGame().getPlayers()) {
                System.out.println("[web] player " + p.getName() + " life " + p.getStartingLife() + " deck " + p.getRegisteredPlayer().getDeck().getName());
            }
            while (lobby.getHostedMatch() != null) {
                Thread.sleep(200);
            }
            System.out.println("[web] match over and handed back to the lobby after " + (System.currentTimeMillis() - t0) + " ms");
        }
        for (String m : host.stream().describe()) {
            System.out.println("[web] metrics " + m);
        }
        Thread.sleep(1000); // let the last messages leave
        host.stop();
        System.exit(0);
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
