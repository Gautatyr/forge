package forge.web.bridge;

import forge.game.card.CardView;
import forge.web.bridge.visibility.Visibility;

/**
 * How one seat names and sees cards, for messages sent to that seat only (prompts, calls). Valid
 * only inside {@link GameStream#sendToSeat}, under the stream's lock.
 */
public interface SeatRefs {

    /** The id this seat knows the card by outside zone lists ({@code ViewerStream.refOf}); -1 if unknown. */
    int card(int realId);

    /** What this seat may see of the card now (engine view rules). */
    Visibility visibility(CardView card);
}
