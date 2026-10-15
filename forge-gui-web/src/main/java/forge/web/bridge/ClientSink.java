package forge.web.bridge;

/** One connected viewer. Implemented by the transport (WebSocket channel); must not block. */
public interface ClientSink {
    void send(String json);
}
