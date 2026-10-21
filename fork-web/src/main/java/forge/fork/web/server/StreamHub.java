package forge.fork.web.server;

import com.google.gson.JsonObject;

import forge.fork.web.bridge.ClientSink;
import forge.fork.web.bridge.GameStream;

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

    /**
     * A message from a seat's client (a prompt reply or a player action), on the channel's event
     * loop: must not block. {@code seat} comes from the client's token, never from the message.
     */
    default void clientMessage(int seat, JsonObject msg, ClientSink from) { }

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

            @Override
            public void clientMessage(int seat, JsonObject msg, ClientSink from) {
                stream.clientMessage(seat, msg, from);
            }
        };
    }
}
