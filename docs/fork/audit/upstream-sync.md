# Audit: UI/engine seam and upstream sync strategy

> Archived agent report, 2026-10-15. Baseline commit `0b0f7ecc511` (upstream/master at the time).

## Fork strategy audit: a desktop UI rework on Card-Forge without costly syncs

**Bottom line:** build the new desktop UI as a new Maven module (option A) that implements the `forge-gui` interfaces. Leave `forge-gui-desktop` untouched and still building. Send every engine and AI fix upstream as a small PR instead of carrying it in the fork. Every other option collides with code upstream changes several times a week.

Baseline: HEAD, `origin/master` and `upstream/master` are the same commit `0b0f7ecc511` (`git rev-list --left-right --count` gave 0/0). In the last year upstream had 2,841 non-merge commits, 461 merges and 148 authors. The fork's issue tracker is disabled, so I had nothing to check recommendations against.

### 1. Module dependency graph (from the pom.xml files)
- **Engine chain:** `forge-core` ← `forge-game` ← `forge-ai` ← `forge-gui`. Each module depends on everything before it.
- **`forge-gui-desktop`** depends on core, game, ai and gui (`forge-gui-desktop/pom.xml` around lines 300–320), plus miglayout-swing, freemarker and jlayer. Its main class is `forge.view.Main` (pom line 91).
- **`forge-gui-mobile`** depends on core, game, ai and gui.
- **`forge-gui-mobile-dev`** depends only on `forge-gui-mobile` and the libGDX lwjgl3 backend.
- **`adventure-editor`** depends on `forge-gui` and `forge-gui-mobile`.
- **`forge-lda`** depends on `forge-gui-desktop` at compile scope (`forge-lda/pom.xml:57-59`), only for `forge.GuiDesktop`.
- A desktop client needs core, game, ai and gui. Nothing in the engine depends on a UI module: there are 0 references to `GuiBase` in `forge-game` or `forge-ai` main.
- **Hidden coupling:** the engine and AI test suite lives in `forge-gui-desktop/src/test` (138 files, including `gamesimulationtests`, `ai/simulation`, `ai/ability`). `forge-game`, `forge-ai` and `forge-gui` have 5 test files between them. AI-vs-AI simulation (`forge/view/SimulateMatch.java`, run as `Main sim`) is also in the desktop module. **Deleting or gutting `forge-gui-desktop` loses the engine tests and the AI benchmark tool.**

### 2. The UI/engine seam: mostly clean
- **`forge-gui`** has 458 files, 80.9k lines. The biggest parts are `gamemodes/` (245 files: quest 72, net 64, match 41, limited 35, conquest 17), `localinstance/` (preferences, constants, achievements), `player/PlayerControllerHuman` (4,065 lines, the human-input adapter that talks to the engine), `gui/download/` (image downloaders) and `gui/interfaces/`.
- **No UI toolkit inside it:** 0 libGDX imports, and one AWT import (in `forge/download/AutoUpdater.java`).
- **The contract a UI implements:**
  - `IGuiBase`: 83 lines, about 50 methods for dialogs, images, audio and threading.
  - `IGuiGame`: 340 lines, 53 methods, extended through `AbstractGuiGame` → `NetworkGuiGame`.
  - `IGuiGame` imports only View types (`GameView`, `CardView`, `PlayerView`, `SpellAbilityView`) plus enums such as `PhaseType` and `ZoneType`.
  - Two production implementations prove the seam works: desktop (`GuiDesktop` 460 lines; `CMatchUI` 1,814 lines, 66 `@Override`) and mobile (`GuiMobile` 396 lines; `MatchController` 966 lines, 64 `@Override`).
- **Violations in `forge-gui-desktop` main** (409 files): 124 files have 232 `forge.game.*` imports. 100 of those are `*View` types. Most of the rest are enums or value types: `GameType` 45, `GameFormat` 18, `RegisteredPlayer` 12, `ZoneType` 11.
  - Only 11 files import mutable types.
  - Nearly all of those use `Card.getCardForUi(PaperCard)`, which builds a detached card for display rather than touching live game state (e.g. `CMatchUI.java:1659`, `CardPanel.java:678`, `CardDetailPanel.java:150`, `ImageCache.java:503`).
  - The real exceptions: `DualListBox.java:374` (`WrappedAbility.getHostCard()`), `CCardScript.java:171` (`Card.updateCard`, the card-script editor) and `SimulateMatch` (`Game`/`Match`, which is legitimate for a headless sim).
  - **Verdict:** the boundary is clean enough to build a new client on.
- **Split packages:** the desktop module reuses package names from `forge-gui` (`forge.gui`, `forge.itemmanager`, `forge.deck`). Give a new module its own package root.
- **The seam itself moves a lot:** 61 commits in the year touched `IGuiGame`, `IGuiBase`, `AbstractGuiGame` or `NetworkGuiGame`. Across the year's diffs `IGuiGame` gained 45 non-default and 51 `default` method lines and lost 78. Most of this comes from network play and the yield rework.

### 3. How new cards arrive
- Cards are data loaded at runtime from `res/cardsfolder` (34,086 `.txt` scripts), either as loose files or as `cardsfolder.zip` (`forge-core/.../CardStorageReader.java:97-103`).
- **Last year:**
  - 1,160 commits touched cardsfolder. 916 (79%) changed no Java at all, 240 touched engine, AI or core Java, and 87 touched UI Java.
  - 381 commits added new scripts (2,662 new cards). 316 of them (83%) were data-only and carried 2,291 of the cards (86%). 65 needed main-module Java.
- **Sample of the last 30 card commits:** 19 were data-only. Of the 11 with Java, only 4 were new cards that needed engine work (`1b777913647` Vengeance/Hela, `82e0deace8c` Darkhold, `09eac29911c` Goblin Blastronauts, `5e3caa29a7d` Unfinity stickers with 53 Java files). The others were AI tweaks or cleanups.
- **Card data with no rebuild:** no dedicated data updater exists. `AutoUpdater` downloads a whole upstream build (`AutoUpdater.java:96-102, 164-166`, pointing at `releases.cardforge.org` and GitHub daily snapshots). Because `res/` is a plain folder, swapping in upstream's `res/cardsfolder` works for roughly 80% of new cards without rebuilding. The rest fail until the engine code is merged.
- **Images:** fetched at runtime from Scryfall and its CDN, with `downloads.cardforge.org` as fallback (`forge/util/ImageFetcher.java:44-93`, `ForgeConstants.java:343-351`). This is shared code, so any UI gets it.
- **Fork risk:** `FControl.java:238`, `FTitleBarBase.java:443` and `CSubmenuDownloaders.java:37` call `AutoUpdater`, which would replace a fork build with upstream's build. A new client should not call it.

### 4. Where upstream churn lands (last year, Java commits per file)
- **`forge-gui-desktop`:** 211 commits touched main code; 168 of 409 files (41%) changed; +15,242 / −4,734 lines (2026 monthly line churn: Jan 185 · Feb 2,146 · Mar 1,638 · Apr 1,024 · May 8,377 · Jun 2,418 · Jul 703 · Aug 133 · Sep 2,704 · Oct to date 464).
  - Hottest files: `CMatchUI` 48, `VLobby` 23, `CSubmenuPreferences` 20, `VSubmenuPreferences` 19, `PlayerPanel` 14, `CardPanel` 13, `GameMenu` 12.
  - Only 34 of the 211 commits were desktop-only; 143 also touched `forge-gui/src` and 111 also touched mobile. Desktop changes are mostly ripple from shared features.
  - By commit subject (keyword heuristic): 126 feature/other, 50 fixes, 35 refactor/cleanup. The largest are features: online draft/sealed (#10474, 1,997 lines), dockable zones (#~a73636446b1, 987), grouped stacks (#9751), dock rework (#10681), menu cleanup / UI guidelines (#10637).
  - Main author is MostCromulent with 94 commits. Upstream is actively reworking the Swing UI right now.
- **`forge-gui/src`:** `PlayerControllerHuman` 88, `ForgePreferences` 49, `AbstractGuiGame` 39, `FServerManager` 37, `IGuiGame` 33.
- **`forge-game`:** `Card` 113, `Player` 68, `CardFactoryUtil` 54, `AbilityUtils` 53, `GameAction` 42, `CardView` 32.
- **`forge-ai`:** `AiController` 50, `ComputerUtil` 43, `ChangeZoneAi` 35, `PlayerControllerAi` 32, `ComputerUtilMana` 30.
- **`forge-gui-mobile`:** 429 commits, 228 files; `Forge` 51, `RewardActor` 42, `MatchController` 40.
- **Resource files:** `res/languages/en-US.properties` changed in 100 commits. The root `pom.xml` changed in 34, but its module list changed only once (`76eaaa010e3`).

### 5. Is the libGDX client on desktop viable?
- Yes, it is shipped: the installer packages it as `forge-adventure.sh/.exe` (`forge-installer/pom.xml:186-189`).
- **Where it falls short as a desktop client:**
  - The window is fixed-size when not fullscreen (`GameLauncher.java:114-115`, `setResizable(false)`), and the layout is phone-shaped (portrait/landscape toggle).
  - No card-script workshop (`CardScript`: desktop 7 files, mobile 0), no puzzle creator (4 vs 0), no keyboard shortcuts (9 vs 0), no dock or floating zones (17 vs 1), no `SimulateMatch`, no macro recorder.
  - In the other direction, only mobile has Adventure and Planar Conquest (desktop 0, mobile 26 Conquest files).
- **No alternative-UI effort upstream:** the 92 upstream branches have nothing UI-related except `fanlayoutfluid` (Swing touch-drag tweaks). Searching all 75,706 commits found only a 2013 JavaFX dependency commented out (`7a0d57997d3`) and a 2013 websocket prototype (`9c032e8d273`). `Main server` prints "Dedicated server mode.\nNot implemented." (`Main.java:112`). `docs/Development/ownership.md` lists Desktop as having no owner.

### 6. Options compared

| Option | Upstream files the fork edits | Conflict exposure per year | Verdict |
|---|---|---|---|
| **A. New module** (e.g. `forge-gui-desktop2`, JavaFX or Compose in-process, implementing `IGuiBase` and extending `NetworkGuiGame`) | One `<module>` line in the root pom | No textual conflicts. About 61 seam commits (~5/month) cause **compile breaks**. Each comes with the matching `CMatchUI`/`MatchController` change as a reference. | **Recommended** |
| **B. Restyle Swing in place** | Most of the 409 files | 211 commits / 168 files, many hitting the same hot files (`CMatchUI` 48). Fights an active upstream redesign. | Reject |
| **C. Fork the libGDX client** | `forge-gui-mobile` | 429 commits / 228 files; also shared with Android, iOS and Adventure | Reject. Use it as a stopgap only. |
| **D. Separate frontend over a local API** | Same as A, plus a protocol you design | Same as A, plus maintaining a JSON bridge. The existing network layer is Java serialization over Netty (`CompatibleObjectDecoder.java:21-25`), unusable outside the JVM. | Only if you want a web UI; it is A with extra work |

**The real cost of A is feature parity, not merging.** The desktop module is 119k lines, and its screens are tied to Swing singletons (`CDeckEditorUI.java:143,288,380` use `Singletons.getControl()`), so they can't be reused under another toolkit. Ship the match screen first. Keep launching the Swing client for deck editor, quest and gauntlet until each is replaced.

**Fork hygiene, ranked:**
1. Keep fork `master` as a fast-forward mirror of `upstream/master`. Do product work on a separate integration branch that merges upstream weekly (merge rather than rebase at about 3,300 commits a year). The small, frequent seam breaks get fixed in the merge commit.
2. **Rules fixes go upstream immediately.** `Card.java` changes 113 times a year, so a fix carried in the fork will conflict. Branch from `upstream/master`, open one small PR per bug, and hold a cherry-pick in the fork only until it merges. `CONTRIBUTING.md:83-85` requires disclosing AI-agent authorship and discourages unnecessary tests.
3. **AI work must go upstream too; there is no plug-in point.** `PlayerControllerAi` is created with `new` in 5 places across 3 modules (`LobbyPlayerAi.java:38`, `GameSimulator.java:265`, `AvailableActions.java:49`, `InputPayMana.java:372`, `FServerManager.java:1006`). The AI files are hot (`AiController` 50, `ComputerUtil` 43), and 6,424 card scripts carry AI hints. Profile tuning is the conflict-free outlet: `.ai` files in `res/ai` are discovered by directory listing (`AiProfileUtil.java:159-172`, 1 commit a year), so a fork can add `Fork.ai`. For deeper AI changes, first upstream a small PR that adds an AI-controller factory.
4. Keep the new UI's strings and assets in the new module. Don't edit `en-US.properties` (100 commits a year) or `forge-gui/res/skins`.
5. Turn off or redirect `AutoUpdater` in the new client, or it will "update" the fork back to upstream's build.

### Evidence gaps
- I did not build or run anything: neither client, and no JavaFX/Compose prototype. Viability in §5 comes from reading code and packaging.
- The "1 year" window uses committer date, while the monthly buckets use author date, so the oldest months are sparse.
- The fix/feature/refactor split comes from keyword matching on commit subjects.
- The `IGuiGame` signature counts include rewrites, not only net additions.
- Whether "compile break vs merge conflict" makes option A cheaper in practice is a judgement, not a measurement.

The analysis scripts lived in a temporary session folder and were not kept. I did not modify the worktree.
