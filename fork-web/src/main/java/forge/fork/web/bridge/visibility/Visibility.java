package forge.fork.web.bridge.visibility;

/** What one viewer may know of one card. */
public enum Visibility {
    /** Everything the engine tracks. */
    FULL,
    /** The card is visible but its real face is not: face-down state and public physical state only. */
    FACE_DOWN,
    /** Nothing but its existence: an anonymous placeholder (zone, owner, controller). */
    HIDDEN
}
