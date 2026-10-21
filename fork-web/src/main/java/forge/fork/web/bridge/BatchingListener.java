package forge.fork.web.bridge;

import java.util.ArrayList;
import java.util.List;

import com.google.common.eventbus.Subscribe;

import forge.game.event.GameEvent;
import forge.game.event.GameEventGameFinished;
import forge.game.event.GameEventPlayerPriority;
import forge.game.event.GameEventTurnEnded;

/**
 * Game-thread event batcher. Same flush policy as {@code forge.gui.control.GameEventForwarder}
 * (flush when a player gets priority after something happened, and at end of turn), plus a final
 * flush when the game finishes, which the forwarder leaves to its owner. Kept separate so the
 * final flush is ordered with the batch instead of racing another EventBus subscriber.
 */
public final class BatchingListener {

    public interface Sink {
        void onBatch(List<GameEvent> batch, boolean gameFinished);
    }

    private final Sink sink;
    private final List<GameEvent> pending = new ArrayList<>();
    private boolean somethingHappened;

    public BatchingListener(Sink sink) {
        this.sink = sink;
    }

    @Subscribe
    public void receiveGameEvent(GameEvent ev) {
        if (ev instanceof GameEventTurnEnded && somethingHappened) {
            flush(false);
        }
        pending.add(ev);
        if (ev instanceof GameEventGameFinished) {
            flush(true);
        } else if (!(ev instanceof GameEventPlayerPriority)) {
            somethingHappened |= !ev.isRedrawHint();
        } else if (somethingHappened) {
            flush(false);
        }
    }

    private void flush(boolean finished) {
        List<GameEvent> batch = new ArrayList<>(pending);
        pending.clear();
        somethingHappened = false;
        sink.onBatch(batch, finished);
    }
}
