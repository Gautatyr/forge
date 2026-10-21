package forge.fork.web.bridge;

/**
 * One connected viewer. Implemented by the transport (WebSocket channel). Called under the stream's
 * lock, on the game thread or, for the greeting and snapshot, on the thread adding the client: must
 * not block. The transport may drop messages for a slow
 * client; it then resubscribes the client, which starts again from a snapshot.
 */
public interface ClientSink {
    void send(String json);
}
