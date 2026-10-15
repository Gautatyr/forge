package forge.web.bridge.visibility;

import java.util.EnumSet;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;

import forge.card.CardStateName;
import forge.trackable.TrackableProperty;

/**
 * Which card properties a viewer gets at each {@link Visibility}. Hidden and face-down cards use
 * allow-lists, so a property added upstream stays hidden until it is reviewed here.
 */
public final class Projection {

    /** A placeholder: enough to count and place it. */
    private static final Set<String> HIDDEN_PROPS = names(EnumSet.of(
            TrackableProperty.Zone, TrackableProperty.Owner, TrackableProperty.Controller));

    /**
     * A face-down card whose face the viewer may not see: what lies on the table. The real face
     * ({@code AlternateState}, split states, {@code PaperCardBackup}, names, chosen values) is left out.
     */
    private static final Set<String> FACE_DOWN_PROPS = names(EnumSet.of(
            TrackableProperty.Zone, TrackableProperty.Owner, TrackableProperty.Controller,
            TrackableProperty.CurrentState, TrackableProperty.Facedown, TrackableProperty.FacedownImageKey,
            TrackableProperty.HiddenId, TrackableProperty.GamePieceType, TrackableProperty.Token,
            TrackableProperty.Tapped, TrackableProperty.Attacking, TrackableProperty.Blocking,
            TrackableProperty.PhasedOut, TrackableProperty.Sickness, TrackableProperty.Damage,
            TrackableProperty.AssignedDamage, TrackableProperty.LethalDamage, TrackableProperty.ShieldCount,
            TrackableProperty.Counters, TrackableProperty.AttachedCards, TrackableProperty.EntityAttachedTo,
            TrackableProperty.ExertedThisTurn, TrackableProperty.Detained, TrackableProperty.MustBlockCards,
            TrackableProperty.PairedWith, TrackableProperty.PlayerMayLook, TrackableProperty.Foretold,
            TrackableProperty.NeedsTapAnimation, TrackableProperty.NeedsUntapAnimation,
            TrackableProperty.PreventNextDamage));

    /**
     * Never sent, whatever the visibility: {@code Remembered} is the {@code toString()} of whatever
     * a card remembers, which can name and number hidden cards.
     */
    private static final Set<String> NEVER = names(EnumSet.of(TrackableProperty.Remembered));

    private Projection() { }

    private static Set<String> names(EnumSet<TrackableProperty> props) {
        Set<String> s = new HashSet<>();
        props.forEach(p -> s.add(p.name()));
        return s;
    }

    /** The card-level properties of {@code props} this visibility allows (a new object; values shared). */
    public static JsonObject card(JsonObject props, Visibility v) {
        JsonObject out = new JsonObject();
        for (Map.Entry<String, JsonElement> e : props.entrySet()) {
            String k = e.getKey();
            if (NEVER.contains(k)) {
                continue;
            }
            if (v == Visibility.HIDDEN && !HIDDEN_PROPS.contains(k)) {
                continue;
            }
            if (v == Visibility.FACE_DOWN) {
                if (!FACE_DOWN_PROPS.contains(k)) {
                    continue;
                }
                if (TrackableProperty.CurrentState.name().equals(k)
                        && !(e.getValue().isJsonPrimitive() && CardStateName.FaceDown.name().equals(e.getValue().getAsString()))) {
                    continue; // only the face-down face may be named
                }
            }
            out.add(k, e.getValue());
        }
        return out;
    }

    /** Whether a viewer at this visibility gets the card state object {@code state}. */
    public static boolean stateAllowed(Visibility v, String state) {
        switch (v) {
            case FULL: return true;
            case FACE_DOWN: return CardStateName.FaceDown.name().equals(state);
            default: return false;
        }
    }
}
