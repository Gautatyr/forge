package forge.web.bridge;

import static org.testng.Assert.assertEquals;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

import org.testng.annotations.Test;

import com.google.gson.JsonObject;

import forge.game.Game;
import forge.web.bridge.GameStream.HiddenPolicy;
import forge.web.bridge.visibility.TestEngine;

/** A seat's client count reaches its hooks in the order the clients came and went. */
public class GameStreamSeatClientsTest {

    @Test
    public void reconnectOverlappingTheOldCloseEndsWithTheRightCount() throws Exception {
        Game game = TestEngine.newGame(2);
        GameStream stream = new GameStream(HiddenPolicy.REDACT, null);
        stream.startGame(game.getView());
        List<Integer> seen = Collections.synchronizedList(new ArrayList<>());
        CountDownLatch inRemoveHook = new CountDownLatch(1);
        CountDownLatch addHookRan = new CountDownLatch(1);
        boolean[] armed = {false};
        stream.setSeatHooks(new GameStream.SeatHooks() {
            @Override
            public List<String> greeting(int seat) {
                return List.of();
            }

            @Override
            public void receive(int seat, JsonObject msg, ClientSink from) { }

            @Override
            public void clientsChanged(int seat, int clients) {
                if (armed[0] && clients == 0) {
                    inRemoveHook.countDown();
                    try {
                        // a reconnect racing this hook: under the lock it cannot run until the hook returns
                        addHookRan.await(300, TimeUnit.MILLISECONDS);
                    } catch (InterruptedException e) {
                        Thread.currentThread().interrupt();
                    }
                } else if (armed[0]) {
                    addHookRan.countDown();
                }
                seen.add(clients);
            }
        });
        ClientSink old = text -> { };
        stream.addClient(old, 0);
        armed[0] = true;
        seen.clear();

        Thread closing = new Thread(() -> stream.removeClient(old));
        closing.start();
        inRemoveHook.await(5, TimeUnit.SECONDS);
        Thread reconnecting = new Thread(() -> stream.addClient(text -> { }, 0));
        reconnecting.start();
        closing.join(5000);
        reconnecting.join(5000);

        assertEquals(stream.seatClientCount(0), 1);
        assertEquals(seen, List.of(0, 1), "the last count the seat hears is the current one");
    }
}
