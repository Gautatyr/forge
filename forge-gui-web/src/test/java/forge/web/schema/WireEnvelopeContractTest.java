package forge.web.schema;

import static org.testng.Assert.assertEquals;
import static org.testng.Assert.assertTrue;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.TreeSet;

import org.testng.annotations.Test;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

import forge.game.card.CardView;
import forge.game.player.PlayerView;
import forge.game.spellability.StackItemView;
import forge.trackable.Tracker;
import forge.web.bridge.GameStream;
import forge.web.bridge.WireEncoder;

/** The envelope the generator describes matches what the bridge actually sends. */
public class WireEnvelopeContractTest {

    @Test
    public void helloAndSnapshotFieldsMatchTheGeneratedEnvelope() {
        List<String> sent = new ArrayList<>();
        GameStream stream = new GameStream(GameStream.HiddenPolicy.REDACT, null);
        stream.addClient(sent::add);
        assertEquals(sent.size(), 2);

        JsonObject hello = JsonParser.parseString(sent.get(0)).getAsJsonObject();
        assertEquals(hello.keySet(), fields("hello"));
        assertEquals(hello.get("t").getAsString(), "hello");
        assertEquals(hello.get("v").getAsInt(), WireEnvelope.VERSION);
        assertTrue(WireModel.enumConstants(GameStream.HiddenPolicy.class).contains(hello.get("hidden").getAsString()));

        JsonObject snapshot = JsonParser.parseString(sent.get(1)).getAsJsonObject();
        assertEquals(snapshot.keySet(), fields("snapshot"));
        assertEquals(snapshot.get("t").getAsString(), "snapshot");
    }

    @Test
    public void objectTypeNamesMatchTheEncoder() {
        Tracker tracker = new Tracker();
        CardView card = new CardView(3, tracker);
        assertEquals(WireEncoder.refOf(card).type(), objectType(CardView.class));
        assertEquals(WireEncoder.refOf(card.getCurrentState()).type(), objectType(CardView.CardStateView.class));
        assertEquals(WireEncoder.refOf(new PlayerView(1, tracker)).type(), objectType(PlayerView.class));
        assertEquals(WireEncoder.refOf(new StackItemView(4, tracker)).type(), objectType(StackItemView.class));
    }

    private static Set<String> fields(String t) {
        for (WireEnvelope.Message m : WireEnvelope.MESSAGES) {
            if (m.t().equals(t)) {
                Set<String> s = new TreeSet<>();
                for (WireEnvelope.Field f : m.fields()) {
                    if (!f.optional()) {
                        s.add(f.name());
                    }
                }
                return s;
            }
        }
        throw new AssertionError("no envelope message " + t);
    }

    private static String objectType(Class<?> view) {
        for (WireModel.ObjectType o : WireModel.OBJECT_TYPES) {
            if (o.view() == view) {
                return o.name();
            }
        }
        throw new AssertionError("no object type for " + view);
    }
}
