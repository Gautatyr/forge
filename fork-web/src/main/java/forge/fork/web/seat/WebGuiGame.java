package forge.fork.web.seat;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;

import forge.game.card.CardView;
import forge.game.event.GameEvent;
import forge.game.player.Player;
import forge.game.player.PlayerView;
import forge.game.spellability.SpellAbilityView;
import forge.gamemodes.match.input.Input;
import forge.gamemodes.match.input.InputBlock;
import forge.gamemodes.match.input.InputSelectEntitiesFromList;
import forge.gamemodes.match.input.InputSynchronized;
import forge.gamemodes.net.ProtocolGuiGame;
import forge.interfaces.IGameController;
import forge.localinstance.properties.ForgePreferences.FPref;
import forge.player.PlayerControllerHuman;
import forge.trackable.TrackableCollection;
import forge.util.ITriggerEvent;
import forge.util.ThreadUtil;

/**
 * A human seat played from a browser. {@link ProtocolGuiGame} turns every {@code IGuiGame} call into
 * a {@code ProtocolMethod} on the seat's {@link SeatSession} ({@code IRemote}); {@code HostedMatch}
 * gives it a {@code GameEventForwarder} that batches game events on the game thread and flushes
 * them before the seat's input blocks the game. Each batch is also published on the per-viewer
 * {@code GameStream}, which replaces network play's unfiltered deltas.
 */
public final class WebGuiGame extends ProtocolGuiGame {

    private final SeatSession session;
    private volatile PlayerControllerHuman human;
    /** The input {@link #stopIfOut} stopped last (game thread only). */
    private Input stopped;

    WebGuiGame(SeatSession session) {
        super(session);
        this.session = session;
    }

    public int seat() {
        return session.seat();
    }

    SeatSession session() {
        return session;
    }

    /** Ends this seat's part in its game: open prompts get their engine defaults, nothing more reaches the seat. */
    public void close() {
        session.close();
    }

    @Override
    public void openView(final TrackableCollection<PlayerView> myPlayers) {
        session.openView(getGameView(), myPlayers);
        super.openView(myPlayers);
    }

    /**
     * As the desktop GUI ({@code CMatchUI}): a single ability is played without asking. Without a trigger event (every
     * call from this seat, and the engine's own calls: a triggered ability going on the stack, a spell cast by an
     * effect) it is returned as is; its {@code canPlay} is false for a triggered ability, and checking it dropped the
     * seat's triggers (issue #46). The engine has already removed what may not be played.
     */
    @Override
    public SpellAbilityView getAbilityToPlay(final CardView hostCard, final List<SpellAbilityView> abilities, final ITriggerEvent triggerEvent) {
        if (abilities.isEmpty()) {
            return null;
        }
        if (abilities.size() == 1) {
            if (triggerEvent == null) {
                return abilities.get(0);
            }
            if (!abilities.get(0).promptIfOnlyPossibleAbility()) {
                return abilities.get(0).canPlay() ? abilities.get(0) : null;
            }
        }
        return super.getAbilityToPlay(hostCard, abilities, triggerEvent);
    }

    /** The game thread waits for this seat's input here and runs the seat's actions meanwhile ({@link InputPump}). */
    @Override
    public void awaitInput(final CountDownLatch done) throws InterruptedException {
        session.pump().await(done, this::stopIfOut);
    }

    /**
     * Game thread: a seat out of a game that goes on (it conceded at one of its inputs) holds the others up no longer:
     * the input it was asked is stopped unanswered. {@code InputPassPriority} then passes (as upstream's AFK timeout
     * stops it); any other input ends with what the seat recorded so far (no attackers or blockers, an unpaid cost
     * cancels its spell).
     */
    private Runnable stopIfOut() {
        PlayerControllerHuman pch = human;
        if (pch == null || !pch.getPlayer().hasLost() || pch.getGame().isGameOver()) {
            return null;
        }
        if (!(pch.getInputQueue().getInput() instanceof InputSynchronized in) || in == stopped) {
            return null;
        }
        stopped = in;
        return in::stop;
    }

    /**
     * {@code ProtocolGuiGame} walks the game here (it flushes the batched events, which publishes on the seat's stream)
     * and expects the game thread; inputs and timers also call it on the EDT ({@code setWeaklySelectable},
     * {@code clearWeaklySelectable}, {@code syncAndSend}). Another thread (the EDT, or a second game thread an input
     * started) walks only while the game thread waits for this seat's input and runs nothing; otherwise the game
     * thread's next flush carries the changes.
     */
    @Override
    public void updateGameView() {
        session.readGame(super::updateGameView);
    }

    /**
     * {@code InputBlock.showMessage} ends with this call, after each block the seat assigns or removes: send the blocks
     * the engine allows now (issue #48). Runs on the game thread (the seat's actions run there, {@link InputPump}), or on
     * the EDT for the input's first display ({@code InputProxy}). Not routed through {@link SeatSession#readGame}, which
     * would drop the read before the game thread waits: the combat only changes through the seat's own actions here.
     */
    @Override
    public void showCombat() {
        super.showCombat();
        PlayerControllerHuman pch = human;
        if (pch != null && pch.getInputQueue().getInput() instanceof InputBlock) {
            session.blockOptions(BlockOptions.of(pch.getGame().getCombat(), pch.getPlayer()));
        }
    }

    @Override
    public void handleGameEvents(final List<GameEvent> events) {
        super.handleGameEvents(events);
        session.publish(events);
    }

    @Override
    public void setOriginalGameController(final PlayerView player, final IGameController gameController) {
        super.setOriginalGameController(player, gameController);
        session.bindController(gameController);
        if (gameController instanceof PlayerControllerHuman pch) {
            human = pch;
            // The web client reads setWeaklySelectable: cards you may play now, mana sources and the auto-pay
            // plan while paying, attack candidates. This seat's own settings (YieldController overrides), so the
            // desktop app's preferences are neither read nor changed.
            pch.getYieldController().setPref(FPref.UI_SHOW_ACTIONABLE_HIGHLIGHTS, "true");
            pch.getYieldController().setPref(FPref.UI_SHOW_AUTOTAP_PREVIEW, "true");
            // Before this seat's input blocks the game thread, publish what changed without an event,
            // e.g. cards shown by tempShowCards for the input. Observers run newest first: this one runs
            // before the InputProxy posts the input's prompt to the EDT.
            pch.getInputQueue().addObserver((o, arg) -> {
                if (ThreadUtil.isGameThread()) {
                    session.flush();
                    selectablePlayers(pch.getInputQueue().getInput());
                }
            });
        }
    }

    /**
     * {@code InputSelectEntitiesFromList} names only its cards ({@code setSelectables}); the desktop lets
     * the player click any portrait. Name its players as selectable targets, cleared with the selectables
     * when the input stops (e.g. choosing who starts the game).
     */
    private void selectablePlayers(final Input input) {
        if (!(input instanceof InputSelectEntitiesFromList<?> in)) {
            return;
        }
        List<PlayerView> players = new ArrayList<>();
        for (Object e : in.getValidChoices()) {
            if (e instanceof Player p) {
                players.add(p.getView());
            }
        }
        if (!players.isEmpty()) {
            setSelectableTargets(players);
        }
    }
}
