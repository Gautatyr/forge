package forge.web.bridge;

/**
 * One connected viewer. Implemented by the transport (WebSocket channel). Called on the game
 * thread under the stream's lock: must not block. The transport may drop messages for a slow
 * client; it then resubscribes the client, which starts again from a snapshot.
 */
public interface ClientSink {
    void send(String json);
}
