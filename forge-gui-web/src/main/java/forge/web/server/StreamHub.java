package forge.web.server;

import forge.web.bridge.ClientSink;
import forge.web.bridge.GameStream;

/**
 * What the server needs from a game stream. {@link #addClient} must send the client its greeting
 * and a full snapshot, then subscribe it to deltas, atomically with respect to publishing.
 * A seat is an index in the game's player list, {@link GameStream#SPECTATOR} for none.
 */
public interface StreamHub {
    void addClient(ClientSink c, int seat);

    void removeClient(ClientSink c);

    int clientCount();

    /** That seat's full snapshot as JSON, for {@code /state}. */
    String snapshot(int seat);

    String metricsJson();

    static StreamHub of(GameStream stream) {
        return new StreamHub() {
            @Override
            public void addClient(ClientSink c, int seat) {
                stream.addClient(c, seat);
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
            public String snapshot(int seat) {
                return stream.snapshot(seat);
            }

            @Override
            public String metricsJson() {
                return stream.metricsJson();
            }
        };
    }
}
