package forge.web.seat;

import java.util.ArrayDeque;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.function.BooleanSupplier;

import forge.gui.FThreads;
import forge.gui.GuiBase;

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
 * <p>Threads: {@link #await} on the game thread (nested when an action opens another input); {@link #offer} on the
 * seat's action thread, one action at a time; {@link #whileIdle} on any thread.
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

    private final String label;
    private final Object lock = new Object();
    private final ArrayDeque<Job> jobs = new ArrayDeque<>();
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
     * meanwhile. Actions still queued when it ends are handed back ({@link #offer} returns false).
     */
    void await(CountDownLatch done) throws InterruptedException {
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
                Job j;
                synchronized (lock) {
                    j = jobs.poll();
                    if (j == null) {
                        lock.wait(POLL_MS);
                        continue;
                    }
                }
                runJob(j);
            }
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
