package forge.fork.web.schema;

import java.io.DataInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.util.LinkedHashSet;
import java.util.Set;

/**
 * Reads the static field references a compiled class makes to one owner class, from its constant pool.
 * Used to find which {@code TrackableProperty} constants each view class reads or writes: the enum
 * itself does not say which view a property belongs to.
 */
final class ConstantPoolScanner {

    private ConstantPoolScanner() { }

    /**
     * Names of the fields of {@code owner} referenced by {@code c} and by its anonymous classes
     * ({@code c$1}, {@code c$2}, ...). Lambdas compile into {@code c} itself.
     */
    static Set<String> fieldRefs(Class<?> c, Class<?> owner) {
        Set<String> out = new LinkedHashSet<>();
        ClassLoader loader = c.getClassLoader();
        String base = c.getName().replace('.', '/');
        out.addAll(scan(loader, base + ".class", owner));
        for (int i = 1; loader.getResource(base + "$" + i + ".class") != null; i++) {
            out.addAll(scan(loader, base + "$" + i + ".class", owner));
        }
        return out;
    }

    private static Set<String> scan(ClassLoader loader, String resource, Class<?> owner) {
        String ownerName = owner.getName().replace('.', '/');
        try (InputStream raw = loader.getResourceAsStream(resource)) {
            if (raw == null) {
                throw new IllegalStateException("class file not found: " + resource);
            }
            DataInputStream in = new DataInputStream(raw);
            if (in.readInt() != 0xCAFEBABE) {
                throw new IllegalStateException("not a class file: " + resource);
            }
            in.readUnsignedShort(); // minor
            in.readUnsignedShort(); // major
            int n = in.readUnsignedShort();
            String[] utf8 = new String[n];
            int[] classNames = new int[n];
            int[][] fieldRefs = new int[n][];
            int[][] nameAndTypes = new int[n][];
            for (int i = 1; i < n; i++) {
                int tag = in.readUnsignedByte();
                switch (tag) {
                    case 1 -> utf8[i] = in.readUTF();
                    case 3, 4 -> in.readInt();
                    case 5, 6 -> {
                        in.readLong();
                        i++; // 8-byte constants take two slots
                    }
                    case 7 -> classNames[i] = in.readUnsignedShort();
                    case 8, 16, 19, 20 -> in.readUnsignedShort();
                    case 9 -> fieldRefs[i] = new int[] {in.readUnsignedShort(), in.readUnsignedShort()};
                    case 10, 11, 17, 18 -> in.readInt();
                    case 12 -> nameAndTypes[i] = new int[] {in.readUnsignedShort(), in.readUnsignedShort()};
                    case 15 -> {
                        in.readUnsignedByte();
                        in.readUnsignedShort();
                    }
                    default -> throw new IllegalStateException("unknown constant pool tag " + tag + " in " + resource);
                }
            }
            Set<String> out = new LinkedHashSet<>();
            for (int[] ref : fieldRefs) {
                if (ref != null && ownerName.equals(utf8[classNames[ref[0]]])) {
                    out.add(utf8[nameAndTypes[ref[1]][0]]);
                }
            }
            return out;
        } catch (IOException e) {
            throw new UncheckedIOException(resource, e);
        }
    }
}
