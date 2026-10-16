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

## 2026-10-15 — Agent process tightened (token cost)
- **Why:** the first review loops cost about 75M input tokens (mostly cache re-reads) for 3 bridge PRs and 25M for one mockup PR. The causes: the desktop test suite run about 40 times although nothing depends on `forge-gui-web`; full build logs in agent context; screenshot-heavy frontend checks; one oversized issue (#6, 134 coder turns).
- **What changed (owner approved):**
  - Gates are Make targets (`Makefile`, `scripts/gate.sh`, `scripts/check-changed.sh`): `make check` runs only the gates a branch needs; each gate keeps its full log in `target/gate-logs/` and prints a summary and its real exit code.
  - Frontend verification measures layout before taking screenshots; screenshots only at the end.
  - Issues are sized for one coder session.
  - Per-worktree ports (`scripts/dev-port.sh`) so parallel agents don't collide.
- **Structure adopted from the owner's UltimateReadingApp project:** per-folder `CLAUDE.md` files loaded on demand (`forge-gui-web/`, `forge-gui-web/frontend/`); project skills the global agents preload (`.claude/skills/project-review-gate`, `.claude/skills/product-context`); `.claude/settings.json` denies (`git stash`, git config writes, pushing upstream, force-pushes); `decisions.md` is append-only.
- **Open:** whether review findings outside correctness/security may be non-blocking. The global reviewer agent treats every code/UI finding as blocking and only yields to stricter project rules, so this needs the owner's call.

## 2026-10-15 — Review threshold for this project
- Supersedes the "Open" point of "Agent process tightened": Hugo ruled that for this project, for now, "everything is blocking" does not apply.
- Blocking: real defects (correctness, security, hidden information, threading, tests, acceptance criteria, owner rulings) and polish a user would notice in normal use. Non-blocking: slight polish and nitpicks. Reviewers approve when only non-blocking notes remain.
- Written in `.claude/skills/project-review-gate/SKILL.md` (preloaded by the reviewer agent); the orchestrator applies it when deciding merges.

## 2026-10-15 — Bridge: hidden information is filtered per viewer on the server
- Each seat and the spectator get their own stream, filtered by the engine's view rules (`CardView.canBeShownTo` / `canFaceDownBeShownTo`). A spectator sees only what every player may see.
- Cards a viewer may not see travel under per-viewer alias ids, re-issued when a card becomes hidden and when its zone is shuffled or reordered. References outside zone lists never carry a re-issued alias, so a client cannot track a once-seen card into a hidden zone or through a shuffle; only a re-hidden card's slot in a zone it stays in still places it. Details: [architecture/web-ui.md](architecture/web-ui.md#bridge-per-viewer-visibility-wire-v2).

## 2026-10-15 — First playable target
- Target for the morning of 2026-10-16: a 4-player game (1 human, 3 AIs) in the web match screen, started with `make play`. The player picks their deck and each AI's deck, including custom decks from the local Forge install.
- The owner allows read-only access to `~/.forge/decks`. Agents never write to `~/.forge`.
- Token budget: agent reviews of the design PRs are deferred (the owner's own test is the review); overnight review loops run with at most one round.

## 2026-10-15 — Night run instructions (owner)
1. Write down everything that must be remembered (GitHub epic #15 and its issues, `docs/fork/`), because the orchestrator's context will run out.
2. Start with a couple of product design-and-review passes on the prototype.
3. Once the prototype includes everything needed to play a game, implement it fully. Goal for the morning of 2026-10-16: open it and play a game in the new UI.
4. 4 players: the owner against 3 AIs, with their own constructed decks, choosing each AI's deck like in the current Forge game. Deck selection needs no new UI now.
5. Biggest features first; polish and small fixes only once everything is there. Don't spend tokens on nitpicks.
6. The orchestrator works autonomously: issues, agents, product design calls (with the product agent), PRs and merges on Gautatyr/forge only.
## 2026-10-15 — Generated wire types are committed; the build fails when they are stale
- `forge-gui-web/frontend/src/wire/generated/wire.ts` is generated from the engine (`TrackableProperty`, `ProtocolMethod`, the bridge envelope) by `forge.web.schema.WireTypesGenerator` and committed, so the frontend builds without Java.
- The `forge-gui-web` Maven build (`process-classes`) fails when the file is stale, and when a new property is used by no view class. **When it reports the file stale** (typically after an upstream sync): `mvn -pl forge-gui-web -am process-classes -Dwire.types=write`, then fix the TypeScript errors in `src/wire/`.
- Only `src/wire/` may import the generated file (ESLint rule); components use the UI view-model.

## 2026-10-15 — Owner answers before the night run (final, no further questions)
- Keep highlights only when the game asks for a choice (legal targets, possible blockers/attackers during declaration, cards to pick); no "you could play this" highlights.
- Starting a game: Forge's existing desktop lobby sets up the match and picks every deck (including the owner's custom decks); pressing Start opens the match in the new web screen in the browser. A preference "Use the new match screen" switches back to the Swing game screen.
- Format for the morning test: **Commander, 4 players (1v1v1v1: owner vs 3 AIs), 40 life.**
- The orchestrator works autonomously until done; the owner is away.
## 2026-10-15 — Phase stops are a client setting (issue #20)
- Stops live in the match screen's prefs (`prefs.stops`), not in the view-model: `GameView.stops` and the `setStop` intent are removed. This follows Forge, where the GUI owns stops and the engine asks `IGuiGame.isUiSetToSkipPhase(turnPlayer, phase)`.
- The bridge (#11) must answer `isUiSetToSkipPhase` from stops the client sends; the message for that is not designed yet.
- Defaults are Forge's (`ForgePreferences` PHASE_HUMAN_* / PHASE_AI_*). Shared rows persist; per-opponent rows last one match.
## 2026-10-16 — Live adapter (issue #11)
- `forge-gui-web/frontend/src/adapter/` maps the bridge stream to the UI view-model and may import the generated wire types (ESLint allows `src/wire/` and `src/adapter/`). Components still see only `src/model/`.
- The page picks its source from the URL: mock scenarios (default), `?live=…` (bridge), `?replay=…` (recorded stream in `src/adapter/fixtures/`). The Mock panel switches back to mock scenarios.
- Prompt/reply and call shapes the client expects from #8: `src/adapter/protocol.ts`. Client commands are `{"t":"<IGameController method>","args":[…]}`, like the existing `requestResync`.
- Forge inputs are inferred from calls (`showPromptMessage`, `updateButtons`, selectables) plus phase: OK + End Turn/Undo = priority; attack/block steps = declare decisions; selectables = targets; any other two-button input (mulligan, pay mana) = a yes/no tray answered with selectButtonOk/Cancel.
- Until #10 serves images, live card images resolve through Scryfall `cards/collection` in batches (per-card `cards/named` redirects hit Scryfall's rate limit on a full board).
- Not done: client stops for `isUiSetToSkipPhase` (entry above) and yield settings (`sendYieldUpdate`): no wire form yet.

## 2026-10-16 — Bridge: card images come from the desktop app's image cache (issue #10)
- `GET /img?key=<view image key>&token=<per-launch token>` serves `CardStateView.ImageKey` (both faces: the back face key ends in `$alt`) and `CardView.FacedownImageKey` / `t:hidden` (card back). 200 with `Cache-Control: private, max-age=31536000, immutable`; 404 `no-store` when there is no image.
- The isolated web profile links the engine's `pics` folder under `--home` (same per-OS layout as `ForgeProfileProperties`: Linux `.cache/forge/pics`, macOS `Library/Caches/Forge/pics`) to the desktop app's `pics` folder, so images are shared with Swing Forge and downloads land there. Only `pics` is shared; `~/.forge` stays untouched. `--image-cache <dir>` overrides the target; a target that is the profile's own `pics` folder is used as a plain folder. A profile `pics` folder that already holds files is kept, not linked. Windows: the engine's cache comes from `%LOCALAPPDATA%`, so it already is the desktop's; nothing is linked and `--image-cache` is ignored (the launch line says so).
- A miss downloads through Forge's `ImageFetcher` (same URLs and file names as the desktop app); the request waits up to 90 s for that download.
## 2026-10-16 — Bridge: human seats over the WebSocket (issue #8)
- Every view has its own per-launch token (spectator, and one per seat); the seat a client sees and acts for comes from its token only. Host and Origin checks are unchanged. With a human seat, AI seats get no token (their view shows the AI's hand) unless `WebMain --ai-seat-urls` (checks).
- A human seat is `WebGuiGame extends ProtocolGuiGame` with our own `IRemote` (`SeatSession`): prompts go out with server-rendered labels and come back as indices validated against the held arguments; our pending map (`AtomicLong` ids), not `ReplyPool`. Network play's unfiltered deltas are dropped; state comes from the per-viewer `GameStream`.
- The stream is flushed before every prompt and before the seat's input blocks the game, so temporary reveals reach the seat.
- A prompt falls back to the engine default after 15 min unanswered, or 60 s without a connected client (both flags of `WebMain`).
- Phase stops: the client sends `sendYieldUpdate` `SkipPhase` per stop; the server skips none until told. This is the wire message #20 left open.
- Details: [architecture/web-ui.md](architecture/web-ui.md#bridge-human-seat-issue-8).

## 2026-10-16 — Live adapter on the human-seat protocol (issue #11, supersedes parts of the #11 entry)
- The client speaks the bridge's seat protocol (#8): `{"t":"action","method",…}` and `{"t":"reply","id","value"}`; prompts by `shape`. Its message types are generated with the wire types (`WireEnvelope.SEAT_MESSAGES` / `CLIENT_MESSAGES`), not hand-written in `protocol.ts`.
- Phase stops: on connect and on every edit the client sends `SkipPhase` for every player and step from `prefs.stops`. "To my turn" is a `SetMarker` at your upkeep.
- `WebMain` turns on `UI_SHOW_ACTIONABLE_HIGHLIGHTS` and `UI_SHOW_AUTOTAP_PREVIEW` (in memory): the client reads `setWeaklySelectable` as data (playable cards, attack candidates, payment sources, the auto-pay plan, strength 2), never drawn as hints. A launcher that opens web matches from the desktop lobby needs the same two prefs.
- Auto-pay mana is a client setting: one `selectButtonOk` ("Auto") per payment.
## 2026-10-16 — Launcher: desktop lobby, web match screen (issue #14)
- New fork module `forge-gui-desktop-web` (depends on `forge-gui-desktop` and `forge-gui-web`). Upstream file edit: one `<module>` line in the root `pom.xml`.
- Packaging for now: the system browser. The launcher runs Forge's desktop app; the bridge server runs in the same process on 127.0.0.1 and serves the built frontend (`forge-gui-web/frontend/dist`). JCEF/Electron not chosen yet; friend install (issue acceptance) is not covered.
- The web seat is attached in `HostedMatch.startMatch` (the launcher's `hostMatch()` subclass), not in `getNewGuiGame()`: only there are the game type and the seat index known. Web seat only for Constructed-type matches (lobby, incl. Commander) with exactly one human; quest, gauntlet, draft, puzzle, hotseat and AI-only matches stay in Swing.
- A web match is one game: when it ends, the match quits and the lobby is ready for the next Start (the lobby's games-per-match setting is ignored for web matches).
- One web match at a time: a match started while a web match runs ends that game at once (`setGameOver(AllHumansLost)`, as upstream's concede when AIs remain); its seat session stops sending to the page and its open prompts get their engine defaults; its end no longer hands the lobby back.
- Toggle "Use the new match screen": a checkbox in Forge's menu bar (navigation bar, between the tabs and the window buttons; shorter label or checkbox alone when the window is narrow), default on, saved in `<user dir>/preferences/fork-web.preferences` (fork-owned; `forge.preferences` untouched).
- The launcher does not initialise Sentry (upstream's crash reporting).

