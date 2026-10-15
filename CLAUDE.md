# CLAUDE.md

This repo is a fork (Gautatyr/forge) of Card-Forge/forge, a Magic: The Gathering rules engine with AI opponents (Java 17, Maven).

**Read first:** `docs/fork/README.md` (index and codebase summary) and `docs/fork/decisions.md` (decision log). Design rulings for the new match screen are in `docs/fork/design/match-screen-decisions.md`.

## Rules for working in this fork
- **Branches:** `master` mirrors `upstream/master` and is never committed to. Work lands on `develop` (the default branch). Sync with `git fetch upstream && git merge upstream/master` on `develop`.
- **Changes flow upstream → fork only.** Every edit to an upstream file can conflict on the next sync. Keep such edits small and isolated; prefer new files and new modules. Record any deliberate upstream-file edit in `docs/fork/decisions.md`.
- **New UI work goes in new modules** and plugs into the `forge-gui` interfaces (`IGuiBase`, `IGuiGame`). Do not restyle `forge-gui-desktop` in place: upstream changes it constantly.
- **Do not delete or gut `forge-gui-desktop`:** it hosts the engine and AI tests and the headless `sim` benchmark.
- **The auto-updater stays disabled** (`AutoUpdater.UPDATES_DISABLED`); it would replace the fork with an upstream build.
- Record new decisions in `docs/fork/decisions.md`.

## Build and test
```
mvn -pl forge-gui-desktop -am compile   # compile desktop + engine modules
mvn -pl forge-gui-desktop -am test      # all tests, about 2 minutes
```
The engine and AI tests live in `forge-gui-desktop/src/test`, not in `forge-game` or `forge-ai`.
