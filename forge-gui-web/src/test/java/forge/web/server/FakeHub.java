package forge.web.server;

import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.atomic.AtomicInteger;

import com.google.gson.JsonObject;

import forge.web.bridge.ClientSink;

/** Stand-in for {@code GameStream}: greets each client with "hello" then "snapshot N". */
final class FakeHub implements StreamHub {
    final List<ClientSink> clients = new CopyOnWriteArrayList<>();
    final AtomicInteger adds = new AtomicInteger();
    /** The seat of every {@link #addClient} and {@link #snapshot} call, in order. */
    final List<Integer> seats = new CopyOnWriteArrayList<>();
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
    public void addClient(ClientSink c, int seat) {
        Runnable after;
        synchronized (this) {
            seats.add(seat);
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
    public String snapshot(int seat) {
        seats.add(seat);
        return "{\"t\":\"snapshot\"}";
    }

    @Override
    public String metricsJson() {
        return "{}";
    }

    /** {@code seat:message} of every {@link #clientMessage}, in order. */
    final List<String> messages = new CopyOnWriteArrayList<>();

    @Override
    public void clientMessage(int seat, JsonObject msg, ClientSink from) {
        messages.add(seat + ":" + msg);
    }
}
