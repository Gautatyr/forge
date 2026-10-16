package forge.web.bridge.visibility;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.List;

import forge.StaticData;
import forge.ai.LobbyPlayerAi;
import forge.deck.Deck;
import forge.game.Game;
import forge.game.GameRules;
import forge.game.GameStage;
import forge.game.GameType;
import forge.game.Match;
import forge.game.card.Card;
import forge.game.player.Player;
import forge.game.player.RegisteredPlayer;
import forge.game.zone.ZoneType;
import forge.gui.GuiBase;
import forge.item.IPaperCard;
import forge.localinstance.properties.ForgeConstants;
import forge.localinstance.properties.ForgePreferences.FPref;
import forge.model.FModel;
import forge.web.HeadlessWebGui;

/** Boots the engine once per test JVM with an isolated profile and builds bare games. */
public final class TestEngine {

    private static boolean booted;

    private TestEngine() { }

    public static synchronized void boot() {
        boot(true);
    }

    /** {@code lazyCardScripts} false loads every card script (deck generation draws from the whole pool). */
    public static synchronized void boot(boolean lazyCardScripts) {
        if (booted) {
            return;
        }
        // The engine derives its user dir from user.home: point it at target/ before ForgeConstants loads.
        Path home = Paths.get("target", "forge-home-test").toAbsolutePath();
        try {
            Files.createDirectories(home);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
        System.setProperty("user.home", home.toString());
        System.setProperty("java.awt.headless", "true");
        System.setProperty("java.util.Arrays.useLegacyMergeSort", "true");
        String assets = Files.isDirectory(Paths.get("../forge-gui/res")) ? "../forge-gui/" : "forge-gui/";
        GuiBase.setInterface(new HeadlessWebGui(assets, () -> null));
        if (!ForgeConstants.USER_DIR.startsWith(home.toString())) {
            throw new IllegalStateException("engine profile is " + ForgeConstants.USER_DIR + ", expected under " + home);
        }
        FModel.initialize(null, prefs -> {
            prefs.setPref(FPref.LOAD_CARD_SCRIPTS_LAZILY, lazyCardScripts);
            prefs.setPref(FPref.UI_LANGUAGE, "en-US");
            return null;
        });
        booted = true;
    }

    public static Game newGame(int players) {
        boot();
        List<RegisteredPlayer> rps = new ArrayList<>();
        for (int i = 0; i < players; i++) {
            rps.add(new RegisteredPlayer(new Deck()).setPlayer(new LobbyPlayerAi("p" + i, null)));
        }
        GameRules rules = new GameRules(GameType.Constructed);
        Game game = new Game(rps, rules, new Match(rules, rps, "Test"));
        game.setAge(GameStage.Play);
        return game;
    }

    public static Card add(String name, Player p, ZoneType zone) {
        IPaperCard paper = FModel.getMagicDb().getCommonCards().getCard(name);
        if (paper == null) {
            StaticData.instance().attemptToLoadCard(name);
            paper = FModel.getMagicDb().getCommonCards().getCard(name);
        }
        Card c = Card.fromPaperCard(paper, p);
        c.setGameTimestamp(p.getGame().getNextTimestamp());
        p.getZone(zone).add(c);
        return c;
    }
}
