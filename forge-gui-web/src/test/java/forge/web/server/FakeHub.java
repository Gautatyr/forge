package forge.web.server;

import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.atomic.AtomicInteger;

import forge.web.bridge.ClientSink;

/** Stand-in for {@code GameStream}: greets each client with "hello" then "snapshot N". */
final class FakeHub implements StreamHub {
    final List<ClientSink> clients = new CopyOnWriteArrayList<>();
    final AtomicInteger adds = new AtomicInteger();
    private int snapshots;
    private String snapshotPadding = "";
    private Runnable afterNextAdd;

    synchronized void padSnapshots(int chars) {
        snapshotPadding = "x".repeat(chars);
    }

    /** Runs once, at the end of the next {@link #addClient}, after the hub lock is released (as GameStream does). */
    synchronized void afterNextAdd(Runnable r) {
        afterNextAdd = r;
    }

    @Override
    public void addClient(ClientSink c) {
        Runnable after;
        synchronized (this) {
            c.send("hello");
            c.send("snapshot " + snapshots++ + snapshotPadding);
            clients.add(c);
            adds.incrementAndGet();
            after = afterNextAdd;
            afterNextAdd = null;
        }
        if (after != null) {
            after.run();
        }
    }

    @Override
    public void removeClient(ClientSink c) {
        clients.remove(c);
    }

    synchronized void broadcast(String msg) {
        for (ClientSink c : clients) {
            c.send(msg);
        }
    }

    @Override
    public int clientCount() {
        return clients.size();
    }

    @Override
    public String snapshot() {
        return "{\"t\":\"snapshot\"}";
    }

    @Override
    public String metricsJson() {
        return "{}";
    }
}
