package forge.fork.web.bridge.visibility;

import static org.testng.Assert.assertEquals;
import static org.testng.Assert.assertFalse;
import static org.testng.Assert.assertNull;
import static org.testng.Assert.assertTrue;

import java.util.List;

import org.testng.annotations.BeforeClass;
import org.testng.annotations.BeforeMethod;
import org.testng.annotations.Test;

import com.google.gson.JsonObject;

import forge.game.Game;
import forge.game.card.Card;
import forge.game.player.Player;
import forge.game.zone.ZoneType;
import forge.fork.web.bridge.GameStream;
import forge.fork.web.bridge.GameStream.HiddenPolicy;

/** Per-seat card-text language over a real engine game: translated fields, same visibility. */
public class SeatLanguageTest {

    private Game game;
    private Player p0;
    private Player p1;
    private GameStream stream;
    private ClientModel fr;
    private ClientModel en;
    private ClientModel spectator;
    private Card bolt;
    private Card elves;
    private Card bears;

    @BeforeClass
    public void boot() {
        TestEngine.boot();
    }

    @BeforeMethod
    public void start() {
        game = TestEngine.newGame(2);
        p0 = game.getPlayers().get(0);
        p1 = game.getPlayers().get(1);
        stream = new GameStream(HiddenPolicy.REDACT, null);
        stream.startGame(game.getView());
        stream.setSeatLanguage(0, "fr");
        fr = new ClientModel();
        en = new ClientModel();
        spectator = new ClientModel();
        stream.addClient(fr, 0);
        stream.addClient(en, 1);
        stream.addClient(spectator);
        bolt = TestEngine.add("Lightning Bolt", p0, ZoneType.Hand);
        elves = TestEngine.add("Llanowar Elves", p1, ZoneType.Battlefield);
        bears = TestEngine.add("Grizzly Bears", p1, ZoneType.Battlefield);
        bears.turnFaceDown(true);
        for (int i = 0; i < 3; i++) {
            TestEngine.add("Island", p0, ZoneType.Library);
            TestEngine.add("Island", p1, ZoneType.Library);
        }
        stream.publish(List.of(), false);
    }

    private static String prop(ClientModel c, String key, String name) {
        JsonObject p = c.props(key);
        return p == null || !p.has(name) ? null : p.get(name).getAsString();
    }

    private static String state(ClientModel c, int id, String name) {
        return prop(c, "cardState:" + id + ":Original", name);
    }

    private void assertConsistent() {
        assertNull(fr.diffAgainst(stream.snapshot(0)));
        assertNull(en.diffAgainst(stream.snapshot(1)));
        assertNull(spectator.diffAgainst(stream.snapshot()));
        assertTrue(fr.errors.isEmpty() && en.errors.isEmpty() && spectator.errors.isEmpty());
    }

    @Test
    public void frenchSeatGetsTranslationsAlongsideEnglish() {
        int id = bolt.getId();
        assertEquals(prop(fr, "card:" + id, "LocalName"), "Foudre");
        assertEquals(state(fr, id, "LocalName"), "Foudre");
        assertEquals(state(fr, id, "Name"), "Lightning Bolt", "the English fields stay: the client's logic keys on them");
        assertEquals(prop(fr, "card:" + id, "Name"), "Lightning Bolt");
        assertEquals(state(fr, id, "OracleName"), "Lightning Bolt");
        assertEquals(state(fr, id, "Type"), "Instant");
        assertEquals(state(fr, id, "LocalType"), "Éphémère");
        assertTrue(state(fr, id, "OracleText").startsWith("Lightning Bolt deals 3"), state(fr, id, "OracleText"));
        assertTrue(state(fr, id, "LocalOracleText").startsWith("La Foudre inflige 3 blessures"), state(fr, id, "LocalOracleText"));

        // a public card: French for the French seat, no Local* for the other seat and the spectator
        int e = elves.getId();
        assertEquals(state(fr, e, "LocalName"), "Elfes de Llanowar");
        assertTrue(state(fr, e, "Type").startsWith("Creature"), state(fr, e, "Type"));
        assertTrue(state(fr, e, "LocalType").startsWith("Créature"), state(fr, e, "LocalType"));
        assertTrue(state(fr, e, "OracleText").contains("Add {G}"), state(fr, e, "OracleText"));
        assertTrue(state(fr, e, "LocalOracleText").contains("Ajoutez {G}"), state(fr, e, "LocalOracleText"));
        for (ClientModel c : List.of(en, spectator)) {
            assertEquals(state(c, e, "Name"), "Llanowar Elves");
            assertNull(state(c, e, "LocalName"));
            assertNull(prop(c, "card:" + e, "LocalName"));
            assertNull(state(c, e, "LocalOracleText"));
            assertTrue(state(c, e, "OracleText").contains("Add {G}"), state(c, e, "OracleText"));
        }
        assertConsistent();
    }

    @Test
    public void nothingFrenchReachesEnglishViewersOrHiddenCards() {
        for (ClientModel c : List.of(en, spectator)) {
            for (String word : List.of("Foudre", "Elfes de Llanowar", "Éphémère", "Grizzlis", "Créature", "Local")) {
                // the hello's schema names the Local* properties for every viewer; no object carries one
                assertFalse(c.allText().replaceAll("\"Local(Name|Type|OracleText)\":\"string\"", "").contains(word), "English viewer got " + word);
            }
        }
        // the French seat's view of the opponent's hand-held or face-down card names nothing, in either language
        String text = fr.allText();
        assertFalse(text.contains("Grizzly") || text.contains("Grizzlis"), "face-down card named");
        assertFalse(en.allText().contains("Lightning Bolt"), "hand card leaked to the other seat");
        assertFalse(spectator.allText().contains("Lightning Bolt"));
        assertConsistent();
    }

    @Test
    public void switchingLanguageResendsWhatTheSeatSees() {
        int id = bolt.getId();
        int mark = fr.mark();
        stream.setSeatLanguage(0, "en");
        assertNull(state(fr, id, "LocalName"));
        assertNull(prop(fr, "card:" + id, "LocalName"));
        assertNull(state(fr, id, "LocalType"));
        assertNull(state(fr, id, "LocalOracleText"));
        assertEquals(state(fr, id, "Name"), "Lightning Bolt");
        assertNull(state(fr, elves.getId(), "LocalName"));
        assertFalse(fr.textSince(mark).contains("Grizzly"), "switch must not name the face-down card");
        assertEquals(fr.errors, List.of());
        assertConsistent();

        stream.setSeatLanguage(0, "fr");
        assertEquals(state(fr, id, "LocalName"), "Foudre");
        assertEquals(state(fr, id, "Name"), "Lightning Bolt");
        assertEquals(state(fr, elves.getId(), "LocalName"), "Elfes de Llanowar");
        // other viewers are not sent anything by the switch
        int enMark = en.mark();
        stream.setSeatLanguage(0, "en");
        assertEquals(en.mark(), enMark);
        assertConsistent();
    }

    @Test
    public void cardsThatArriveAfterTheSwitchFollowTheLanguage() {
        Card drawn = TestEngine.add("Grizzly Bears", p0, ZoneType.Hand);
        stream.publish(List.of(), false);
        assertEquals(state(fr, drawn.getId(), "LocalName"), "Grizzlis");
        stream.setSeatLanguage(0, "en");
        Card later = TestEngine.add("Llanowar Elves", p0, ZoneType.Hand);
        stream.publish(List.of(), false);
        assertNull(state(fr, later.getId(), "LocalName"));
        assertNull(state(fr, drawn.getId(), "LocalName"));
        assertConsistent();
    }

    @Test
    public void unknownLanguageAndSpectatorStayEnglish() {
        stream.setSeatLanguage(0, "klingon");
        assertNull(state(fr, bolt.getId(), "LocalName"));
        stream.setSeatLanguage(-1, "fr");
        assertEquals(state(spectator, elves.getId(), "Name"), "Llanowar Elves");
        assertConsistent();
    }

    @Test
    public void languageSurvivesTheNextGame() {
        stream.startGame(game.getView());
        stream.publish(List.of(), false);
        assertEquals(state(fr, elves.getId(), "LocalName"), "Elfes de Llanowar");
    }

    @Test
    public void aMidGameChangeOfAFullCardUpdatesItsTranslation() {
        int e = elves.getId();
        assertEquals(state(fr, e, "LocalType").startsWith("Créature"), true);
        // an effect changes the type line: the printed translation no longer applies, the stale one is removed
        elves.addChangedCardTypes(forge.card.CardType.parse("Artifact", false), null, false, java.util.EnumSet.noneOf(forge.card.RemoveType.class),
                game.getNextTimestamp(), 0, true, false);
        stream.publish(List.of(), false);
        assertTrue(state(fr, e, "Type").startsWith("Artifact Creature"), state(fr, e, "Type"));
        assertNull(state(fr, e, "LocalType"));
        assertEquals(state(fr, e, "LocalName"), "Elfes de Llanowar");
        assertConsistent();
    }

    @Test
    public void aTypeLineChangedByAnEffectIsNotReplacedByThePrintedOne() {
        assertEquals(CardText.type("fr-FR", "Llanowar Elves", null, "Artifact Creature — Elf Druid"), null);
        assertEquals(CardText.oracle("fr-FR", "Llanowar Elves", null, "Something else"), null);
    }
}
