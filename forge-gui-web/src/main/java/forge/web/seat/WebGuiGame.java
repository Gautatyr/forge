package forge.web.seat;

import java.util.ArrayList;
import java.util.List;

import forge.game.card.CardView;
import forge.game.event.GameEvent;
import forge.game.player.Player;
import forge.game.player.PlayerView;
import forge.game.spellability.SpellAbilityView;
import forge.gamemodes.match.input.Input;
import forge.gamemodes.match.input.InputSelectEntitiesFromList;
import forge.gamemodes.net.ProtocolGuiGame;
import forge.interfaces.IGameController;
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

    WebGuiGame(SeatSession session) {
        super(session);
        this.session = session;
    }

    public int seat() {
        return session.seat();
    }

    @Override
    public void openView(final TrackableCollection<PlayerView> myPlayers) {
        session.openView(getGameView(), myPlayers);
        super.openView(myPlayers);
    }

    /** As the desktop GUI: a card with one playable ability plays it without asking. */
    @Override
    public SpellAbilityView getAbilityToPlay(final CardView hostCard, final List<SpellAbilityView> abilities, final ITriggerEvent triggerEvent) {
        if (abilities.isEmpty()) {
            return null;
        }
        if (abilities.size() == 1 && !abilities.get(0).promptIfOnlyPossibleAbility()) {
            return abilities.get(0).canPlay() ? abilities.get(0) : null;
        }
        return super.getAbilityToPlay(hostCard, abilities, triggerEvent);
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
