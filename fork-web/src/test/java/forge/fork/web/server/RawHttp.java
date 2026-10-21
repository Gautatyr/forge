package forge.fork.web.server;

import java.io.ByteArrayOutputStream;
import java.io.EOFException;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;

/** Hand-written HTTP/WebSocket client pieces, so tests control Host and Origin exactly. */
final class RawHttp {

    private RawHttp() { }

    static byte[] upgradeRequest(String path, String host, String origin) {
        StringBuilder req = new StringBuilder()
                .append("GET ").append(path).append(" HTTP/1.1\r\n")
                .append("Host: ").append(host).append("\r\n")
                .append("Upgrade: websocket\r\nConnection: Upgrade\r\n")
                .append("Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n");
        if (origin != null) {
            req.append("Origin: ").append(origin).append("\r\n");
        }
        return req.append("\r\n").toString().getBytes(StandardCharsets.US_ASCII);
    }

    /** Reads up to and including the blank line that ends the response head. */
    static String readHead(InputStream in) throws IOException {
        ByteArrayOutputStream head = new ByteArrayOutputStream();
        int matched = 0;
        int b;
        while (matched < 4 && (b = in.read()) != -1) {
            head.write(b);
            matched = (b == (matched % 2 == 0 ? '\r' : '\n')) ? matched + 1 : (b == '\r' ? 1 : 0);
        }
        return head.toString(StandardCharsets.US_ASCII);
    }

    static int statusOf(String head) {
        String[] parts = head.split(" ", 3);
        return parts.length < 2 ? -1 : Integer.parseInt(parts[1]);
    }

    /** One unmasked, unfragmented server text frame (no extension negotiated). */
    static String readTextFrame(InputStream in) throws IOException {
        int b0 = in.read();
        int b1 = in.read();
        if (b0 < 0 || b1 < 0) {
            throw new EOFException();
        }
        if ((b0 & 0x0f) != 1 || (b0 & 0x80) == 0) {
            throw new IOException("not a final text frame: " + Integer.toHexString(b0));
        }
        long len = b1 & 0x7f;
        if (len == 126) {
            len = ((long) in.read() << 8) | in.read();
        } else if (len == 127) {
            len = 0;
            for (int i = 0; i < 8; i++) {
                len = (len << 8) | in.read();
            }
        }
        byte[] payload = in.readNBytes((int) len);
        if (payload.length != len) {
            throw new EOFException();
        }
        return new String(payload, StandardCharsets.UTF_8);
    }
}
