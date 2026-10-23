package forge.fork.web.bridge;

import static org.testng.Assert.assertEquals;

import java.util.ArrayList;
import java.util.List;

import org.testng.annotations.Test;

/** Round = how many times the first player (in turn order, still in the game) has started a turn. */
public class RoundCounterTest {

    /** Plays turns in order; returns the round after each one. {@code inGame} is the turn order of the players still in. */
    private static List<Integer> play(RoundCounter rc, List<Integer> inGame, int... owners) {
        List<Integer> out = new ArrayList<>();
        for (int o : owners) {
            out.add(rc.turnBegan(o, inGame));
        }
        return out;
    }

    @Test
    public void noTurnYetIsRoundZero() {
        assertEquals(new RoundCounter().round(), 0);
    }

    @Test
    public void twoPlayers() {
        RoundCounter rc = new RoundCounter();
        assertEquals(play(rc, List.of(1, 2), 1, 2, 1, 2, 1), List.of(1, 1, 2, 2, 3));
    }

    @Test
    public void threePlayersStartingMidList() {
        RoundCounter rc = new RoundCounter();
        // The game's list is in turn order; the starting player is 2.
        assertEquals(play(rc, List.of(1, 2, 3), 2, 3, 1, 2, 3, 1, 2), List.of(1, 1, 1, 2, 2, 2, 3));
    }

    @Test
    public void fourPlayersTurn26IsRound7() {
        RoundCounter rc = new RoundCounter();
        int round = 0;
        for (int turn = 1; turn <= 26; turn++) {
            round = rc.turnBegan((turn - 1) % 4, List.of(0, 1, 2, 3));
        }
        assertEquals(round, 7);
    }

    @Test
    public void extraTurnOfAnotherPlayerIsNotANewRound() {
        RoundCounter rc = new RoundCounter();
        assertEquals(play(rc, List.of(0, 1, 2, 3), 0, 1, 2, 2, 3, 0), List.of(1, 1, 1, 1, 1, 2));
    }

    @Test
    public void outOfOrderExtraTurnOfAnotherPlayerIsNotANewRound() {
        RoundCounter rc = new RoundCounter();
        // Player 2 gives player 1 an extra turn (Time Warp): 1 plays again after 2.
        assertEquals(play(rc, List.of(0, 1, 2, 3), 0, 1, 2, 1, 3, 0), List.of(1, 1, 1, 1, 1, 2));
    }

    @Test
    public void extraTurnAtEachOtherEndStepIsNotANewRound() {
        RoundCounter rc = new RoundCounter();
        // Player 1 takes an extra turn after every other player's turn (Lighthouse Chronologist).
        assertEquals(play(rc, List.of(0, 1, 2, 3), 0, 1, 1, 2, 1, 3, 1, 0), List.of(1, 1, 1, 1, 1, 1, 1, 2));
    }

    @Test
    public void reversedTurnOrderCountsFirstPlayerTurnsOnly() {
        RoundCounter rc = new RoundCounter();
        // Turn order reverses after player 2's turn (Aeon Engine).
        assertEquals(play(rc, List.of(0, 1, 2, 3), 0, 1, 2, 1, 0, 3, 2, 1, 0), List.of(1, 1, 1, 1, 2, 2, 2, 2, 3));
    }

    @Test
    public void extraTurnOfTheFirstPlayerStartsARound() {
        RoundCounter rc = new RoundCounter();
        assertEquals(play(rc, List.of(0, 1, 2), 0, 1, 2, 0, 0, 1), List.of(1, 1, 1, 2, 3, 3));
    }

    @Test
    public void lastPlayerTakingAnExtraTurnDoesNotWrap() {
        RoundCounter rc = new RoundCounter();
        assertEquals(play(rc, List.of(0, 1, 2), 0, 1, 2, 2, 0), List.of(1, 1, 1, 1, 2));
    }

    @Test
    public void firstPlayerEliminatedMidRound() {
        RoundCounter rc = new RoundCounter();
        assertEquals(play(rc, List.of(0, 1, 2, 3), 0, 1, 2, 3, 0), List.of(1, 1, 1, 1, 2));
        // Player 0 loses during their own turn: player 1 now opens each round, the current round goes on.
        List<Integer> in = List.of(1, 2, 3);
        assertEquals(play(rc, in, 1, 2, 3, 1, 2, 3, 1), List.of(2, 2, 2, 3, 3, 3, 4));
        // An extra turn for the new first player starts a round, as it would have for player 0.
        assertEquals(play(rc, in, 1), List.of(5));
    }

    @Test
    public void middlePlayerEliminated() {
        RoundCounter rc = new RoundCounter();
        assertEquals(play(rc, List.of(0, 1, 2, 3), 0, 1, 2, 3), List.of(1, 1, 1, 1));
        assertEquals(play(rc, List.of(0, 1, 3), 0, 1, 3, 0), List.of(2, 2, 2, 3));
    }

    @Test
    public void resetStartsANewGame() {
        RoundCounter rc = new RoundCounter();
        play(rc, List.of(0, 1), 0, 1, 0);
        rc.reset();
        assertEquals(rc.round(), 0);
        assertEquals(play(rc, List.of(0, 1), 1, 0, 1), List.of(1, 1, 2));
    }
}
