package forge.fork.web.server;

import java.util.concurrent.CompletableFuture;

/** Card images for {@code GET /img?key=<view image key>}. */
public interface ImageSource {

    /** No images: every key answers 404. */
    ImageSource NONE = key -> CompletableFuture.completedFuture(null);

    /**
     * The image for a view image key ({@code CardStateView.ImageKey}, {@code CardView.FacedownImageKey}).
     * Must not block the caller and must complete (null when there is no image) within a bounded time.
     */
    CompletableFuture<Image> find(String key);

    /**
     * Like {@link #find(String)} for a viewer language ({@code "fr"}, {@code "en"}, or null/unknown =
     * English): the localized printing when there is one, else the English image. Same contract.
     */
    default CompletableFuture<Image> find(String key, String lang) {
        return find(key);
    }

    record Image(byte[] bytes, String contentType) { }
}
