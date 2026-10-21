package forge.fork.web.server;

import java.util.ArrayDeque;
import java.util.concurrent.RejectedExecutionException;
import java.util.function.Consumer;

import forge.fork.web.bridge.ClientSink;
import io.netty.channel.Channel;
import io.netty.handler.codec.http.websocketx.TextWebSocketFrame;

/**
 * One subscription of a WebSocket client to the stream, with a bounded send queue.
 *
 * <p>{@link #send} never blocks: it queues and schedules a drain on the channel's event loop. The
 * drain writes only while the channel is writable, so a stalled client leaves messages here, not in
 * Netty. When the backlog would exceed {@link SendLimits}, the queue is dropped, the subscription
 * goes stale (later messages are dropped too) and {@code onOverflow} runs on the event loop; the
 * owner then replaces this subscription with a fresh one, which starts with a snapshot.
 *
 * <p>The greeting and snapshot, sent from inside {@link #prime} on the thread running it, are queued
 * but are not backlog: they never overflow, and later messages are checked against the backlog
 * only. Every other send counts, including one from the game thread while priming.
 */
final class ChannelSink implements ClientSink {

    private record Entry(String json, boolean backlog) {
    }

    private final Channel ch;
    private final SendLimits limits;
    private final Consumer<ChannelSink> onOverflow;
    private final ArrayDeque<Entry> queue = new ArrayDeque<>();
    private long queuedChars;
    private int backlogMessages;
    private long backlogChars;
    private Thread primingThread;
    private boolean stale;
    private boolean closed;
    private boolean drainScheduled;

    ChannelSink(Channel ch, SendLimits limits, Consumer<ChannelSink> onOverflow) {
        this.ch = ch;
        this.limits = limits;
        this.onOverflow = onOverflow;
    }

    Channel channel() {
        return ch;
    }

    @Override
    public void send(String json) {
        boolean overflow = false;
        boolean schedule = false;
        synchronized (this) {
            if (stale || closed) {
                return;
            }
            boolean backlog = primingThread != Thread.currentThread();
            if (backlog && backlogMessages > 0
                    && (backlogMessages >= limits.maxMessages() || backlogChars + json.length() > limits.maxChars())) {
                dropQueue();
                stale = true;
                overflow = true;
            } else {
                queue.addLast(new Entry(json, backlog));
                queuedChars += json.length();
                if (backlog) {
                    backlogMessages++;
                    backlogChars += json.length();
                }
                schedule = !drainScheduled;
                drainScheduled = true;
            }
        }
        try {
            if (overflow) {
                ch.eventLoop().execute(() -> onOverflow.accept(this));
            } else if (schedule) {
                ch.eventLoop().execute(this::drain);
            }
        } catch (RejectedExecutionException e) {
            close(); // server shutting down: never throw into the game thread
        }
    }

    /** Runs {@code subscribe}; what it sends on the calling thread is exempt from the queue limits. */
    void prime(Runnable subscribe) {
        synchronized (this) {
            primingThread = Thread.currentThread();
        }
        try {
            subscribe.run();
        } finally {
            synchronized (this) {
                primingThread = null;
            }
        }
    }

    /** Event loop: resumes draining after the channel became writable again. */
    void kick() {
        synchronized (this) {
            if (closed || stale || queue.isEmpty() || drainScheduled) {
                return;
            }
            drainScheduled = true;
        }
        drain();
    }

    /** Drops everything queued and everything sent later. */
    synchronized void close() {
        closed = true;
        dropQueue();
    }

    synchronized boolean isStale() {
        return stale;
    }

    /** Everything queued, greeting and snapshot included. */
    synchronized int queuedMessages() {
        return queue.size();
    }

    synchronized long queuedChars() {
        return queuedChars;
    }

    /** Queued messages that count against {@link SendLimits}. */
    synchronized int backlogMessages() {
        return backlogMessages;
    }

    synchronized long backlogChars() {
        return backlogChars;
    }

    private void drain() {
        boolean wrote = false;
        for (;;) {
            String next;
            synchronized (this) {
                if (closed || stale || queue.isEmpty() || !ch.isWritable()) {
                    drainScheduled = false;
                    break;
                }
                Entry e = queue.pollFirst();
                next = e.json();
                queuedChars -= next.length();
                if (e.backlog()) {
                    backlogMessages--;
                    backlogChars -= next.length();
                }
            }
            ch.write(new TextWebSocketFrame(next));
            wrote = true;
        }
        if (wrote) {
            ch.flush();
        }
    }

    private void dropQueue() {
        queue.clear();
        queuedChars = 0;
        backlogMessages = 0;
        backlogChars = 0;
    }
}
