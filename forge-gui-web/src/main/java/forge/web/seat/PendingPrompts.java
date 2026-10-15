package forge.web.seat;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentSkipListMap;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.concurrent.atomic.AtomicLong;

import com.google.gson.JsonElement;

/**
 * Open prompts of one seat. Ids come from an {@link AtomicLong}; each prompt waits on its own
 * future with a timeout and always yields a value: the client's validated answer, or the prompt's
 * engine default on timeout, disconnect or game end. Entries are removed when the waiter returns.
 * Not {@code ReplyPool}: that one waits forever, leaks entries and answers null.
 */
final class PendingPrompts {

    /** How a prompt closed. */
    enum Close { ANSWERED, TIMEOUT, DISCONNECTED, CANCELLED }

    /** One open prompt. {@link #text} is its JSON as sent to the seat, re-sent to a client that (re)connects. */
    static final class Pending {
        final long id;
        final Prompt prompt;
        volatile String text;
        final CompletableFuture<Object[]> done = new CompletableFuture<>();

        Pending(long id, Prompt prompt) {
            this.id = id;
            this.prompt = prompt;
        }
    }

    private final AtomicLong ids = new AtomicLong();
    private final Map<Long, Pending> open = new ConcurrentSkipListMap<>();

    Pending open(Prompt prompt) {
        Pending p = new Pending(ids.incrementAndGet(), prompt);
        open.put(p.id, p);
        return p;
    }

    /**
     * Blocks until the prompt is answered or closed, at most {@code timeoutMs}; then removes it.
     * Returns {value, Close}.
     */
    Object[] await(Pending p, long timeoutMs) {
        try {
            return p.done.get(timeoutMs, TimeUnit.MILLISECONDS);
        } catch (TimeoutException e) {
            close(p, Close.TIMEOUT);
            return p.done.getNow(new Object[] {p.prompt.fallback(), Close.TIMEOUT});
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            close(p, Close.CANCELLED);
            return new Object[] {p.prompt.fallback(), Close.CANCELLED};
        } catch (ExecutionException e) {
            return new Object[] {p.prompt.fallback(), Close.CANCELLED};
        } finally {
            open.remove(p.id);
        }
    }

    /**
     * A client's reply. Returns null when accepted, else why it was refused (unknown id, already
     * closed, or invalid for the prompt; an invalid reply leaves the prompt open).
     */
    String reply(long id, JsonElement value) {
        Pending p = open.get(id);
        if (p == null) {
            return "no open prompt " + id;
        }
        Object decoded;
        try {
            decoded = p.prompt.decode(value);
        } catch (Prompt.BadReply e) {
            return e.getMessage();
        } catch (RuntimeException e) {
            return "invalid reply";
        }
        return p.done.complete(new Object[] {decoded, Close.ANSWERED}) ? null : "prompt " + id + " already closed";
    }

    /** Closes one prompt with its engine default. */
    boolean close(Pending p, Close why) {
        return p.done.complete(new Object[] {p.prompt.fallback(), why});
    }

    /** Closes every open prompt with its engine default; returns those closed. */
    List<Pending> closeAll(Close why) {
        List<Pending> closed = new ArrayList<>();
        for (Pending p : open.values()) {
            if (close(p, why)) {
                closed.add(p);
            }
        }
        return closed;
    }

    /** JSON of the open prompts, oldest first. */
    List<String> openTexts() {
        List<String> l = new ArrayList<>();
        for (Pending p : open.values()) {
            String t = p.text;
            if (t != null && !p.done.isDone()) {
                l.add(t);
            }
        }
        return l;
    }

    int openCount() {
        return open.size();
    }
}
