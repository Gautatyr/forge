# CLAUDE.md — forge-gui-web

Fork-owned module: the bridge between the Forge engine and the web match screen. It boots
the engine headless, attaches web UIs to matches, and serves HTTP + a WebSocket on
127.0.0.1. Package root `forge.web` (never reuse `forge-gui` package names). Depends on
`forge-gui` and `forge-ai` only; nothing depends on it.

Background: `docs/fork/architecture/web-ui.md` (the seam, the protocol, the 13 prompts in
5 shapes) and `docs/fork/architecture/spike-report.md` (wire format, measurements, the
prompt-bridging design and its 9 traps). Frontend rules: `frontend/CLAUDE.md`.

## Rules
- **Hidden information is filtered on the server, per viewer** (`mayView`), including
  reveals and face-down cards. Never rely on the client to hide anything.
- **No client → server input** before the Origin check and the per-launch token pass.
- **Threading:** engine state is read and changed on the game thread. Never block a Netty
  event loop. Anything that waits (a prompt reply, a client) has an explicit timeout.
- Do not use `ReplyPool` for prompts (waits forever, leaks entries, returns null); use the
  bridge's own pending map with ids from an `AtomicLong`.
- Resolve client-sent ids through the current zone collections, never `Tracker.getObj`
  (it can return a stale `CardView`).
- The wire types for the frontend are generated from the engine at build time
  (issue #9). Never hand-edit generated files.
- Upstream classes used here (`AbstractGuiGame`, `ProtocolGuiGame`, `DeltaSyncManager`,
  `HostedMatch`, `TrackableProperty`) change upstream; adapt here, never edit them.

## Gates and running
- `make web-java-test` while iterating on this module; `make check` before the PR.
- `make web-server ARGS="--mode commander"` runs a live game on a per-worktree port; add
  `--human-seat 0` to play seat 0 over the WebSocket (options: `WebMain` javadoc).
- End-to-end check of a human seat: `spike-viewer/check/human-run.sh <outdir> <label> <port>
  <server args>` (scripted seat 0 + `ws-check.mjs` on the other views; exit 0 = passed).
