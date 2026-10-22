package forge.fork.web.seat;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.function.BooleanSupplier;
import java.util.function.Supplier;

import forge.gui.FThreads;
import forge.gui.GuiBase;
import forge.util.ThreadUtil;

/**
 * Runs one human seat's actions on the game thread that waits for the seat's input ({@code IGuiGame.awaitInput}, the
 * hook upstream gives single-threaded hosts), so only that thread changes the game while the seat plays: an input's
 * handlers run there, and the engine work they start runs inline ({@code GameAction.invoke} on a game thread) instead
 * of on a second game thread. Before, actions ran on the seat's own thread, unordered with the EDT, and a mana ability
 * ran on a new game thread while the EDT refreshed the payment input (issue #53).
 *
 * <p>Input display stays on the EDT ({@code InputProxy}, {@code InputPayMana.updateMessage}). An action starts once the
 * EDT has run what was queued before it, and the game thread goes back to waiting (or on with the game) once the EDT
 * has run what the action queued: EDT work reads the game while the game thread waits here. {@link #whileIdle} lets
 * other threads read the game at those times only.
 *
 * <p>A wait ends once the EDT has run what was queued before it ended, wherever the input ended: the EDT's input work
 * ({@code InputPayMana.updateMessage} swaps the player's controller for an AI one there) never overlaps the game thread
 * going on (issue #60).
 *
 * <p>Actions that need no input ({@link #defer}: concede, hand order, yield settings…) run on the game thread too, at its
 * next safe point: while it waits here, or at a player's priority ({@link #runDeferred}), whichever comes first (issue
 * #61; before, they ran on the seat's thread while the game ran).
 *
 * <p>Threads: {@link #await} and {@link #runDeferred} on the game thread ({@code await} nested when an action opens
 * another input); {@link #offer} on the seat's action thread, one action at a time; {@link #defer},
 * {@link #dropDeferred} and {@link #whileIdle} on any thread.
 */
final class InputPump {

    /** How long an action waits for the game thread to reach an input it has already set. */
    static final long INPUT_GRACE_MS = 1_000;
    /** Re-check of a wait's latch, which nothing here is told about when another thread opens it. */
    private static final long POLL_MS = 20;
    /** Longest wait for the EDT; past it the game thread goes on and the overlap is logged. */
    private static final long EDT_MS = 10_000;

    private enum State { QUEUED, RUNNING, DONE, RETURNED }

    private static final class Job {
        final Runnable action;
        State state = State.QUEUED;
        /** {@link #changes} when the job started: a wait that starts or ends meanwhile frees the next action. */
        long changesAtStart;

        Job(Runnable action) {
            this.action = action;
        }
    }

    /** An action for the game thread's next safe point where {@code ready} holds; {@code drop} if it never runs. */
    private record Deferred(Runnable action, BooleanSupplier ready, Runnable drop) { }

    private final String label;
    private final Object lock = new Object();
    private final ArrayDeque<Job> jobs = new ArrayDeque<>();
    private final ArrayDeque<Deferred> deferred = new ArrayDeque<>();
    /** Waits of the game thread in progress (nested: an action opened another input). */
    private int depth;
    /** The game thread waits here and runs nothing. */
    private boolean idle;
    /** Counts waits started and ended. */
    private long changes;
    /** The game thread that waits here, while it does. */
    private Thread owner;

    InputPump(String label) {
        this.label = label;
    }

    /**
     * Game thread: waits for an input of the seat to be done ({@code done} opens), running the seat's actions here
     * meanwhile, deferred ones first (they were sent first). Actions still queued when it ends are handed back
     * ({@link #offer} returns false). {@code auto} is asked on the game thread before each wait for an action: an
     * action it returns runs as the seat's (a seat out of the game stops its input).
     */
    void await(CountDownLatch done, Supplier<Runnable> auto) throws InterruptedException {
        boolean wasIdle;
        synchronized (lock) {
            if (depth == 0) {
                owner = Thread.currentThread();
            }
            depth++;
            changes++;
            wasIdle = idle;
            idle = true;
            lock.notifyAll();
        }
        try {
            while (done.getCount() > 0) {
                Runnable a = auto.get();
                Job j;
                synchronized (lock) {
                    Deferred d = a == null ? nextReady() : null;
                    j = a != null ? new Job(a) : d != null ? new Job(d.action) : jobs.poll();
                    if (j == null) {
                        lock.wait(POLL_MS);
                        continue;
                    }
                }
                runJob(j);
            }
            // The input may have ended on the EDT (its display stopped it) with work left there, e.g. the rest of
            // InputPayMana.updateMessage, which swaps the player's controller for an AI one (runAsAi): the game goes
            // on once it is over (issue #60).
            edtBarrier("after the input ended");
        } finally {
            synchronized (lock) {
                depth--;
                changes++;
                idle = wasIdle;
                if (depth == 0) {
                    owner = null;
                    for (Job j : jobs) {
                        j.state = State.RETURNED;
                    }
                    jobs.clear();
                }
                lock.notifyAll();
            }
        }
    }

    private void runJob(Job j) {
        edtBarrier("before an action"); // e.g. the input's own display, or the refresh the last action queued
        synchronized (lock) {
            idle = false;
            j.state = State.RUNNING;
            j.changesAtStart = changes;
        }
        try {
            j.action.run();
        } finally {
            synchronized (lock) {
                idle = true;
            }
            edtBarrier("after an action"); // what the action queued, e.g. InputPayMana.updateMessage
            synchronized (lock) {
                j.state = State.DONE;
                lock.notifyAll();
            }
        }
    }

    /**
     * Seat's action thread: runs {@code action} on the game thread waiting for this seat's input, and returns once it
     * ran, or once it opened another input (its next action answers that one). With no wait, waits up to
     * {@link #INPUT_GRACE_MS} while {@code inputSet} (the game thread set an input and is about to wait for it).
     * Returns false, without running it, when no wait came, or when the wait ended before the action ran (its input
     * closed meanwhile), or when {@code abandoned} (the seat closed).
     */
    boolean offer(Runnable action, BooleanSupplier inputSet, BooleanSupplier abandoned) throws InterruptedException {
        Job j = new Job(action);
        synchronized (lock) {
            long graceEnd = System.currentTimeMillis() + INPUT_GRACE_MS;
            while (depth == 0) {
                long left = graceEnd - System.currentTimeMillis();
                if (left <= 0 || !inputSet.getAsBoolean() || abandoned.getAsBoolean()) {
                    return false;
                }
                lock.wait(Math.min(left, POLL_MS));
            }
            jobs.add(j);
            lock.notifyAll();
            while (true) {
                if (j.state == State.DONE) {
                    return true;
                }
                if (j.state == State.RETURNED) {
                    return false;
                }
                if (j.state == State.RUNNING && changes != j.changesAtStart) {
                    return true; // the action opened another input (or its input closed under it): the next action may go
                }
                if (abandoned.getAsBoolean() && j.state == State.QUEUED) {
                    jobs.remove(j);
                    return false;
                }
                lock.wait(100); // the action may wait on a prompt: bounded by the seat's prompt timeout
            }
        }
    }

    /**
     * Any thread: runs {@code action} on the game thread at its next safe point where {@code ready} holds (checked
     * there): while it waits for this seat's input, or at a player's priority ({@link #runDeferred}); in order with the
     * seat's other actions. {@code drop} runs instead if the game ends first ({@link #dropDeferred}).
     */
    void defer(Runnable action, BooleanSupplier ready, Runnable drop) {
        synchronized (lock) {
            deferred.add(new Deferred(action, ready, drop));
            lock.notifyAll();
        }
    }

    /**
     * Game thread, at a safe point outside this seat's input waits (a player gets priority: state-based actions done,
     * nothing resolving): runs the deferred actions that are ready, then lets the EDT run what they queued.
     */
    void runDeferred() {
        if (!ThreadUtil.isGameThread()) {
            return;
        }
        boolean ran = false;
        while (true) {
            Deferred d;
            synchronized (lock) {
                if (depth > 0) {
                    return; // inside a wait of this seat: its loop runs them
                }
                d = nextReady();
            }
            if (d == null) {
                break;
            }
            ran = true;
            d.action.run();
        }
        if (ran) {
            edtBarrier("after a deferred action");
        }
    }

    /** The game ended or the seat closed: deferred actions will not run; each one's {@code drop} runs instead. */
    void dropDeferred() {
        List<Deferred> l;
        synchronized (lock) {
            l = new ArrayList<>(deferred);
            deferred.clear();
        }
        for (Deferred d : l) {
            d.drop.run();
        }
    }

    /** Under {@link #lock}: removes and returns the first deferred action that is ready, if any. */
    private Deferred nextReady() {
        for (Iterator<Deferred> it = deferred.iterator(); it.hasNext();) {
            Deferred d = it.next();
            if (d.ready.getAsBoolean()) {
                it.remove();
                return d;
            }
        }
        return null;
    }

    /**
     * Runs {@code read} (on the calling thread) if the game thread is waiting here and running nothing, holding it
     * there meanwhile; returns false, without running it, otherwise. {@code read} must not wait for the game thread.
     */
    boolean whileIdle(Runnable read) {
        synchronized (lock) {
            if (depth == 0 || !idle) {
                return false;
            }
            read.run();
            return true;
        }
    }

    /** The calling thread is the game thread waiting here (running an action). */
    boolean onWaitingThread() {
        synchronized (lock) {
            return depth > 0 && owner == Thread.currentThread();
        }
    }

    /** The game thread waits here (at any depth). */
    boolean waiting() {
        synchronized (lock) {
            return depth > 0;
        }
    }

    /** Deferred actions not run yet (tests). */
    int deferredCount() {
        synchronized (lock) {
            return deferred.size();
        }
    }

    /** Waits until the EDT has run what was queued on it before this call. Never on the EDT. */
    private void edtBarrier(String when) {
        if (FThreads.isGuiThread()) {
            return;
        }
        CountDownLatch ran = new CountDownLatch(1);
        GuiBase.getInterface().invokeInEdtLater(ran::countDown);
        try {
            if (!ran.await(EDT_MS, TimeUnit.MILLISECONDS)) {
                System.err.println("[web] " + label + ": the EDT is still busy " + EDT_MS + " ms " + when + "; the game thread goes on");
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }
}
