package forge.web.desktop;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.BooleanSupplier;

import forge.game.GameRules;
import forge.game.GameType;
import forge.game.player.RegisteredPlayer;
import forge.gamemodes.match.HostedMatch;
import forge.gamemodes.match.NextGameDecision;
import forge.gui.FThreads;
import forge.gui.control.GameEventForwarder;
import forge.gui.interfaces.IGuiGame;
import forge.player.LobbyPlayerHuman;
import forge.player.PlayerControllerHuman;
import forge.sound.MusicPlaylist;
import forge.web.seat.WebGuiGame;

/**
 * A {@link HostedMatch} whose human plays in the web match screen. Every match start funnels through
 * {@link #startMatch(GameRules, Set, List, Map, MusicPlaylist)}: when the toggle is on and the match is a
 * lobby match (constructed, any variant such as Commander) with exactly one human, that human's GUI (the
 * lobby's Swing {@code CMatchUI}) is replaced by a web seat. Other modes (quest, gauntlet, draft, puzzle)
 * keep Swing: their rewards and win/lose screens live in the Swing match UI.
 *
 * <p>A web match lasts one game: when it ends, the match quits and hands back to the lobby (the lobby's
 * {@code onMatchOver}), so the next Start begins a new match.
 */
public class WebHostedMatch extends HostedMatch {

    /** Delay before quitting a finished web match, after the game thread's own end-of-game flush. */
    static final int QUIT_DELAY_MS = 1500;

    private final WebMatchHost host;
    private final BooleanSupplier enabled;

    public WebHostedMatch(WebMatchHost host, BooleanSupplier enabled) {
        this.host = host;
        this.enabled = enabled;
    }

    @Override
    public void startMatch(final GameRules gameRules, final Set<GameType> appliedVariants, final List<RegisteredPlayer> players,
            final Map<RegisteredPlayer, IGuiGame> guis, final MusicPlaylist playlist) {
        super.startMatch(gameRules, appliedVariants, players, withWebSeat(gameRules, players, guis), playlist);
    }

    private Map<RegisteredPlayer, IGuiGame> withWebSeat(GameRules rules, List<RegisteredPlayer> players, Map<RegisteredPlayer, IGuiGame> guis) {
        RegisteredPlayer human = rules == null || players == null ? null : webHuman(rules, players, guis, enabled.getAsBoolean());
        if (human == null || guis.get(human) instanceof WebGuiGame) {
            return guis; // not a web match, or a restart of one
        }
        WebGuiGame seat;
        try {
            seat = host.newSeat(seatIndex(players, human));
        } catch (RuntimeException e) {
            System.err.println("[web] cannot open the web match screen, playing in Swing: " + e);
            return guis;
        }
        Map<RegisteredPlayer, IGuiGame> web = new LinkedHashMap<>(guis);
        web.put(human, seat);
        setEndGameHook(this::quitWhenGameEnds);
        return web;
    }

    /** The human who plays in the web match screen, or null when this match stays in Swing. */
    static RegisteredPlayer webHuman(GameRules rules, List<RegisteredPlayer> players, Map<RegisteredPlayer, IGuiGame> guis, boolean enabled) {
        if (!enabled || guis == null || rules.getGameType() != GameType.Constructed) {
            return null;
        }
        List<RegisteredPlayer> humans = new ArrayList<>();
        for (RegisteredPlayer p : players) {
            if (p.getPlayer() instanceof LobbyPlayerHuman) {
                humans.add(p);
            }
        }
        return humans.size() == 1 && guis.containsKey(humans.get(0)) ? humans.get(0) : null;
    }

    /** The player's index in the game: {@code HostedMatch} sorts human players first, keeping the lobby order otherwise. */
    static int seatIndex(List<RegisteredPlayer> players, RegisteredPlayer player) {
        List<RegisteredPlayer> sorted = new ArrayList<>(players);
        sorted.sort((a, b) -> Boolean.compare(!(a.getPlayer() instanceof LobbyPlayerHuman), !(b.getPlayer() instanceof LobbyPlayerHuman)));
        return sorted.indexOf(player);
    }

    /** End-of-game hook (game thread): flush the seat's last events to the stream, then quit the match. */
    private void quitWhenGameEnds() {
        for (PlayerControllerHuman hc : new ArrayList<>(getHumanControllers())) {
            if (hc.getGui() instanceof WebGuiGame web) {
                GameEventForwarder fwd = web.getForwarder();
                if (fwd != null) {
                    fwd.flush();
                }
                // after the game thread's own end-of-game work (it iterates the match's human controllers)
                FThreads.delayInEDT(QUIT_DELAY_MS, () -> hc.nextGameDecision(NextGameDecision.QUIT));
                return;
            }
        }
    }
}
