# Decision log

Newest last. Each entry: the decision, why, and what it implies.

## 2026-10-15 — Branch layout
- `master` is a pure mirror of `upstream/master` (Card-Forge/forge). Never commit to it.
- `develop` is the integration branch and the GitHub default branch. All fork work lands here.
- Sync: `git fetch upstream && git switch develop && git merge upstream/master`, about weekly. Merge, don't rebase: upstream makes about 3,300 commits a year.
- **Why:** a clean mirror makes `git diff master develop` show exactly what the fork carries.

## 2026-10-15 — The fork does not contribute upstream
- Changes flow upstream → fork only.
- **Implication:** every fork change to an upstream file can conflict on sync. Hot files (changes per year): `Card.java` 113, `PlayerControllerHuman` 88, `CMatchUI` 48, `AiController` 50. Keep edits to upstream files small and isolated. Prefer new files and new modules.

## 2026-10-15 — No interaction with upstream at all
- The fork never interacts with Card-Forge/forge: no issues, PRs, comments, mentions or pushes. Allowed contact is read-only: fetching its changes, and reading its public issues and PRs when useful (owner, 2026-10-15).
- Guards: the `upstream` push URL is set to `DISABLED` (local git config; redo it after a fresh clone). `gh` defaults to `Gautatyr/forge`. Nothing posted to GitHub may contain `Card-Forge/forge#N` or upstream URLs (GitHub would add backlinks upstream) or @-mentions. Rules are in `CLAUDE.md`.

## 2026-10-15 — Auto-updater disabled
- `AutoUpdater.verifyUpdateable()` returns `false` early (`UPDATES_DISABLED`, `forge-gui/src/main/java/forge/download/AutoUpdater.java`). Commit `93d826b29ea`.
- **Why:** the updater downloads upstream builds, which would replace the fork.

## 2026-10-15 — New in-game UI is a web UI
- React + TypeScript frontend. The Java engine talks to it over a local WebSocket.
- **Why (owner's call):** looks and ease of development outweigh the bridge cost.
  - AI coding agents do most of the work. The web gives them the best feedback loop: Playwright (click, read the page, screenshot, console), hot reload, rendering from mock game states without the engine, and the most training data.
  - The bridge is smaller than it looks: Forge's network play already has an enumerated remote-UI protocol plus generic state sync. See [architecture/web-ui.md](architecture/web-ui.md).
- **Rejected:** JavaFX (weaker agent loop), Swing restyle (low ceiling), Compose Desktop (Kotlin + Gradle), libGDX (widgets are painful).
- **Open:** packaging for friends (system browser, JCEF inside the Java app, or an Electron/Tauri shell). Decide after the spike.

## 2026-10-15 — Multiplayer first
- The first version of the new match screen must handle Commander with 3–4 players, not only 1v1.
- **Why:** Commander is the main way the owner's group plays.
- This overrides the memo's "1v1 first" proposal. See [design/match-screen-decisions.md](design/match-screen-decisions.md).

## 2026-10-15 — Work process
- **Until 2026-10-15 (exploration):** informal. Work landed on `develop` through local commits and merges.
- **Later (once the direction is settled):** GitHub issues on the fork, never on upstream. One epic issue lays out the plan and tracks progress, so any agent can see what needs doing and where the work stands. Every other issue is a sub-issue of the epic. Each agent works on its own branch for its issue and opens a pull request into `develop`.
- **Switched to the issue workflow on 2026-10-15** (owner's approval). Issues are enabled on the fork; the match-screen epic and its sub-issues track the work.
- **Pushing:** the owner authorised pushing to the fork without asking (2026-10-15). Never force-push `develop` or `master`.

## 2026-10-15 — Web bridge spike: go
- The spike (`forge-gui-web`, merged into `develop`) streams live AI-vs-AI games, 1v1 and 4-player Commander, from the engine to a browser through the existing seam. Full report: [architecture/spike-report.md](architecture/spike-report.md).
- Key numbers: about 1.3 KB per update and 2–3 KB/s at normal speed; snapshot 41–125 KB with hidden zones redacted; under 1 ms per update on the game thread; 0.5 ms average latency on localhost. Re-checked by the orchestrator: a fast 4-player Commander game, 924 updates, 0 errors.
- The only upstream file edited is one `<module>forge-gui-web</module>` line in the root `pom.xml`.
- **Must-fix before human play:** filter hidden information per viewer on the server (network play today sends opponents' hands and hides them only on the client); check `Origin` and use a per-launch token on the WebSocket; bound the send queue; harden prompt replies (`ReplyPool` waits forever; prompt ids come from a non-thread-safe static counter).

## 2026-10-15 — Match-screen mockup merged
- Clickable React/TypeScript mockup with mock data in `forge-gui-web/frontend/` (Vite, React 19, CSS Modules over one design-token file). Notes: [design/mockup-notes.md](design/mockup-notes.md).
- Squash-merged into `develop`. Only 9 compressed screenshots (about 3 MB) are committed; the full 53 MB PNG set stays local and ignored, to keep repo history small.
- Local-only ignores (e.g. `.playwright-mcp/`, browser-tool output) go in `.git/info/exclude`, not in upstream's `.gitignore`.
- Awaiting the owner's review and answers to the open questions in the notes.

## 2026-10-15 — Next steps started
- A clickable mockup of the multiplayer match screen with mock data (web).
- A web spike: stream a live AI-vs-AI game over a WebSocket to a read-only page, to de-risk the bridge.

## 2026-10-15 — Bridge work starts in parallel with design
- Phase 2 of the match-screen epic (the Java bridge) starts now, in parallel with the design iteration.
- **Why (owner):** the bridge is decoupled from the visual design and it is the longest piece of work. Real games through the prototype will also surface UX problems that mock data hides.

## 2026-10-15 — Bridge: hidden information is filtered per viewer on the server
- Each seat and the spectator get their own stream, filtered by the engine's view rules (`CardView.canBeShownTo` / `canFaceDownBeShownTo`). A spectator sees only what every player may see.
- Cards a viewer may not see travel under per-viewer alias ids, re-issued when a card becomes hidden and when its zone is shuffled or reordered. References outside zone lists never carry a re-issued alias, so a client cannot track a once-seen card into a hidden zone or through a shuffle; only a re-hidden card's slot in a zone it stays in still places it. Details: [architecture/web-ui.md](architecture/web-ui.md#bridge-per-viewer-visibility-wire-v2).
