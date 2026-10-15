# CLAUDE.md

This repo is a fork (Gautatyr/forge) of Card-Forge/forge, a Magic: The Gathering rules engine with AI opponents (Java 17, Maven).

**Read first:** `docs/fork/README.md` (index and codebase summary) and `docs/fork/decisions.md` (decision log). Design rulings for the new match screen are in `docs/fork/design/match-screen-decisions.md`.

## Rules for working in this fork
- **Branches:** `master` mirrors `upstream/master` and is never committed to. Work lands on `develop` (the default branch). Sync with `git fetch upstream && git merge upstream/master` on `develop`.
- **Changes flow upstream → fork only.** Every edit to an upstream file can conflict on the next sync. Keep such edits small and isolated; prefer new files and new modules. Record any deliberate upstream-file edit in `docs/fork/decisions.md`.
- **Never interact with upstream (Card-Forge/forge).** Allowed contact is read-only: `git fetch upstream` to pull its changes, and reading its public issues and PRs when useful (e.g. `gh issue list -R Card-Forge/forge`). Never write anything there.
  - Issues, PRs and comments go on `Gautatyr/forge` only. PRs target `Gautatyr/forge`, base `develop` (`gh pr create --repo Gautatyr/forge --base develop`).
  - In anything posted to GitHub (issues, PRs, comments, pushed commit messages), never write `Card-Forge/forge#123` or upstream issue/PR URLs: GitHub would add a backlink on upstream. Write "upstream issue 123" in plain text instead.
  - Never @-mention anyone.
  - Pushing to the `upstream` remote is disabled (`git remote set-url --push upstream DISABLED`); never re-enable it.
- **Pushing to the fork (`origin`, Gautatyr/forge) is allowed** without asking: feature branches, and `develop` after merges. Never force-push `develop` or `master`. `master` only ever mirrors `upstream/master`.
- **Work process:** one GitHub issue (a sub-issue of an epic) = one branch = one PR into `develop` on Gautatyr/forge. Reference the fork issue in the PR body (`Closes #N`).
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
