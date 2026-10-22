package forge.fork.web.bridge;

import static org.testng.Assert.assertEquals;
import static org.testng.Assert.assertFalse;
import static org.testng.Assert.assertTrue;

import java.util.Arrays;
import java.util.List;
import java.util.Map;

import org.testng.annotations.Test;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

import forge.card.CardStateName;
import forge.card.GamePieceType;
import forge.game.card.CardView;
import forge.gamemodes.net.DeltaPacket;
import forge.trackable.TrackableCollection;
import forge.trackable.TrackableProperty;
import forge.trackable.Tracker;

public class WireEncoderTest {

    @Test
    public void kindsAreDerivedFromTrackableTypes() {
        assertEquals(WireSchema.kindOf(TrackableProperty.Life), WireSchema.Kind.INT);
        assertEquals(WireSchema.kindOf(TrackableProperty.Battlefield), WireSchema.Kind.CARDS);
        assertEquals(WireSchema.kindOf(TrackableProperty.CurrentState), WireSchema.Kind.CARD_STATE);
        assertEquals(WireSchema.kindOf(TrackableProperty.Phase), WireSchema.Kind.ENUM);
        assertEquals(WireSchema.kindOf(TrackableProperty.EntityAttachedTo), WireSchema.Kind.ENTITY);
        assertEquals(WireSchema.kindOf(TrackableProperty.CombatView), WireSchema.Kind.COMBAT);
        assertEquals(WireSchema.kindOf(TrackableProperty.PlayerTurn), WireSchema.Kind.PLAYER);
        // every property gets a kind, so the schema covers the whole enum plus the bridge's own properties
        assertEquals(WireSchema.schemaJson().size(), TrackableProperty.values().length + WireSchema.FORK_PROPERTIES.size());
    }

    @Test
    public void referencesBecomeIdsInBothNetworkAndLiveForm() {
        // network form (DeltaSyncManager.toNetworkValue output)
        assertEquals(WireEncoder.encodeValue(TrackableProperty.Battlefield, Arrays.asList(3, 4)).toString(), "[3,4]");
        assertEquals(WireEncoder.encodeValue(TrackableProperty.EntityAttachedTo, new int[] {1, 5}).toString(),
                "{\"type\":\"player\",\"id\":5}");
        assertEquals(WireEncoder.encodeValue(TrackableProperty.CurrentState, CardStateName.Original.ordinal()).getAsString(),
                "Original");
        // live form (raw TrackableObject values)
        Tracker tracker = new Tracker();
        TrackableCollection<CardView> cards = new TrackableCollection<>();
        cards.add(new CardView(7, tracker));
        cards.add(new CardView(-2, tracker));
        assertEquals(WireEncoder.encodeValue(TrackableProperty.Hand, cards).toString(), "[7,-2]");
        assertEquals(WireEncoder.encodeValue(TrackableProperty.EntityAttachedTo, new CardView(9, tracker)).toString(),
                "{\"type\":\"card\",\"id\":9}");
        // enums go by name (PhaseType would need the Localizer, so use a forge-core enum)
        assertEquals(WireEncoder.encodeValue(TrackableProperty.GamePieceType, GamePieceType.TOKEN).getAsString(), "TOKEN");
        assertTrue(WireEncoder.encodeValue(TrackableProperty.Life, null).isJsonNull());
    }

    @Test
    public void deltaKeysDecodeToTypedIdsIncludingNegativeCardStateIds() {
        Tracker tracker = new Tracker();
        CardView token = new CardView(-5, tracker);
        int key = DeltaPacket.makeDeltaKey(token.getCurrentState());
        WireEncoder.ObjRef ref = WireEncoder.decodeKey(key);
        assertEquals(ref.type(), "cardState");
        assertEquals(ref.id(), -5);
        assertEquals(ref.state(), "Original");
        assertEquals(ref.key(), "cardState:-5:Original");

        WireEncoder.ObjRef card = WireEncoder.decodeKey(DeltaPacket.makeDeltaKey(token));
        assertEquals(card.key(), "card:-5");
    }

    @Test
    public void mirrorPrunesObjectsNoLongerReachableFromTheGame() {
        StateMirror mirror = new StateMirror();
        mirror.putNew(obj("game", 1, null, "{\"Players\":[1],\"Turn\":3}"));
        mirror.putNew(obj("player", 1, null, "{\"Battlefield\":[10,11],\"Life\":20}"));
        mirror.putNew(obj("card", 10, null, "{\"Name\":\"Bear\",\"CurrentState\":\"Original\"}"));
        mirror.putNew(obj("cardState", 10, "Original", "{\"Power\":2}"));
        mirror.putNew(obj("card", 11, null, "{\"Name\":\"Elf\",\"CurrentState\":\"Original\"}"));
        mirror.putNew(obj("cardState", 11, "Original", "{\"Power\":1}"));
        mirror.setRoot("game:1");
        assertTrue(mirror.prune().isEmpty());

        // card 11 leaves the battlefield and is referenced nowhere else
        mirror.merge("player:1", JsonParser.parseString("{\"Battlefield\":[10],\"Life\":null}").getAsJsonObject());
        List<String> removed = mirror.prune();
        assertEquals(removed, Arrays.asList("card:11", "cardState:11:Original"));
        assertFalse(mirror.get("player:1").props().has("Life"), "null clears a property back to its default");

        JsonArray objects = mirror.toJsonObjects();
        assertEquals(objects.size(), 4);
        JsonObject first = objects.get(0).getAsJsonObject();
        assertEquals(first.get("type").getAsString(), "game");
        assertEquals(first.get("id").getAsInt(), 1);
        assertTrue(first.get("props").isJsonObject());
    }

    @Test
    public void mirrorRewritesRenamedCardReferences() {
        StateMirror mirror = new StateMirror();
        mirror.putNew(obj("game", 1, null, "{\"Players\":[1],\"CombatView\":[{\"attackers\":[10],"
                + "\"defender\":{\"type\":\"player\",\"id\":1},\"blockers\":[11],\"plannedBlockers\":[]}]}"));
        mirror.putNew(obj("player", 1, null, "{\"Battlefield\":[10,11],\"Life\":20}"));
        mirror.putNew(obj("card", 10, null, "{\"AttachedCards\":[11]}"));
        mirror.putNew(obj("card", 11, null, "{\"EntityAttachedTo\":{\"type\":\"card\",\"id\":10},\"PairedWith\":10}"));

        Map<String, JsonObject> changed = mirror.rewriteCardRefs(p -> id -> id == 10 ? 500 : id);
        assertEquals(changed.get("player:1").toString(), "{\"Battlefield\":[500,11]}");
        assertEquals(changed.get("card:11").toString(),
                "{\"EntityAttachedTo\":{\"type\":\"card\",\"id\":500},\"PairedWith\":500}");
        assertEquals(changed.get("game:1").getAsJsonArray("CombatView").get(0).getAsJsonObject()
                .get("attackers").toString(), "[500]");
        assertFalse(changed.containsKey("card:10"), "card 10's own props do not reference it");
        assertEquals(mirror.get("player:1").props().get("Battlefield").toString(), "[500,11]");
        assertEquals(mirror.get("player:1").props().get("Life").getAsInt(), 20);
    }

    @Test
    public void mirrorRewritesEachPropertyThroughItsOwnMapping() {
        StateMirror mirror = new StateMirror();
        mirror.putNew(obj("game", 1, null, "{\"RevealedCardsCollection\":[10],\"Players\":[1]}"));
        mirror.putNew(obj("player", 1, null, "{\"Hand\":[10],\"Life\":20}"));
        mirror.putNew(obj("card", 11, null, "{\"ImprintedCards\":[10]}"));

        Map<String, JsonObject> changed = mirror.rewriteCardRefs(p -> "Hand".equals(p) ? id -> 500
                : "ImprintedCards".equals(p) ? id -> -1 : null);
        assertEquals(changed.get("player:1").toString(), "{\"Hand\":[500]}");
        assertEquals(changed.get("card:11").toString(), "{\"ImprintedCards\":[-1]}");
        assertFalse(changed.containsKey("game:1"), "a property without a mapping is left as is");
        assertEquals(mirror.get("game:1").props().get("RevealedCardsCollection").toString(), "[10]");
    }

    private static StateMirror.Obj obj(String type, int id, String state, String propsJson) {
        JsonElement props = JsonParser.parseString(propsJson);
        return new StateMirror.Obj(type, id, state, props.getAsJsonObject());
    }
}
