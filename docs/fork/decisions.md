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

## 2026-10-16 — Playing from the lobby end to end (issue #13)
- The launcher's seat page is `/?live=1&seat=N#token=…`: the frontend's live source, so the page starts live without any other parameter.
- Actionable highlights and the autotap preview are set per web seat (`YieldController` overrides in `WebGuiGame.setOriginalGameController`), not in `FModel` preferences: the desktop app's own preferences are neither read nor changed (it may save them). `WebMain` keeps its in-memory prefs.
- The launcher serves `/img` from Forge's image cache (`ForgeImages`, the user's real cache; downloads land there as the desktop app's would). The frontend uses `/img` for every live card and token, with Scryfall by name as the fallback.
- Frontend: an input that names no card (`showPromptMessage` card null: discard to hand size, who starts) is for no spell; the last clicked card is the source only when the engine names one it can't resolve (-1).
- Tray words: an engine message never shows the same line as title and instruction (`promptWords`): first line (without the engine's card id) and the rest; one line is the title alone; a long single "Card: rule text" line is split at the colon.

## 2026-10-16 — All cards must work: fix mechanisms, verify across the card pool
- Owner: "I don't want my cards to be playable, I want ALL the cards to be playable … it isn't a per card problem."
- Gameplay bugs in the web screen are fixed at the mechanism (how the human seat answers the engine's questions), never per card.
- Every engine question to a human seat must be bridged or deliberately automated. Silent defaults (fallbacks, timeouts, unbridged methods) are logged loudly and fail tests.
- Acceptance for gameplay work includes a card-pool sweep: many full games with a scripted human seat across many decks, asserting zero silent defaults and that the human's triggers resolve.

## 2026-10-16 — Human-seat coverage, silent defaults, card-pool sweep (issue #46)
- Audit of every `IGuiGame` method and `Input` a human seat can meet: `docs/fork/audit/human-seat.md`; `SeatCoverageTest` fails when upstream moves one.
- `SilentDefaults`: a seat prompt closed by timeout, disconnect or a closed seat, a method without a prompt shape, and every `HeadlessWebGui` question dialog log `[web] SILENT DEFAULT`; strict mode (`-Dforge.web.strictPrompts=true`) throws. Strict in `HumanSeatTriggersTest` and the sweep.
- `getAbilityToPlay` with 2+ abilities disables none (as `CMatchUI` without a trigger event). The `disabled` field stays in the wire schema, unused; removing it is a frontend change.
- `make web-sweep` (`HumanSeatSweep`, not in `make check`): full games with a scripted seat, strict. A game fails on a silent default, a seat error, a seat trigger dropped (not cast, with a legal target) or not resolved, or an exception in seat code. AI loops and engine exceptions without a seat frame are upstream bugs, and a `ConcurrentModificationException` on a game thread is a threading race (audit, "Known gaps"): listed, not failed.

## 2026-10-21 — Human seat threading: actions run on the game thread (issue #53, supersedes the race line of the #46 entry)
- A web seat's actions run on the game thread waiting for the seat's input (`WebGuiGame.awaitInput` → `InputPump`), not on the seat's own thread; an input action sent while no input waits is logged and not run. EDT input work runs while that thread waits (EDT drained before and after each action). Off the game thread, `ProtocolGuiGame`'s flush (`updateGameView`) and the stream flush before a call run only while it waits. Fork code only; details: `docs/fork/audit/human-seat.md`, "Threading".
- `make web-sweep` fails a game on a `ConcurrentModificationException` on a game thread, and counts every server refusal of the scripted seat's messages (`actionRejected`, `replyRejected`, `rejected`) as a seat error.
## 2026-10-21 — Blocking from the web seat (issues #54, #48)
- Root cause of #54: during `InputBlock` the engine holds the blocks in the combat band's `plannedBlockers` (`GameView.updateCombat`); `blockers` fills only once declared. The client read `blockers`, so a block the engine recorded never showed and the pending first click was cleared. The client now reads both.
- Legal blocks come from the engine: new seat message `blockOptions` (per attacker: `CombatUtil.canBlock` now, blockers that could move to it, `min` for menace), sent from `WebGuiGame.showCombat` while the input is `InputBlock`. Attack candidates are the engine's `setWeaklySelectable` only (no local fallback).
- `make web-sweep`: the scripted seat attacks every other turn and blocks with `blockOptions` through the page's messages; a declared block missing from the engine's combat fails the game.

## 2026-10-21 — Fork modules renamed (issue #55)
- `forge-gui-web/` → `fork-web/` (artifactId `fork-web`, package `forge.web` → `forge.fork.web`); `forge-gui-desktop-web/` → `fork-desktop-web/` (artifactId `fork-desktop-web`, package `forge.web.desktop` → `forge.fork.desktop`). Owner decision on #55.
- **Why:** upstream is building its own `forge-gui-web` module (package `forge.web`, artifactId `forge-gui-web`); the old names would give add/add conflicts on sync.
- Unchanged: runtime flags `-Dforge.web.strictPrompts`, `forge.web.sweep.*`, and the prefs file `preferences/fork-web.preferences`. Older entries keep the old names.
- Fork code goes under `forge.fork.*`; never reuse upstream's `forge.web` or a `forge-gui-*` module name.

## 2026-10-21 — Upstream sync: the prompt's selection is one call (issue #56)
- Upstream replaced `IGuiGame.setSelectables` / `clearSelectables` / `setSelectableTargets` / `setHighlighted` with `setSelection(Selection)` (cards with min/max, players and stack items, chosen; each prompt sends it when shown, after each pick and when it stops; `ProtocolGuiGame` skips one equal to the last). The bridge forwards it as one sticky call; the page keeps the last one across `awaitNextInput`. Fork-side workaround for player picks removed: upstream's `InputSelectEntitiesFromList` now names its players.
- Upstream's `InputBase.showSelection` appends the spell's kept target marks (`PlayerControllerHuman.getKeptMarks`) to every input's `chosen` while its cost is paid. The bridge removes them before sending (`SeatSession.withoutKeptMarks`), those of the controller that built the selection: the seat's own, or the one for a player it controls (Mindslaver): the page reads `chosen` as the input's own picks, and a kept target that is also a cost choice would be shown picked and "unpicked" into the cost. The page does not show kept marks (as before the sync).
- Upstream's `InputSelectTargets` now also takes targets that may be on the stack (`canPickStackTargets`) and offers a targetable spell as its card and its stack entry; the page shows the stack entry only.
- Macro calls moved to a `MACRO` protocol mode (client to the controller's macro system); the wire generator treats it as client. The web seat offers no macros.

## 2026-10-21 — Desktop suite runs in alphabetical class order (issue #43)
- Cause (upstream test isolation; reproduces on pure `upstream/master`): `CardMockTestCase.useStaticData` (and every `new StaticData`) repoints the process-wide `StaticData` singleton and never restores it, while `AITest` loads the real database once per JVM. A card-mock class that runs after one `AITest` class and before `StickerSheetTest` / `StickerAbilityTest` leaves them reading a lazily loaded database: 3 failures. Surefire's default class order is the file-system order, which differs between checkouts.
- Repro: `mvn -B -pl forge-gui-desktop -am test -Dtest='GameEventForwarderTest,CardDbLazyCardLoadingCardMockTestCase,StickerSheetTest,StickerAbilityTest' -Dsurefire.failIfNoSpecifiedTests=false -Dsurefire.runOrder=reversealphabetical`.
- `make desktop-test` passes `-Dsurefire.runOrder=alphabetical` (all `forge.ai` classes run before the `forge.card` mocks). Upstream test files stay unedited.
## 2026-10-22 — Human seat: game actions at safe points, out seats, EDT end of wait (issues #60, #61)
- `concede`, `reorderHand`, `drawOfferAction`, `sendYieldUpdate`, `getActivateDescription` run on the game thread at its next safe point (the seat's next input wait, or a player's priority), never on the seat's thread while the game runs; left over at game end, or sent as it ended, they are rejected, never applied to the next game. In a game that goes on without the seat, a concede sent during setup waits for the first priority (the engine still asks it for its mulligan).
- A seat out of a game that goes on has its waiting input stopped unanswered (priority passes; attackers, blockers, payments end with what it recorded).
- A player leaving a game that goes on restarts the priority round at the next priority (`PhaseHandler.setPriority` with the player who has it): the engine ends a round only when priority returns to the player who started it, so a round started by the player who left never ended. Fork-side; players who already passed are asked once more.
- A seat's input wait ends only once the EDT has run what was queued before it ended (`InputPayMana.updateMessage` swaps the controller for an AI one there). Fork code only, no upstream file changed; details: `docs/fork/audit/human-seat.md`, "Threading".
## 2026-10-22 — No AI-cards warning in web matches; scry offers only the looked-at cards (issues #68, #69)
- #68: web matches (`WebMain.matchRules`, `WebHostedMatch` once the web seat is in) set `GameRules.setWarnAboutAICards(false)`, as mobile Adventure does. `Match.startGame` otherwise reveals each AI deck's "AI can't play these cards well" list to every player: nothing to decide, and it lists opponents' cards. If the warning is wanted, it belongs in the lobby.
- #69: `PlayerControllerHuman.arrangeForScry` with `UI_SELECT_FROM_CARD_DISPLAYS` (default on; shared with the Swing lobby in `make play`, so not flipped) passes the whole library to `manipulateCardList`. The seat's `manipulateCardList` prompt (unless `toAnywhere`) now lists only the movable cards and takes `{top, bottom}` piles; the bridge rebuilds the list `arrangeForMove` reads (bottom pile reversed, see `Prompt.Manipulate.arrange`). No upstream edit. Surveil already took the `many` + `order` path over the looked-at cards only (two prompts: graveyard pick, then order on top).
## 2026-10-22 — Attacking planeswalkers and battles; own commander tax (issues #65, #67)
- What a seat may attack comes from the engine: new seat message `attackOptions` (the combat's defenders), sent from `WebGuiGame.showCombat` while the input is `InputAttack`. The view-model's `Attack` keeps `defenderId` = the defending player and adds `defenderCardId` for a planeswalker or battle (a battle's defending player is its protector, `CardView.protectorId`).
- Commander tax while paying: 2 × `CommanderCast` when the clicked card is your commander and was in the command zone when clicked (`CostAdjustment` adds it only for a cast from there).
## 2026-10-22 — Scry bottom pile after the upstream sync (issue #56; supersedes "bottom pile reversed" in the #69 entry)
- Upstream's bottom-order fix (`PlayerControllerHuman.arrangeForMove` now keeps the trailing run of movable cards in list order) makes the `manipulateCardList` result the library as it will be. `Prompt.Manipulate.arrange` no longer reverses the bottom pile. Covered by `HumanSeatScryTest` (engine) and `SeatSessionTest.manipulateCardListOffersOnlyTheMovableCardsAsTopAndBottomPiles`.
## 2026-10-22 — Prompts to a seat out of a game that goes on (issue #78)
- A seat whose player left a game that goes on (lost or conceded, and removed from the game's players) gets every bridged prompt answered at once with the engine default, never sent: the engine still asks such a player (e.g. `Player.revealFaceDownCards` reveals to every registered player), and the out seat's OK held the game up to the disconnect grace or the prompt timeout. A deliberate automation (stdout log), not a silent default: strict tests and the sweep do not fail on it. The page may still watch the stream. Details: `docs/fork/audit/human-seat.md`, "Silent defaults".
- `make web-sweep`: the scripted seat concedes at turn 9 in every 4th 4-player game, the others play on; a prompt sent to it after it left, or a concede the engine did not record, fails the game.
## 2026-10-22 — Auto-pay taps and spends mana only; convoke, improvise and remove-counter picks lit (issues #66, #70)
- #66 rule (human seat): automatic payment never pays a cost the player did not choose beyond tapping/untapping mana sources and spending mana: no sacrifice, life (Phyrexian mana included), discard, exile, counters, energy… A cost that needs one leaves Auto disabled; the player pays by hand. Root cause: `InputPayMana.onOk` runs `ComputerUtilMana.payManaCost` under a `PlayerControllerAi`, which accepted mana abilities with any cost and chose the creature to sacrifice (`checkForManaSacrificeCost` skips humans: `Player.isAI()` reads the view, still human).
- **Upstream-file edit** (generic, not per card): `PlayerControllerAi` gets an `autoPayForHuman` flag; `InputPayMana.runAsAi` sets it (Auto and its source plan / "Taps: …" preview); `ComputerUtilMana` with that flag skips mana abilities whose cost has any part other than `CostTap`, `CostUntap`, `CostPartMana`, and pays no life for Phyrexian mana. Applies to the desktop Auto button too. Other AI-controller uses (`AvailableActions`, `askAI`, simulation, AI players) are unchanged.
- Web: payment with Auto disabled reads "Auto-pay only taps and spends mana: pay by hand" when untapped sources (one per symbol left) or life could pay, else "Not enough untapped mana"; Phyrexian mana gets a "Pay 2 life" button (`selectPlayer` on yourself, the engine's "click on your life total").
- #70: `InputSelectCardsForConvokeOrImprovise` and `InputSelectCardToRemoveCounter` send a `Selection` naming only what is chosen (`InputSelectManyBase.getSelection`); `WebGuiGame.setSelection` adds the cards their `getActivateAction` accepts (min 0, max = that count) and clears them once the input ends (input queue observer). The page shows convoke / improvise as a `chooseTargets` decision with `tapToPay` ("Tap artifacts to pay for Improvise — {5}{B}{B} left", main button detail "Taps: …").
- #70, playable from hand: the page plays only the cards the engine's playable highlights name (`AvailableActions`, run under a `PlayerControllerAi`). `PlayerControllerAi.chooseCardsForConvokeOrImprovise` returned nothing for convoke and no creatures for improvise before the AI's combat, so a spell only convoke or improvise could pay was never offered. **Upstream-file edit:** for a human player (`Player.isAI()` false: the view keeps the human flag under a temporary AI controller, as `ComputerUtilCost.checkForManaSacrificeCost` already assumes) it counts every untapped card that may pay.
## 2026-10-22 — "Any opponent may" GenericChoice stops once the choice is made (issue #86)
- Rule: a `GenericChoice` that asks several players (`Defined$ Opponent`/`Player`) re-checks its own `Condition*` params before each chooser after the first; once an earlier pick has invalidated them, the remaining players are not asked. Card pool sweep (`GenericChoice` + multi-player `Defined$` + `Condition*`): only Sin Prodder and Distant Memories, both "Any opponent may ... If a player does / If no player does"; their conditions (imprinted card still revealed / still in exile) already encode "nobody has done it yet". Other multi-player `GenericChoice` scripts have no conditions: unchanged.
- **Upstream-file edits** (drop on sync if upstream fixes it): `ChooseGenericEffect.resolve` (condition re-check in the chooser loop); `ChooseGenericAi` `SinProdder` logic returns "No" on an empty imprint instead of `getFirst()` throwing (`NoSuchElementException` killed the game thread). Test: `ChooseGenericAnyOpponentTest` (4 AI players).
## 2026-10-22 — Worms of the Earth condition; PayLife<ConvertedManaCost> in the AI's PlayCost estimate (issue #91)
- **Upstream card-script edit:** `worms_of_the_earth.txt` `TrigChoose` gets `ConditionPresent$ Card.Self | ConditionCompare$ GE1`, so the #86 re-check in `ChooseGenericEffect` stops asking once a player destroyed it. Side effect: if it left the battlefield before the trigger resolves, nobody is asked (paying would only cost the payer). Test: `WormsOfTheEarthTest` (3 AI players).
- `PayLife<ConvertedManaCost>` payment was already right: `PlayEffect` (`PlayCost$`, Anrakyr the Traveller) and `StaticAbilityContinuous` (`MayPlayAltManaCost$`, Bolas's Citadel) substitute the card's mana value before building the cost. Only `PlayAi.chooseSingleCard` built the raw `PlayCost` ("SVar 'ConvertedManaCost' not defined" logged, estimated as 0 life). **Upstream-file edit:** it substitutes the mana value the same way (also covers Amped Raptor's `PayEnergy<ConvertedManaCost>`). Tests: `PayLifeManaValueTest` (AI), `HumanSeatTriggersTest` (web seat: Anrakyr from hand and graveyard, Citadel, Triarch Praetorian by unearth and Reanimate).
## 2026-10-22 — One failing AI check skips its candidate, not the priority pass (issue #92)
- Rule: in `AiController.chooseSpellAbilityToPlayFromList` a `RuntimeException` from one candidate's `canPlayAndPayFor` skips that candidate; the rest are still evaluated under the same deadline (`AITimeoutTracker.Expired` is rethrown). Logged once per card and exception class per JVM (stderr, full trace); `canPlaySa`'s Sentry extras are cleared. Before: the exception failed the whole "Game AI Eval" future and the AI passed priority. The storm / Living End pre-filters in the loop stay outside the catch.
- **Upstream-file edits** (forge-ai, generic; drop on sync if upstream fixes them), one per thrower found by the AI-only crash hunt:
  - `ComputerUtilCard.getPumpedCreature`: fills in `ChosenPlayerUID` / `ChosenPlayerName` from `DefinedKW` (ChosenPlayer or defined players, one keyword per player) as `PumpEffect.resolve` does; a keyword whose player is unknown is left out. Was: raw `Player.PlayerUID_ChosenPlayerUID` → `NumberFormatException` in `PlayerProperty` (Guardian Archon; tested also Courageous Resolve, Cliffside Rescuer). Covers game-thread (trigger) predictions too: `getPumpedCreature` is the only place forge-ai adds predicted keywords to a card.
  - `ComputerUtilCost.checkRemoveCounterCost`: null counter type (`Any`, Moxite Refinery) no longer NPEs; the check asks `AiCostDecision`, as for a from-source null type; it cannot pay `Any` yet (upstream TODO), so the check returns false and the AI does not pick the ability (before: `WillPlay`, then "AI failed to play" retries).
  - `TapAllAi.doTriggerNoCost`: no targetable opponent and not mandatory → `TargetingFailed` (was NPE; Tempest Caller vs Leyline of Sanctity). Its team/opponent counts were swapped (it wanted to tap its own team's creatures), so the ETB look-ahead rejected Tempest Caller: now as in `checkApiLogic`. The targeted branch keeps the `ValidCards` + untapped filter (was every permanent the target controls, lands included).
  - `CopySpellAbilityAi`: an API-less stack item (a face-down morph/disguise spell) is declined as not understood (was `EnumMap` NPE on a null key).
- Tests: `AiEvalCandidateFailureTest`, `AiCheckThrowersTest`.
## 2026-10-22 — Combat UX: blocker-first selects, attack cap, menace minimum (issue #29, refines D5)
- Blocks (D5, both click orders kept): a blocker clicked first is only selected, even when it already blocks; the next attacker click removes (an attacker it blocks), adds or moves per `blockOptions`; a second click on it, Esc or a click on empty board deselects. Before: the blocker-first click removed all its blocks.
- `attackOptions.max` (wire, optional): `Combat.getAttackConstraints().getGlobalRestrictions().getMax()` (Silent Arbiter). Over it the page hides "Attack all" and disables the primary button with "At most N creature(s) can attack together."; a refused declaration ("Attack declaration invalid", the engine gives no reason) shows the cap or a generic reason as a note that stays until the next action.
- Menace's `BlockOption.min` shows as "Needs N" on the attacker while it has fewer; "X can't block Y." names a face-down creature as "a face-down creature".
## 2026-10-22 — Board information: command-zone effects, auras on players, imprint links (issue #29, packet C)
- No upstream-file edit and no bridge change: `GamePieceType`, `IsEmblem`, `AttachedCards` (players), `ImprintedCards`, `ExiledCards`, `ExiledWith`, `SubInstance` already ride the per-viewer stream (`Projection`, `CardRefs`); the view-model reads them. Pinned by `BoardInfoVisibilityTest`.
- Effects (Monarch, emblems, effect cards, dungeons) are chips in the owner's plate, no longer cards in the command group beside the hand: **placement is a proposal for the owner**.
- Live P/T breakdown and keyword "granted by" are not filled: the engine view has the net P/T only (per-source data lives in `Card`'s boost and keyword-change tables, not in `CardView`); filling them needs an upstream `CardView` change. `ptModifiers` is absent live and the inspector shows "Now" alone.
## 2026-10-22 — Choice tray polish (issue #29, packet B)
- Mulligan order not changed: `LondonMulligan.mulliganDraw` bottoms N cards before `mulliganKeepHand` asks keep or mulligan (playtest 2 #3), so the bottom pick is wasted on a second mulligan. Asking keep first needs a deferred tuck in `PlayerControllerHuman` (upstream), which also makes `GameEventMulligan`'s "mulliganed down to N cards" log read 7 for human players (opponents' tags parse it). Not done; the question's copy now says what the next mulligan does (draw 7, then put `7 - hand + 1` on the bottom; no card back for a free first mulligan).
- "Choose optional costs" / "Choose a mode" get no Cancel: the engine has no back-out there (`one()` asserts one result; `chooseOptionalCosts` returns the costs to add, empty = none). Cancel is offered only on number prompts asked with "none" allowed (`AbstractGuiGame.getInteger`: `oneOrNone`, an empty reply is its null; an X announce cancels the spell).
- Deliberate automation: the order of cards put into exile is not asked (`Prompt.Order.orderIsMoot`, `lblChooseOrderCardsPutIntoExile`; `docs/fork/audit/human-seat.md`). Other zones are still asked.
- Wire: `InputInfo.kind` gains `pay` with `payFor` (the activated ability a payment is for, "Equip {2}"), read from `InputPayMana.saPaidFor` by reflection like `sa` of the selection inputs. No upstream edit.
## 2026-10-22 — One engine-text → player-text step (issue #29, QA playtests 1 and 2)
- Rule: every engine-written string reaches the page through `fork-web/frontend/src/adapter/engineText.ts` (prompt titles and instructions via `promptWords`, option labels, log lines via `logText`, stack text, notices). It strips card ids ("Ruin Rat (247)"), words raw filter syntax (`Artifact.cmcLTX+YouCtrl`; unknown properties are hidden), drops stray leading/trailing dashes and repeated lines, puts the seat in the second person in the log ("You has kept" → "You have kept"), words "Search your graveyard and exile?" as "Look through … exile zone?" and "X unless you Y" options as "Y, or X". Mechanisms only, never per card; new engine strings get a case in `engineText.test.ts`.
- The engine's default dialog title "Forge" is dropped from notices; `InputInfo.declineWords` (bridge) stays for the Cancel words.
- Target steps: the instruction is the prompt line plus "(N more can be targeted)" (`targetInstruction`), no longer the message's last line (which was the count, or a chosen target's name).
- Player rows of a combat damage assignment read "Life N", deathtouch is noted on creatures only.

## 2026-10-22 — Auto-pay wastes no mana; the Auto-pay toggle is remembered (issue #29, packet F)
- Auto-pay toggle: stored with the other match prefs (`Prefs.autoPay`, `state/prefs.ts`), default Off (hand payment stays the default).
- Damage before waste (owner, 2026-10-22; human Auto only): unused mana costs nothing, damage does. Floating mana is already spent first (`payManaCost` pays from the pool before tapping). **Upstream-file edit** (generic, not per card): `ComputerUtilMana.sortManaAbilities`, when `isAutoPayForHuman`, stably re-sorts each shard's candidate abilities by (1) `hurtsPayer` (the mana ability's own sub-abilities, or a Taps/TapsForMana trigger on its host, that deal damage to or make the activator lose life: painlands, City of Brass), then (2) `wastedMana` (units the ability makes that no unpaid shard can take), then the existing order. So {1}{R} with Sol Ring + Mountain + City of Brass taps Mountain + Sol Ring (one {C} floats, no damage). A painful source still pays when nothing else can (it is a mana cost, not an extra cost). AI payment is unchanged.

## 2026-10-22 — Per-seat card-text language (issue #3, packet I)
- Client message `{"t":"setLanguage","lang":"en"|"fr"}` (seat tokens only; spectators stay English; unknown values = English). The language is a property of the seat, kept across games; `GameStream.setSeatLanguage` re-sends that seat's clients the changed fields as one delta, from the seat's own mirror (never the live game).
- Translations ride alongside, never replace: `Name`, `Type`, `OracleText`, `OracleName` stay English (the frontend's logic parses them: creature/land regexes, mana colours). A French seat also gets `LocalName` (card and card state; only when `Name` is the oracle name: flavour names stay), `LocalType`, `LocalOracleText` (card state) on cards it sees in full (`ViewerStream.localise`); the client uses them for display only and falls back to the English field when absent. English seats get none; a switch to `en` removes them (null in the delta). Face-down and hidden cards get nothing translated (their projection has no names). English fallback per card (no entry) and per field: a type line or text that is not the printed one (an effect changed it) stays English (`CardText`).
- `CardText.warm()` loads the table in `GameStream.startGame`, so a switch never parses the file on the Netty event loop. Own tables read from `forge-gui/res/languages/cardnames-fr-FR.txt` (`CardText`): `forge.util.CardTranslation` is one process-wide language. No upstream edit.
- Out of scope, stays English: engine-generated prompt, log, stack and ability-description text (`engineText` relies on English), tokens and effect names, keyword reminder text inside flags.
- `LocalName`, `LocalType`, `LocalOracleText` are wire properties: `WireSchema.FORK_PROPERTIES` feeds `hello.schema` and `WireModel` (so `wire.ts`, `PROPERTY_KINDS`, `CardProps`/`CardStateProps`). Frontend: the adapter maps them to `CardView.localName` and `CardFace.localName/localTypeLine/localOracleText`; components SHOW `cardName/faceName/faceType/faceText` (`model/selectors.ts`), all logic keeps the English fields.
## 2026-10-22 — French card images from the bridge (issue #3, packet J)
- `GET /img?key=&lang=fr|en&token=`: `lang=fr` serves the French Scryfall printing (`/cards/<set>/<num>/fr?format=image`, built with `ImageUtil.getScryfallDownloadUrl`) of `c:` card keys only; no French printing, any failure, or any other key (token, face-down, invalid) falls back to the English `CardImages` path. Missing/other `lang` = English. Same Origin/token checks (`RequestGuard`); the language never selects which key a viewer may get, so hidden information is unchanged.
- Cache: `<cacheDir>/web-pics/fr/<sha256(key)>.img` (the bridge's own folder, never the shared `pics` cache, never under `~/.forge`). A Scryfall 404 is remembered in memory until restart; transient failures (429, timeout) are not. Downloads use `ScryfallRateLimiter` and Forge's user agent on their own `web-images-fr` pool (never the `io` pool the English reads use, never a Netty thread). Only a real Scryfall 404 is remembered, not an unknown card.
- Edge: a `lang=fr` response that is the English fallback is cached by the browser like any other (`immutable`); a French printing added later shows after a cache clear.
## 2026-10-22 — English/French on the match screen, frontend side (issue #3, packet H)
- `fork-web/frontend/src/i18n/`: `en.ts` is the key type, `fr.ts` is `Record<MsgKey, Msg>` (a missing French key fails `tsc`); `t(key, params)` types `{placeholders}` from the English text; a plural is `{ one, other }` chosen by `count` (Intl.PluralRules, French 0 and 1 singular). The language is module state set once per render by `MatchProvider` from `prefs.language`; strings built in `state/`, `adapter/`, `model/` call `t()` too (nothing memoises across a language change).
- Pref `language: 'en' | 'fr'` in the match prefs, per viewer; default `fr` when `navigator.language` starts with `fr`. Display popover has the switch. `<html lang>` follows it.
- Wire to the bridge: after each hello and on every change the client sends `{"t":"setLanguage","lang"}`; `/img` URLs carry `lang=`. `ClientFrame` gains a local `LanguageFrame` (the generated wire types do not have it yet). A bridge that does not know it answers `rejected: unknown message type`, which the session drops silently.
- Not translated, on purpose: engine-written prompt/log/stack text (`engineText.ts` works on English patterns) and card names/text/keyword labels (come from the engine; packet I) stay English; so do `src/mock/` strings. A French screen therefore mixes French UI with English engine lines until the engine text is translated. Keyword explanations (the icon tooltips and inspector) are translated.
- Guard: `i18n/hardcoded.test.ts` parses the UI sources and fails on JSX text, text attributes and prose-looking string literals outside the catalogues (its `ENGINE_TEXT` list holds the engine words the code compares against).
- Scryfall fallbacks (mock/replay and the bridge's own fallback) stay English: Scryfall's by-name lookups have no language option.

## 2026-10-22 — Packaging: jpackage app, system browser (issue #14)
- No embedded Chromium/JCEF/Electron: the match screen opens in the player's system browser. Distribution = `make package` (`scripts/package.sh`): jpackage app image with a bundled Java 17 runtime + `fork-desktop-web` jars + `res/` + built frontend, started as the desktop lobby (toggle default on). Installer per OS: `.deb` (Linux, needs dpkg-deb + fakeroot; else `.tar.gz` of the image), `.msi` (Windows, needs WiX), `.dmg` (macOS). Same command on each OS; manual workflow `.github/workflows/fork-package.yml` (fork-owned) runs it on all three (not yet run on GitHub runners).
- Assets: `GuiDesktopWeb.getAssetsDir()` honours `-Dforge.assets.dir` (the launcher sets `$APPDIR/`); unset = upstream behaviour (repo run). No upstream file edited. No `forge.profile.properties` is shipped, so user data stays in Forge's normal folders (`ForgeProfileProperties`: `~/.forge` + `~/.cache/forge` on Linux); nothing migrates, the build never touches them.
- `res/adventure` (155 MB, adventure mode, unreachable from the desktop lobby) is left out of the package.
- The packaged app's version string reads "GIT" (jars carry no manifest version); harmless, the assets dir comes from the property.

## 2026-10-23 — Hover preview over the board at small heights (issue #29, supersedes PR #107)
- Implements the owner ruling of 2026-10-22 (`match-screen-decisions.md`, "Ruling on the hover preview at small heights"). `previewSpot.ts`: a card not hovered in the rail/drawer shows its preview over the board when the rail's panel column (`.upper`, measured with `useSize`) is under `IN_RAIL_MIN_COLUMN_REM` = 48 rem; otherwise the fixed rail spot (PRs #52, #103) is unchanged. rem scales with window height down to 844 px, so 1920x1080 is 50 rem (rail), 1366x768 44 rem and 1280x720 40 rem (board).
- The trigger is the column height only, not the content (a duel with only Recent also previews over the board at 1366x768): the spot never changes with the stack or combat, so nothing reflows or flashes while the pointer moves.
- Over the board the image is at least 271x378 px (the in-rail size at 1920x1080), scaled with the root size. `previewPlacement.ts` (pure) puts it flush with the rail (or log drawer) side at the hovered card's height, else the far side, else the middle, covering neither the hovered card nor the cards the open prompt marks selected (chosen targets, the spell's source, a pending blocker) nor the choice tray; when nothing is clear it covers the least, the hovered card last.
- Cards hovered inside the rail or the log drawer keep the PR #52 rule (beside the rail/drawer, any height).
