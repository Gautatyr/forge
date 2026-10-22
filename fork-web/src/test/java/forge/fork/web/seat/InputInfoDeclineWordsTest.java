package forge.fork.web.seat;

import static org.testng.Assert.assertEquals;

import org.testng.annotations.Test;

/** The Cancel label of an "unless" cost (issue #81): the engine's stack description worded for the seat, no card ids. */
public class InputInfoDeclineWordsTest {

    @Test
    public void theSeatAsSubjectBecomesYou() {
        // Torment of Hailfire, as the engine words it when the human seat is named "You" (WebMain).
        assertEquals(InputInfo.declineWords(" You loses 3 life.", "You", "Mira"), "You lose 3 life");
        assertEquals(InputInfo.declineWords("Hugo loses 3 life.", "Hugo", "Mira"), "You lose 3 life");
        assertEquals(InputInfo.declineWords("Hugo has 2 cards.", "Hugo", "Mira"), "You have 2 cards");
        assertEquals(InputInfo.declineWords("Hugo passes.", "Hugo", "Mira"), "You pass");
        assertEquals(InputInfo.declineWords("Hugo copies Shock (4).", "Hugo", "Mira"), "You copy Shock");
    }

    @Test
    public void aSubjectlessVerbIsTheControllers() {
        // Drekavac: SacrificeEffect writes "Sacrifices <host>" with no subject; its controller sacrifices.
        assertEquals(InputInfo.declineWords("Sacrifices Drekavac (23)", "You", "You"), "You sacrifice Drekavac");
        assertEquals(InputInfo.declineWords("Sacrifices Drekavac (23)", "Hugo", "Mira"), "Mira sacrifices Drekavac");
    }

    @Test
    public void otherPlayersAndCardsKeepTheEngineWords() {
        assertEquals(InputInfo.declineWords("Mira loses 3 life.", "Hugo", "Mira"), "Mira loses 3 life");
        assertEquals(InputInfo.declineWords("Drekavac (23) deals 2 damage to Hugo.", "Hugo", "Mira"), "Drekavac deals 2 damage to you");
        assertEquals(InputInfo.declineWords("Mira draws a card for each of Hugo's lands.", "Hugo", "Mira"),
                "Mira draws a card for each of your lands");
        // A seat name that starts a card name is not the seat.
        assertEquals(InputInfo.declineWords("Goblin Guide (7) deals 2 damage to Mira.", "Goblin", "Mira"),
                "Goblin Guide deals 2 damage to Mira");
    }
}
