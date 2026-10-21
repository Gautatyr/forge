package forge.fork.web.bridge;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import forge.LobbyPlayer;
import forge.deck.CardPool;
import forge.game.GameEntityView;
import forge.game.GameView;
import forge.game.card.CardView;
import forge.game.event.GameEvent;
import forge.game.phase.PhaseType;
import forge.game.player.DelayedReveal;
import forge.game.player.IHasIcon;
import forge.game.player.PlayerView;
import forge.game.spellability.SpellAbilityView;
import forge.gamemodes.match.AbstractGuiGame;
import forge.gui.GuiBase;
import forge.gui.control.PlaybackSpeed;
import forge.interfaces.IGameController;
import forge.item.PaperCard;
import forge.localinstance.skin.FSkinProp;
import forge.trackable.TrackableCollection;
import forge.util.FSerializableFunction;
import forge.util.ITriggerEvent;

/**
 * Read-only web spectator for an AI-only match. {@code HostedMatch} attaches it through
 * {@code IGuiBase.getNewGuiGame()} when no human plays, and calls {@link #openView} before the
 * game thread starts; that is where the game-thread listener is subscribed.
 *
 * <p>Extends {@link AbstractGuiGame}, not {@code ProtocolGuiGame}: the spectator path in
 * {@code HostedMatch.registerSpectator} drives this GUI from the EDT through
 * {@code FControlGameEventHandler}, and {@code ProtocolGuiGame}'s sync methods must run on the game
 * thread. State therefore flows only through {@link BatchingListener} on the game thread; the
 * EDT-side update callbacks are left as no-ops. Prompts never reach a spectator; they log and
 * return the engine's default.
 */
public class WebSpectatorGuiGame extends AbstractGuiGame implements BatchingListener.Sink {

    private final GameStream stream;
    private final boolean fast;
    private IGameController spectatorController;

    public WebSpectatorGuiGame(GameStream stream, boolean fast) {
        this.stream = stream;
        this.fast = fast;
    }

    @Override
    public void setSpectator(final IGameController spectator) {
        super.setSpectator(spectator);
        spectatorController = spectator;
    }

    @Override
    public void openView(final TrackableCollection<PlayerView> myPlayers) {
        GameView gv = getGameView();
        if (gv == null || gv.getGame() == null) {
            return;
        }
        stream.startGame(gv);
        gv.getGame().subscribeToEvents(new BatchingListener(this));
    }

    // --- game thread ---

    @Override
    public void onBatch(List<GameEvent> batch, boolean gameFinished) {
        stream.publish(batch, gameFinished);
        if (fast && spectatorController != null && getGameSpeed() != PlaybackSpeed.FAST) {
            // InputPlaybackControl: "cancel" while playing cycles NORMAL -> FAST (10x shorter pauses) and
            // reports it back through setGameSpeed. Retried per batch because the playback input is only
            // installed once FControlGamePlayback has seen GameEventGameStarted.
            GuiBase.getInterface().invokeInEdtLater(() -> {
                if (getGameSpeed() != PlaybackSpeed.FAST) {
                    spectatorController.selectButtonCancel();
                }
            });
        }
    }

    // --- EDT-side callbacks: state already flows through the game-thread listener ---

    @Override
    public void handleGameEvent(final GameEvent event) { }

    @Override
    protected void updateCurrentPlayer(final PlayerView player) { }

    @Override
    public void showCombat() { }

    @Override
    public void showPromptMessage(final PlayerView playerView, final String message, final CardView card) { }

    @Override
    public void updateButtons(final PlayerView owner, final String label1, final String label2, final boolean enable1, final boolean enable2, final boolean focus1) { }

    @Override
    public void flashIncorrectAction() { }

    @Override
    public void alertUser() { }

    @Override
    public void finishGame() { }

    @Override
    public void setPanelSelection(final CardView hostCard) { }

    @Override
    public void setCard(final CardView card) { }

    @Override
    public void setPlayerAvatar(final LobbyPlayer player, final IHasIcon ihi) { }

    @Override
    public boolean isUiSetToSkipPhase(final PlayerView playerTurn, final PhaseType phase) {
        return false;
    }

    @Override
    public void message(final String message, final String title) {
        System.out.println("[web] message: " + title + ": " + message);
    }

    @Override
    public void showErrorDialog(final String message, final String title) {
        System.err.println("[web] error: " + title + ": " + message);
    }

    // --- the 13 answer-needing prompts: unreachable for a spectator; engine defaults ---

    private static void unexpected(final String method) {
        System.err.println("[web] spectator received prompt " + method + "; answering with the default");
    }

    @Override
    public SpellAbilityView getAbilityToPlay(final CardView hostCard, final List<SpellAbilityView> abilities, final ITriggerEvent triggerEvent) {
        unexpected("getAbilityToPlay");
        return null;
    }

    @Override
    public Map<CardView, Integer> assignCombatDamage(final CardView attacker, final List<CardView> blockers, final int damage, final GameEntityView defender, final boolean overrideOrder, final boolean maySkip) {
        unexpected("assignCombatDamage");
        return null;
    }

    @Override
    public Map<Object, Integer> assignGenericAmount(final CardView effectSource, final Map<Object, Integer> target, final int amount, final boolean atLeastOne, final String amountLabel) {
        unexpected("assignGenericAmount");
        return null;
    }

    @Override
    public boolean showConfirmDialog(final String message, final String title, final String yesButtonText, final String noButtonText, final boolean defaultYes) {
        unexpected("showConfirmDialog");
        return defaultYes;
    }

    @Override
    public int showOptionDialog(final String message, final String title, final FSkinProp icon, final List<String> options, final int defaultOption) {
        unexpected("showOptionDialog");
        return defaultOption;
    }

    @Override
    public String showInputDialog(final String message, final String title, final FSkinProp icon, final String initialInput, final List<String> inputOptions, final boolean isNumeric) {
        unexpected("showInputDialog");
        return initialInput;
    }

    @Override
    public boolean confirm(final CardView c, final String question, final boolean defaultIsYes, final List<String> options) {
        unexpected("confirm");
        return defaultIsYes;
    }

    @Override
    public <T> List<T> getChoices(final String message, final int min, final int max, final List<T> choices, final List<T> selected, final FSerializableFunction<T, String> display) {
        unexpected("getChoices");
        return new ArrayList<>(choices.subList(0, Math.min(min, choices.size())));
    }

    @Override
    public <T> OrderResult<T> order(final String title, final String top, final int remainingObjectsMin, final int remainingObjectsMax, final List<T> sourceChoices, final List<T> destChoices, final CardView referenceCard, final boolean sideboardingMode, final boolean showRememberCheckbox) {
        unexpected("order");
        return new OrderResult<>(new ArrayList<>(sourceChoices), false);
    }

    @Override
    public List<PaperCard> sideboard(final CardPool sideboard, final CardPool main, final String message) {
        unexpected("sideboard");
        return null;
    }

    @Override
    public GameEntityView chooseSingleEntityForEffect(final String title, final List<? extends GameEntityView> optionList, final DelayedReveal delayedReveal, final boolean isOptional) {
        unexpected("chooseSingleEntityForEffect");
        return isOptional || optionList.isEmpty() ? null : optionList.get(0);
    }

    @Override
    public List<GameEntityView> chooseEntitiesForEffect(final String title, final List<? extends GameEntityView> optionList, final int min, final int max, final DelayedReveal delayedReveal) {
        unexpected("chooseEntitiesForEffect");
        return new ArrayList<>(optionList.subList(0, Math.min(min, optionList.size())));
    }

    @Override
    public List<CardView> manipulateCardList(final String title, final Iterable<CardView> cards, final Iterable<CardView> manipulable, final boolean toTop, final boolean toBottom, final boolean toAnywhere) {
        unexpected("manipulateCardList");
        List<CardView> l = new ArrayList<>();
        cards.forEach(l::add);
        return l;
    }
}
