package forge.web.server;

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

    record Image(byte[] bytes, String contentType) { }
}
