package forge.fork.web.seat;

import static org.testng.Assert.assertEquals;

import java.lang.reflect.Method;
import java.lang.reflect.Modifier;
import java.util.Arrays;
import java.util.Map;
import java.util.TreeMap;
import java.util.TreeSet;
import java.util.stream.Collectors;

import org.testng.annotations.Test;

import forge.gamemodes.net.ProtocolMethod;
import forge.gui.interfaces.IGuiGame;

/**
 * Guards the human-seat coverage audit ({@code docs/fork/audit/human-seat.md}): which class answers each
 * {@link IGuiGame} method for a web seat, and that every answer-needing protocol method has a prompt. An upstream
 * change that moves a method (e.g. {@code ProtocolGuiGame} stops forwarding one) fails here: re-audit it.
 */
public class SeatCoverageTest {

    @Test
    public void everyIGuiGameMethodIsAnsweredWhereTheAuditSays() {
        Map<String, String> actual = new TreeMap<>();
        for (Method m : IGuiGame.class.getMethods()) {
            if (Modifier.isStatic(m.getModifiers())) {
                continue;
            }
            Method impl;
            try {
                impl = WebGuiGame.class.getMethod(m.getName(), m.getParameterTypes());
            } catch (NoSuchMethodException e) {
                throw new AssertionError(e);
            }
            actual.put(signature(m), impl.getDeclaringClass().getSimpleName());
        }
        String table = actual.entrySet().stream().map(e -> e.getKey() + " = " + e.getValue()).collect(Collectors.joining("\n"));
        assertEquals(table, EXPECTED, "IGuiGame coverage changed: update docs/fork/audit/human-seat.md and this table\n" + table);
    }

    /** Every IGuiGame method the protocol sends and waits on has a prompt shape (13). */
    @Test
    public void everyAnswerNeedingProtocolMethodHasAPrompt() {
        TreeSet<String> needAnswer = new TreeSet<>();
        for (ProtocolMethod pm : ProtocolMethod.values()) {
            Method m = pm.getMethod();
            if (m != null && m.getDeclaringClass() == IGuiGame.class && pm.getReturnType() != Void.TYPE) {
                needAnswer.add(pm.name());
            }
        }
        assertEquals(needAnswer, new TreeSet<>(Prompt.SHAPED.stream().map(Enum::name).toList()));
        assertEquals(needAnswer.size(), 13);
    }

    private static String signature(Method m) {
        return m.getName() + "(" + Arrays.stream(m.getParameterTypes()).map(Class::getSimpleName).collect(Collectors.joining(",")) + ")";
    }

    /** Method signature = the class that answers it for a {@link WebGuiGame}; the audit says what each one does. */
    private static final String EXPECTED = """
            afterGameEnd() = ProtocolGuiGame
            alertUser() = ProtocolGuiGame
            applyDelta(DeltaPacket) = NetworkGuiGame
            applyYieldUpdate(YieldUpdate) = ProtocolGuiGame
            assignCombatDamage(CardView,List,int,GameEntityView,boolean,boolean) = ProtocolGuiGame
            assignGenericAmount(CardView,Map,int,boolean,String) = ProtocolGuiGame
            awaitInput(CountDownLatch) = WebGuiGame
            awaitNextInput() = ProtocolGuiGame
            canPickStackTargets() = ProtocolGuiGame
            cancelAwaitNextInput() = AbstractGuiGame
            chooseEntitiesForEffect(String,List,int,int,DelayedReveal) = ProtocolGuiGame
            chooseSingleEntityForEffect(String,List,DelayedReveal,boolean) = ProtocolGuiGame
            clearSelectables() = ProtocolGuiGame
            clearWeaklySelectable() = ProtocolGuiGame
            confirm(CardView,String) = IGuiGame
            confirm(CardView,String,boolean,List) = ProtocolGuiGame
            disableOverlay() = ProtocolGuiGame
            enableOverlay() = ProtocolGuiGame
            endFlipOntoBattlefield(CardView) = IGuiGame
            finishGame() = ProtocolGuiGame
            flashIncorrectAction() = ProtocolGuiGame
            getAbilityToPlay(CardView,List,ITriggerEvent) = WebGuiGame
            getChoices(String,int,int,List) = IGuiGame
            getChoices(String,int,int,List,List,FSerializableFunction) = ProtocolGuiGame
            getDayTime() = AbstractGuiGame
            getGameSpeed() = AbstractGuiGame
            getGameView() = AbstractGuiGame
            getInteger(String,int,int,boolean) = AbstractGuiGame
            getInteger(String,int,int,int) = AbstractGuiGame
            handleGameEvent(GameEvent) = ProtocolGuiGame
            handleGameEvents(List) = WebGuiGame
            handleLandPlayed(CardView) = IGuiGame
            hideManaPool(PlayerView) = ProtocolGuiGame
            hideRevealedCards() = ProtocolGuiGame
            insertInList(String,Object,List) = AbstractGuiGame
            isGamePaused() = AbstractGuiGame
            isLibgdxPort() = IGuiGame
            isNetGame() = ProtocolGuiGame
            isSelecting() = AbstractGuiGame
            isUiSetToSkipPhase(PlayerView,PhaseType) = ProtocolGuiGame
            manipulateCardList(String,Iterable,Iterable,boolean,boolean,boolean) = ProtocolGuiGame
            many(String,String,int,List,CardView) = IGuiGame
            many(String,String,int,int,List,CardView) = IGuiGame
            many(String,String,int,int,List,List,CardView) = AbstractGuiGame
            message(String) = IGuiGame
            message(String,String) = ProtocolGuiGame
            notifyStackAddition(GameEventSpellAbilityCast) = IGuiGame
            notifyStackRemoval(GameEventSpellRemovedFromStack) = IGuiGame
            onSnapshotRestored() = IGuiGame
            one(String,List) = IGuiGame
            one(String,List,FSerializableFunction) = AbstractGuiGame
            oneOrNone(String,List) = AbstractGuiGame
            openView(TrackableCollection) = WebGuiGame
            openZones(PlayerView,Collection,Map) = IGuiGame
            order(String,String,List,CardView) = IGuiGame
            order(String,String,int,int,List,List,CardView,boolean) = IGuiGame
            order(String,String,int,int,List,List,CardView,boolean,boolean) = ProtocolGuiGame
            refreshCardDetails(Iterable) = IGuiGame
            refreshField() = IGuiGame
            refreshYieldUi(PlayerView) = IGuiGame
            reveal(String,List) = AbstractGuiGame
            setCard(CardView) = ProtocolGuiGame
            setCurrentPlayer(PlayerView) = AbstractGuiGame
            setGameController(PlayerView,IGameController) = AbstractGuiGame
            setGamePause(boolean) = AbstractGuiGame
            setGameSpeed(PlaybackSpeed) = AbstractGuiGame
            setGameView(GameView) = ProtocolGuiGame
            setGameView(GameView,long) = IGuiGame
            setHighlighted(Iterable,boolean) = ProtocolGuiGame
            setNetGame() = AbstractGuiGame
            setOriginalGameController(PlayerView,IGameController) = WebGuiGame
            setPanelSelection(CardView) = ProtocolGuiGame
            setPlayerAvatar(LobbyPlayer,IHasIcon) = ProtocolGuiGame
            setSelectableTargets(Iterable) = ProtocolGuiGame
            setSelectables(Iterable,int,int) = ProtocolGuiGame
            setSpectator(IGameController) = AbstractGuiGame
            setWeaklySelectable(Iterable) = ProtocolGuiGame
            showCoinFlip(boolean,String,boolean) = IGuiGame
            showCombat() = WebGuiGame
            showConfirmDialog(String,String) = IGuiGame
            showConfirmDialog(String,String,String,String) = IGuiGame
            showConfirmDialog(String,String,String,String,boolean) = ProtocolGuiGame
            showErrorDialog(String) = IGuiGame
            showErrorDialog(String,String) = ProtocolGuiGame
            showFlipOntoBattlefield(CardView,CardView,List,List,int) = IGuiGame
            showInputDialog(String,String,FSkinProp,String,List,boolean) = ProtocolGuiGame
            showManaPool(PlayerView) = ProtocolGuiGame
            showOptionDialog(String,String,FSkinProp,List,int) = ProtocolGuiGame
            showPromptMessage(PlayerView,String) = IGuiGame
            showPromptMessage(PlayerView,String,CardView) = WebGuiGame
            showRevealedCards(Iterable) = ProtocolGuiGame
            sideboard(CardPool,CardPool,String) = ProtocolGuiGame
            updateAutoPassPrompt() = ProtocolGuiGame
            updateButtons(PlayerView,String,String,boolean,boolean,boolean) = ProtocolGuiGame
            updateButtons(PlayerView,boolean,boolean,boolean) = IGuiGame
            updateCard(CardView) = IGuiGame
            updateCards(Iterable) = IGuiGame
            updateCardsNetSafe(FCollectionView) = IGuiGame
            updateDayTime(String) = AbstractGuiGame
            updateDependencies() = IGuiGame
            updateDrawOffer(Status) = ProtocolGuiGame
            updateLives(Iterable) = IGuiGame
            updateManaPool(Iterable) = IGuiGame
            updatePhase(boolean) = IGuiGame
            updatePlayerControl() = IGuiGame
            updateRevealedCards(TrackableCollection) = AbstractGuiGame
            updateShards(Iterable) = IGuiGame
            updateStack() = IGuiGame
            updateTurn(PlayerView) = IGuiGame
            updateZones(Iterable) = IGuiGame""";
}
