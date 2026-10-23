package forge.fork.web.seat;

import java.util.ArrayList;
import java.util.EnumSet;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

import forge.game.Game;
import forge.game.GameEntity;
import forge.game.card.Card;
import forge.game.combat.Combat;
import forge.game.phase.PhaseType;
import forge.game.player.Player;
import forge.gamemodes.match.YieldUpdate;

/**
 * The seat's "Stop only when I'm involved" setting (owner ruling 2026-10-22, memo U1a; off by default, D4). On an
 * opponent's turn, a stop the page set at one of {@link #DECIDED} holds only when the seat is involved: declare
 * attackers when the seat, or a planeswalker or battle it controls or protects, is attacked; declare blockers when it is
 * attacked or one of its creatures is in the combat; the end step on the turn of the player right before it; never
 * beginning of combat. The seat's own turn, other steps and stack stops ({@code skipsPromptForStackOrPhase} checks the
 * stack first) are unchanged.
 *
 * <p>The page sends its stop rows as {@code SkipPhase} updates; they are kept here and the engine's skip set gets the
 * effective value. Who is attacked is known only at that step, so the value for the step under way is decided again at
 * each {@code GameEventPlayerPriority}, which the engine fires on the game thread just before a player is asked
 * ({@code PhaseHandler.mainLoopStep}). Game thread only (seat actions run there too, {@link InputPump}); synchronized
 * in case.
 */
final class InvolvedStops {

    /** The opponents' steps the setting decides. */
    static final Set<PhaseType> DECIDED = EnumSet.of(PhaseType.COMBAT_BEGIN, PhaseType.COMBAT_DECLARE_ATTACKERS,
            PhaseType.COMBAT_DECLARE_BLOCKERS, PhaseType.END_OF_TURN);

    private boolean active;
    /** The page's rows: steps it passes, per turn player id. */
    private final Map<Integer, EnumSet<PhaseType>> passes = new HashMap<>();

    synchronized boolean active() {
        return active;
    }

    /** A row cell from the page: kept, and the update the engine gets instead. */
    synchronized YieldUpdate.SkipPhase row(Game game, Player you, YieldUpdate.SkipPhase u) {
        EnumSet<PhaseType> set = passes.computeIfAbsent(u.turnPlayer().getId(), k -> EnumSet.noneOf(PhaseType.class));
        if (u.skip()) {
            set.add(u.phase());
        } else {
            set.remove(u.phase());
        }
        Player turnPlayer = game.getPlayer(u.turnPlayer().getId());
        return turnPlayer == null ? u : new YieldUpdate.SkipPhase(u.turnPlayer(), u.phase(), skips(game, you, turnPlayer, u.phase()));
    }

    /** Turns the setting on or off: the updates that bring the engine's skip set in line, for every opponent. */
    synchronized List<YieldUpdate.SkipPhase> setActive(Game game, Player you, boolean on) {
        active = on;
        List<YieldUpdate.SkipPhase> out = new ArrayList<>();
        for (Player p : game.getRegisteredPlayers()) {
            if (p == you) {
                continue;
            }
            for (PhaseType ph : DECIDED) {
                out.add(new YieldUpdate.SkipPhase(p.getView(), ph, skips(game, you, p, ph)));
            }
        }
        return out;
    }

    /** At a priority: the update for the step under way, or null when the setting does not decide it. */
    synchronized YieldUpdate.SkipPhase atPriority(Game game, Player you) {
        Player turnPlayer = game.getPhaseHandler().getPlayerTurn();
        PhaseType ph = game.getPhaseHandler().getPhase();
        if (!active || you == null || turnPlayer == null || turnPlayer == you || ph == null || !DECIDED.contains(ph)) {
            return null;
        }
        return new YieldUpdate.SkipPhase(turnPlayer.getView(), ph, skips(game, you, turnPlayer, ph));
    }

    private boolean skips(Game game, Player you, Player turnPlayer, PhaseType ph) {
        EnumSet<PhaseType> set = passes.get(turnPlayer.getId());
        boolean rowSkips = set != null && set.contains(ph);
        if (!active || rowSkips || you == null || turnPlayer == you || !DECIDED.contains(ph)) {
            return rowSkips;
        }
        return !involved(game, you, turnPlayer, ph);
    }

    /** Is {@code you} involved at step {@code ph} of {@code turnPlayer}'s turn, as the game stands now? */
    static boolean involved(Game game, Player you, Player turnPlayer, PhaseType ph) {
        switch (ph) {
            case COMBAT_DECLARE_ATTACKERS:
                return attacked(game.getCombat(), you);
            case COMBAT_DECLARE_BLOCKERS:
                return attacked(game.getCombat(), you) || inCombat(game.getCombat(), you);
            case END_OF_TURN:
                return game.getNextPlayerAfter(turnPlayer) == you;
            default:
                return false;
        }
    }

    /** {@code you}, or a planeswalker or battle {@code you} controls or protects, has an attacker. */
    static boolean attacked(Combat combat, Player you) {
        if (combat == null) {
            return false;
        }
        for (GameEntity d : combat.getDefenders()) {
            boolean yours = d == you || d instanceof Card c && (c.getController() == you || c.getProtectingPlayer() == you);
            if (yours && !combat.getAttackersOf(d).isEmpty()) {
                return true;
            }
        }
        return false;
    }

    /** A creature {@code you} control attacks or blocks. */
    static boolean inCombat(Combat combat, Player you) {
        if (combat == null) {
            return false;
        }
        for (Card c : combat.getAttackers()) {
            if (c.getController() == you) {
                return true;
            }
        }
        for (Card c : combat.getAllBlockers()) {
            if (c.getController() == you) {
                return true;
            }
        }
        return false;
    }
}
