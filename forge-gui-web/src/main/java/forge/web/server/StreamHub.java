package forge.web.server;

import forge.web.bridge.ClientSink;
import forge.web.bridge.GameStream;

/**
 * What the server needs from a game stream. {@link #addClient} must send the client its greeting
 * and a full snapshot, then subscribe it to deltas, atomically with respect to publishing.
 */
public interface StreamHub {
    void addClient(ClientSink c);

    void removeClient(ClientSink c);

    int clientCount();

    /** Full snapshot as JSON, for {@code /state}. */
    String snapshot();

    String metricsJson();

    static StreamHub of(GameStream stream) {
        return new StreamHub() {
            @Override
            public void addClient(ClientSink c) {
                stream.addClient(c);
            }

            @Override
            public void removeClient(ClientSink c) {
                stream.removeClient(c);
            }

            @Override
            public int clientCount() {
                return stream.clientCount();
            }

            @Override
            public String snapshot() {
                return stream.snapshot();
            }

            @Override
            public String metricsJson() {
                return stream.metricsJson();
            }
        };
    }
}
