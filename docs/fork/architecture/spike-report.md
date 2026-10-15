# Spike: streaming a live game to a browser (web bridge)

Branch `spike/web-bridge`, measured 2026-10-15 on a desktop Linux box (JDK 17, localhost). Question: can a live Forge game be streamed from the engine to a browser cleanly and cheaply, through the existing seam, with no upstream edit beyond a module line?

**Answer: yes. Recommendation: GO** (see the end).

## What was built
New module `forge-gui-web` (package root `forge.web`), depends on `forge-gui` + `forge-ai` only. The only upstream edit is `<module>forge-gui-web</module>` in the root `pom.xml`. About 1,760 lines of Java (main) and 490 lines of viewer and check scripts.

| File | Role |
|---|---|
| `forge/web/HeadlessWebGui.java` | `IGuiBase` for a headless server: no AWT/Swing/audio; one daemon thread stands in for the EDT; dialogs log and return non-destructive defaults. |
| `forge/web/WebMain.java` | Boot: isolated profile (sets `user.home` to `forge-gui-web/target/forge-home`, so `~/.forge` is never read or written), `FModel.initialize`, server, then AI-only matches via `HostedMatch`. |
| `forge/web/bridge/WebSpectatorGuiGame.java` | Spectator GUI, extends `AbstractGuiGame`. `HostedMatch` creates it through `IGuiBase.getNewGuiGame()` when no human plays and calls `openView` before the game thread starts; it subscribes a game-thread listener there. |
| `forge/web/bridge/BatchingListener.java` | Game-thread batching, same flush policy as `GameEventForwarder` (priority after something happened, end of turn) plus a final flush on `GameEventGameFinished`. |
| `forge/web/bridge/GameStream.java` | Per flush: `DeltaSyncManager.collectDeltas` (network play's delta engine, reused unchanged) → JSON → visibility policy → `StateMirror` → broadcast. Snapshot for a new client comes from the mirror, never from the live graph. |
| `forge/web/bridge/WireSchema.java`, `WireEncoder.java` | Generic encoding keyed by `TrackableType`: no per-property code. A new upstream `TrackableProperty` gets a wire kind automatically. |
| `forge/web/bridge/StateMirror.java` | JSON copy of what clients hold; computes removals by reachability from the game object. |
| `forge/web/server/WebServer.java` | Netty (`netty-all` from `forge-gui`), port 7655, loopback only: static viewer, `/state`, `/metrics`, WebSocket `/ws` with permessage-deflate. |
| `spike-viewer/` | Plain HTML/JS viewer, no build step. `check/ws-check.mjs` (scripted wire check), `check/measure.sh` (measured run). |

Why `AbstractGuiGame` and not `ProtocolGuiGame` for the spectator: `HostedMatch.registerSpectator` drives the spectator GUI from the EDT through `FControlGameEventHandler`, and `ProtocolGuiGame`'s sync methods must run on the game thread (its own Javadoc). `HostedMatch` attaches `GameEventForwarder` and input-queue observers only to *human* seats that are `ProtocolGuiGame`. So the spectator does its own game-thread batching and leaves the EDT callbacks as no-ops. For human seats, `ProtocolGuiGame` is the right base (see "Prompts").

Speed: `HostedMatch` adds `FControlGamePlayback` pauses (200–400 ms per phase/cast/resolve) for spectators. `--speed fast` cycles it to 10x through `WatchLocalGame.selectButtonCancel()`.

## How to run
```fish
# from the repo root: compile and write the classpath
mvn -pl forge-gui-web -am compile dependency:build-classpath -Dmdep.outputFile=target/cp.txt
mvn -pl forge-gui-web -am test -Dtest=WireEncoderTest -Dsurefire.failIfNoSpecifiedTests=false

# from forge-gui-web/
./run-spike.sh                                   # 1v1, then keeps serving; open the printed URL http://127.0.0.1:7655/#token=<per-launch token>
./run-spike.sh --mode commander --speed fast     # 4-player Commander (C17/C20 precons)
./run-spike.sh --mode commander --hidden full    # no redaction (what network play sends today)
# other flags: --games N  --decks a.dck,b.dck  --wait-client SECONDS  --exit  --port  --label
# viewer: http://127.0.0.1:7655/?images=1#token=<token> shows Scryfall art

# scripted check against a running server (exit 0 = all checks passed)
node spike-viewer/check/ws-check.mjs --token <token>
# one measured run (server waits for the check, exits after the game; CPU sampled every 2 s)
spike-viewer/check/measure.sh /tmp/runs cmd-redact-fast --mode commander --speed fast
```
Decks: 1v1 uses `res/geneticaidecks` (Burn vs Merfolk); Commander uses `res/quest/commanderprecons` (Draconic Domination, Feline Ferocity, Arcane Maelstrom, Enhanced Evolution). Metrics JSON per game: `forge-gui-web/target/spike-metrics/<label>-game1.json`.

## Wire format (v1)
Superseded by v2 (per-viewer visibility): see [web-ui.md](web-ui.md#bridge-per-viewer-visibility-wire-v2). v1 as built by the spike:

JSON text frames, server → client only.
- `{"t":"hello","v":1,"hidden":"REDACT|FULL","schema":{"<TrackableProperty>":"<kind>",…}}` once per connection. Kinds: `card cards player players stack_item stack_items entity card_state combat bool int float string enum mana_cost colors card_type counters keywords paper_card string_list string_set string_map int_set int_map mana_map generic_map object`.
- `{"t":"snapshot","game":N,"seq":S,"label":…,"objects":[…],"log":[…last 400]}` on connect and at each new game.
- `{"t":"delta","game":N,"seq":S+1,"ts":ms,"new":[…],"changed":[…],"removed":["card:12",…],"log":[{"type","msg"}],"events":["CardChangeZone",…],"final":true?}`. Apply `new` (whole object, replaces), then `changed` (merge; `null` = property back to its default), then `removed`.
- Object: `{"type":"game|player|card|cardState|stackItem","id":42,"state":"Original"(cardState only),"props":{…}}`. Mirror key `type:id` or `cardState:id:State`.
- Values: references are ids (`card`, `player`, `stack_item`); collections are id arrays; `entity` is `{"type":"card|player","id"}`; `card_state` is the state name, resolved as `cardState:<owner card id>:<name>`; `combat` is `[{attackers:[ids],defender:{type,id},blockers:[ids],plannedBlockers:[ids]}]`; enums by name; `ManaCost`/`ColorSet`/`CardTypeView` by `toString()`; maps as objects.
- Absent property = engine default (`0`, `false`, `""`, empty). `TrackableObject.set` removes default values, so e.g. `Life` 0 is absent.
- Visibility policy `REDACT` (default): cards in Library or Hand carry only `Zone`, `Owner`, `Controller`, and their `cardState` objects are not sent. A card that moves to a public zone on the same instance is re-sent whole; public → hidden is re-sent redacted.
- Card images: `cardState.ImageKey` is `c:<name>|<set>|<art index>`; there is no collector number in the view. The viewer uses `api.scryfall.com/cards/named?exact=<name>&set=<set>&format=image`.

## Verification
- `ws-check.mjs` validates every message (shape, `seq` continuity), rebuilds the state from snapshot + deltas, checks containment references (zones, stack, card states) resolve after every delta, checks redaction holds, and at game end compares the rebuilt state with `/state` property by property. **0 errors in all 6 runs**, including one that joined a Commander game mid-way (snapshot at seq 313, 367 deltas after).
- `mvn -pl forge-gui-web -am test -Dtest=WireEncoderTest …`: 4 tests pass (kinds, value encoding in network and live form, delta-key decoding incl. negative ids, mirror pruning).
- `mvn -pl forge-gui-desktop -am test`: BUILD SUCCESS, 771 run, 0 failures, 6 skipped.
- Playwright screenshots in `forge-gui-web/spike-viewer/screenshots/`: `duel-early/mid/game-over-1440.png`, `commander4-mid-text-1440.png` (text tiles), `commander4-game-over-1440.png`, `commander4-phone-390.png` (no horizontal scroll at 390 px).

## Measurements
Card database boot (`FModel.initialize`, cards read eagerly): **4.8–5.5 s** (8 boots, median 4.9 s). Server RSS 0.86–1.25 GB, set by the card database (same order as the desktop app).

Snapshot size (bytes of the `snapshot` message; "objects" = without the 400-line log tail), sampled at the start of each turn:

| Game | Policy | Early (turn 1) | Mid | Late | Deflated |
|---|---|---|---|---|---|
| 1v1 | REDACT | 41 KB (183 obj) | 75 KB, 53 KB objects (t9) | 105 KB, 64 KB objects (t15) | 3.4–7.9 KB |
| 1v1 | FULL | 140 KB (303 obj) | 155 KB, 141 KB objects (t8) | 172 KB, 142 KB objects (t13) | 8.4–10.6 KB |
| 4p Commander | REDACT | 41 KB (409 obj) | 112 KB, 76 KB objects (t22) | 125 KB, 85 KB objects (t41) | 4.5–13.5 KB |
| 4p Commander | FULL | 397 KB (807 obj) | 434 KB, 399 KB objects (t28) | 248 KB, 205 KB objects (t53, 2 players out) | 26–43 KB |

Redaction cuts the snapshot by 3.5× (1v1) to 10× (4p): hidden libraries are most of the bytes.

Updates (one delta per batch; numbers from the server metrics and the client):

| Run | Game length | Deltas/s | Avg delta | Max delta (first, bulk) | Bytes/s | Peak 1 s | Full snapshot per flush instead |
|---|---|---|---|---|---|---|---|
| 1v1 REDACT, normal speed | 82 s, 15 turns | 2.5 | 1.1 KB | 42 KB | 2.8 KB/s | 42 KB | 181 KB/s (64×) |
| 4p REDACT, normal speed | 291 s, 48 turns | 2.3 | 1.3 KB | 43 KB | 3.0 KB/s | 44 KB | 216 KB/s (71×) |
| 1v1 FULL, fast | 9 s | 18 | 1.8 KB | 141 KB | 33 KB/s | 143 KB | 2.8 MB/s (86×) |
| 4p REDACT, fast | 43 s, 41 turns | 13.7 | 1.5 KB | 42 KB | 20 KB/s | 43 KB | 1.4 MB/s (70×) |
| 4p FULL, fast | 59 s, 53 turns | 12.2 | 2.0 KB | 399 KB | 24 KB/s | 412 KB | 4.6 MB/s (189×) |

Deltas deflate to 26–40% of their size (raw deflate, measured on the server; the WebSocket uses permessage-deflate). "Full snapshot per flush instead" is the measured size of the mirror serialised at every flush: throttled full snapshots would cost 60–190× the bandwidth, so deltas are clearly worth it, and they come free from `DeltaSyncManager`.

Latency and CPU:
- Game-thread cost per flush (collect + encode + mirror + broadcast): **avg 0.7–1.1 ms**, max 25–51 ms (the first, bulk delta).
- Server send → client receive on localhost: avg 0.5–0.7 ms, p95 1 ms, max 10–41 ms.
- Server CPU, 1v1 normal speed: 17% of one core average (p95 34%), dominated by the AI. Fast games: 120–150% average, also AI. The bridge is not a visible share.
- Measurement overhead in these numbers: the metrics serialise the full mirror after every flush (0.4–1.8 ms). A production bridge drops that.

## How the 13 prompts would be bridged
Human seats should extend `ProtocolGuiGame`, which already turns every `IGuiGame` call into `(ProtocolMethod, Object[] args)` on an `IRemote` and keeps the remote view current with `DeltaSyncManager` on the game thread. `HostedMatch` already attaches `GameEventForwarder` and input-queue observers to `ProtocolGuiGame` seats, so state is flushed before the game thread blocks. The web bridge implements `IRemote`:
- `send(NetEvent)`: `GuiGameEvent` → `{"t":"call","method":…,"args":[…]}` with the generic encoder (references → ids, collections → id lists, enums → names); `applyDelta` → the spike's delta message; `setGameView` → snapshot.
- `sendAndWait(IdentifiableNetEvent)` (game thread): build a `PendingPrompt` holding the original Java objects, send `{"t":"prompt","id":…,"method":…,"choices":[{"i":0,"label":…,"ref":{type,id}?}],"min","max",…}`, block on a `CompletableFuture` with a timeout. The client answers `{"t":"reply","id","value"}` with **indices** (or bool/int/string/amount map); the server maps indices back to the held objects, so nothing is deserialised from client types.
- Labels: call the `FSerializableFunction` display (`getChoices`, `one`) on the server when the prompt is sent (game thread, state consistent); `toString()` when it is null.

| Shape | Methods | Reply |
|---|---|---|
| Choose N of a list | `getChoices`, `chooseSingleEntityForEffect`, `chooseEntitiesForEffect`, `getAbilityToPlay`, `showOptionDialog` | index list / index |
| Yes / no | `confirm`, `showConfirmDialog` | bool |
| Order / two lists | `order`, `manipulateCardList`, `sideboard` | index permutation (+ remember flag for `order`) |
| Distribute | `assignCombatDamage`, `assignGenericAmount` | `{index: amount}` |
| Text / number | `showInputDialog` | string |

Traps found:
1. `ReplyPool.get` blocks with no timeout; entries are never removed; `complete` on an unknown id throws NPE; `cancelAll` completes with `null`, and not every caller tolerates `null` (`ProtocolGuiGame.getChoices` passes it straight through). Use our own pending map with timeout and disconnect handling that returns the engine default.
2. `GuiGameEvent.staticId` is a plain `static int` incremented from any thread: ids can collide across games and threads. Use our own `AtomicLong` for prompt ids.
3. Generic `T` choices (`getChoices`, `order`) can be `String`, `CardView`, `SpellAbilityView`, `Integer`, enums, `PaperCard`: always answer by index, validate `min`/`max` on the server.
4. `assignGenericAmount` keys are `Object`: `GameEntityView` or `Byte` (mana colour). Keys need tagging.
5. `getAbilityToPlay` lists `SpellAbilityView`s, which `DeltaSyncManager` never walks (`typeTagFor` returns -1). Send them inline.
6. `chooseSingleEntityForEffect` carries a `DelayedReveal`; `manipulateCardList`/`order` show library cards (scry, surveil). These cards are in hidden zones: the visibility filter must follow `CardView` visibility for that player (`mayView`), not zone names as the spike does, or reveals break.
7. `sideboard` returns `List<PaperCard>` from `CardPool`s: needs a card-identity mapping (name + set + art index).
8. Order matters: `syncAndSendAndWait` sends the delta before the prompt; the transport must keep one ordered channel per seat.
9. Client → server: the 16 `IGameController` methods take `CardView`/`PlayerView`. Resolving ids through `Tracker.getObj` can return a stale instance (the tracker keeps the first instance per id, while zone changes create new `CardView`s with the same id); resolve through the current zone collections or by id in the engine.

## What was hard
- Little. The seam and network play's delta machinery did nearly all the work: the first end-to-end run played a full game with no fix needed.
- Finding the right attachment point: the spectator path differs from human seats (EDT vs game thread, see above).
- `--speed fast` first ran before the playback input existed and did nothing; fixed by retrying per batch until the GUI reports `FAST`.
- Hidden information: `DeltaSyncManager` ships every card's full properties, libraries included. Redaction had to handle same-instance zone changes in both directions.

## Risks
- **Hidden information leak in today's protocol:** network play sends full `CardView`s of opponents' hands and libraries and relies on client-side `mayView`. A web client could read them from devtools. The bridge must filter per viewer on the server. The spike shows it is cheap and shrinks payloads 3.5–10×.
- **Localhost is not private:** any web page in the user's browser can open `ws://127.0.0.1:7655`. Read-only, that leaks the game; with commands, a hostile page could play. Check `Origin` and require a per-launch token before adding any client → server message. The spike checked neither; done since (issue 7: `forge.web.server.AccessPolicy`, `RequestGuard`).
- **Backpressure:** the spike used `writeAndFlush` with no writability check; a stalled tab queued unbounded memory. Done since (issue 7: `forge.web.server.ChannelSink`): a bounded per-client queue, paused while the channel is unwritable; on overflow it is dropped and the client gets a fresh snapshot.
- **Upstream churn:** the spike depends on `AbstractGuiGame` (29 overrides, most of them no-op callbacks or prompt defaults), `DeltaSyncManager.collectDeltas`, `DeltaPacket` key helpers, `TrackableTypes` constants, the `HostedMatch` spectator path and `GameView.getGame()` (marked "TODO: Remove" upstream; fallback: `HostedMatch.getGame()`). These break at compile time, not silently, and the generic encoder absorbs new properties.
- `getNewGuiGame()` is a process-wide factory: several concurrent matches in one JVM need a per-match factory.
- `DeltaSyncManager` logs at INFO on stdout (every flush plus periodic checksums); route `netLog` before shipping.
- Semantics for the UI team: `GameView.Turn` counts every player's turn (48 in a 4-player game the log calls "Turn 24"); `PlayerTurn` can switch before `Turn`/`Phase` during cleanup.
- Snapshot growth comes from the 400-line log tail (up to ~40 KB); paginate the log.

## Recommendation: GO
The bridge is cheap (about 3 KB/s per viewer at normal speed, ~1 ms per flush on the game thread), generic (no per-property code; one module; one pom line upstream), correct on the wire (0 errors over 6 full games including 4-player Commander and a mid-game join), and it reuses network play's delta engine as is.

Next steps:
1. Human seat: `WebGuiGame extends ProtocolGuiGame` + `IRemote` over the WebSocket; pending-prompt map with timeouts; index-based replies; the 16 client → server commands.
2. Per-viewer visibility based on `mayView` (replaces the zone-based `REDACT`), including temporary reveals.
3. Security before any input: `Origin` check, per-launch token, loopback bind (already).
4. Generate TypeScript types from `TrackableProperty`/`ProtocolMethod` at build time (the `hello` schema is the runtime half).
5. Backpressure and resync (`requestResync` → snapshot from the mirror).
6. Card images from Forge's local cache (`ImageKeys`/`ImageFetcher`) instead of hot-linking Scryfall; the view has no collector number.
7. Launch from the Swing app (match start opens the browser), and drop the metrics-only snapshot serialisation per flush.

## Knowing deviations
- Collector numbers are not in the view, so images map by name + set code, not set + collector number.
- The scripted check ignores client messages entirely: the viewer is read-only; no client → server path was built.
- `docs/fork/README.md` index not updated (out of scope); `docs/fork/decisions.md` untouched as instructed.
