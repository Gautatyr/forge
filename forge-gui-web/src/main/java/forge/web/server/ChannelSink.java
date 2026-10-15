package forge.web.server;

import java.util.ArrayDeque;
import java.util.concurrent.RejectedExecutionException;
import java.util.function.Consumer;

import forge.web.bridge.ClientSink;
import io.netty.channel.Channel;
import io.netty.handler.codec.http.websocketx.TextWebSocketFrame;

/**
 * One subscription of a WebSocket client to the stream, with a bounded send queue.
 *
 * <p>{@link #send} runs on the game thread and never blocks: it queues and schedules a drain on the
 * channel's event loop. The drain writes only while the channel is writable, so a stalled client
 * leaves messages here, not in Netty. When the queue would exceed {@link SendLimits}, it is dropped,
 * the subscription goes stale (later messages are dropped too) and {@code onOverflow} runs on the
 * event loop; the owner then replaces this subscription with a fresh one, which starts with a snapshot.
 * Messages sent while {@link #prime priming} (the greeting and snapshot) are never counted as overflow.
 */
final class ChannelSink implements ClientSink {

    private final Channel ch;
    private final SendLimits limits;
    private final Consumer<ChannelSink> onOverflow;
    private final ArrayDeque<String> queue = new ArrayDeque<>();
    private long queuedChars;
    private boolean priming;
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
            if (!priming && !queue.isEmpty()
                    && (queue.size() >= limits.maxMessages() || queuedChars + json.length() > limits.maxChars())) {
                dropQueue();
                stale = true;
                overflow = true;
            } else {
                queue.addLast(json);
                queuedChars += json.length();
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

    /** Runs {@code subscribe}, during which sent messages bypass the queue limits. */
    void prime(Runnable subscribe) {
        synchronized (this) {
            priming = true;
        }
        try {
            subscribe.run();
        } finally {
            synchronized (this) {
                priming = false;
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

    synchronized int queuedMessages() {
        return queue.size();
    }

    synchronized long queuedChars() {
        return queuedChars;
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
                next = queue.pollFirst();
                queuedChars -= next.length();
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
    }
}
