package forge.web.bridge.visibility;

import java.util.List;

import com.google.gson.JsonObject;

import forge.game.card.CardView;
import forge.game.player.PlayerView;

/**
 * Who is looking: one seat (a player of the game), a spectator, or an omniscient debug viewer.
 * Visibility follows the engine's own view rules, {@link CardView#canBeShownTo} and
 * {@link CardView#canFaceDownBeShownTo}, which already account for hidden zones, face-down cards,
 * temporary reveals ({@code PlayerMayLook}: reveals, scry, surveil, {@code DelayedReveal}) and
 * control of another player's turn.
 *
 * <p>A spectator may know only what every seat may know: a card revealed to one player stays
 * hidden from the spectator; a card revealed to all is public.
 */
public final class Viewer {

    private final int seat;
    private final PlayerView player;
    private final List<PlayerView> seats;
    private final boolean omniscient;

    private Viewer(int seat, PlayerView player, List<PlayerView> seats, boolean omniscient) {
        this.seat = seat;
        this.player = player;
        this.seats = List.copyOf(seats);
        this.omniscient = omniscient;
    }

    public static Viewer seat(int index, List<PlayerView> seats) {
        return new Viewer(index, seats.get(index), seats, false);
    }

    public static Viewer spectator(List<PlayerView> seats) {
        return new Viewer(-1, null, seats, false);
    }

    /** Debug only ({@code --hidden full}): sees everything, as network play sends it. */
    public static Viewer omniscient(int index, List<PlayerView> seats) {
        return new Viewer(index, index < 0 ? null : seats.get(index), seats, true);
    }

    public boolean isSpectator() {
        return player == null;
    }

    public int seatIndex() {
        return seat;
    }

    public PlayerView player() {
        return player;
    }

    public Visibility of(CardView c) {
        if (omniscient) {
            return Visibility.FULL;
        }
        try {
            if (player != null) {
                if (!c.canBeShownTo(player)) {
                    return Visibility.HIDDEN;
                }
                return c.canFaceDownBeShownTo(player) ? Visibility.FULL : Visibility.FACE_DOWN;
            }
            if (seats.isEmpty()) {
                return Visibility.HIDDEN;
            }
            for (PlayerView p : seats) {
                if (!c.canBeShownTo(p)) {
                    return Visibility.HIDDEN;
                }
            }
            for (PlayerView p : seats) {
                if (!c.canFaceDownBeShownTo(p)) {
                    return Visibility.FACE_DOWN;
                }
            }
            return Visibility.FULL;
        } catch (RuntimeException e) {
            // e.g. a card without a controller mid-update: never fail open
            return Visibility.HIDDEN;
        }
    }

    /** {@code {"seat":i,"player":id}} or {@code {"spectator":true}}, sent with every snapshot. */
    public JsonObject toJson() {
        JsonObject o = new JsonObject();
        if (player == null) {
            o.addProperty("spectator", true);
        } else {
            o.addProperty("seat", seat);
            o.addProperty("player", player.getId());
        }
        if (omniscient) {
            o.addProperty("omniscient", true);
        }
        return o;
    }
}
