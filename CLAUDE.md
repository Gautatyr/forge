# CLAUDE.md — root

This repo is a fork (Gautatyr/forge) of Card-Forge/forge, a Magic: The Gathering rules engine with AI opponents (Java 17, Maven). The fork builds a new web match screen (epic #15), and will later fix rules and strengthen the AI, while merging upstream regularly.

**Read first:** `docs/fork/README.md` (index and codebase summary) and `docs/fork/decisions.md` (decision log). Match-screen rulings: `docs/fork/design/match-screen-decisions.md`.

## Map
```
forge-core, forge-game, forge-ai,     upstream engine, AI and shared GUI layer (edit sparingly)
forge-gui, forge-gui-desktop          (forge-gui-desktop also hosts the engine/AI tests and `sim`)
fork-web/                             fork-owned bridge (Java) — see fork-web/CLAUDE.md
fork-web/frontend/                    fork-owned web match screen — see its CLAUDE.md
fork-desktop-web/                     fork-owned launcher: desktop lobby + web match screen (`make play`)
docs/fork/                            fork docs: decisions, design, architecture, audits, plan
.claude/skills/                       project-review-gate (coder/reviewer), product-context (product)
Makefile, scripts/                    fork-owned gates and dev helpers (`make help`)
```
Per-folder `CLAUDE.md` files load only when an agent touches that folder.

## Fork rules
- **Branches:** `master` mirrors `upstream/master` and is never committed to. Work lands on `develop` (the default branch). Sync with `git fetch upstream && git merge upstream/master` on `develop`.
- **Fork code flows upstream → fork through syncs.** Every edit to an upstream file can conflict on the next sync. Keep such edits small and isolated; prefer new files and new modules. Record any deliberate upstream-file edit in `docs/fork/decisions.md`.
- **Upstream (Card-Forge/forge): read freely, write only with the owner's go** (decision 2026-11-14).
  - Fork work: issues, PRs and comments go on `Gautatyr/forge`. PRs target `Gautatyr/forge`, base `develop` (`gh pr create --repo Gautatyr/forge --base develop`).
  - Upstream contributions: a branch `contrib/<slug>` from `upstream/master`, following upstream's `CONTRIBUTING.md` (not this file's gates), pushed to `origin`; PR with `gh pr create -R Card-Forge/forge --base master --head Gautatyr:contrib/<slug>`. Flow and rules: `docs/fork/audit/upstream-contributing.md`.
  - **Every upstream write (PR, issue, comment, reply to a review) is drafted first and read by the owner; post it only after the owner's go for that item.**
  - **Before calling anything a rules bug, and before coding a fix:** read the official rulings of every card involved (Scryfall "Notes and Rules Information", source `wotc`) and the current Comprehensive Rules (text file linked from magic.wizards.com/en/rules). Then reproduce through the real priority loop (`PriorityTestBase`), not `ComputerUtil.playStack`.
  - In anything posted on the fork (issues, PRs, comments, pushed commit messages), never write `Card-Forge/forge#123` or upstream issue/PR URLs: GitHub would add a backlink on upstream. Write "upstream issue 123" in plain text instead. Inside an upstream PR or issue, `#123` is upstream's own and is fine.
  - Never @-mention anyone.
  - Pushing to the `upstream` remote is disabled (`git remote set-url --push upstream DISABLED`); never re-enable it. Upstream PRs come from the fork's branches.
- **Pushing to the fork (`origin`, Gautatyr/forge) is allowed** without asking: feature branches, and `develop` after merges. Never force-push `develop` or `master`. `master` only ever mirrors `upstream/master`.
- **New UI work goes in new modules** and plugs into the `forge-gui` interfaces (`IGuiBase`, `IGuiGame`). Do not restyle `forge-gui-desktop` in place: upstream changes it constantly.
- **Do not delete or gut `forge-gui-desktop`:** it hosts the engine and AI tests and the headless `sim` benchmark.
- **The auto-updater stays disabled** (`AutoUpdater.UPDATES_DISABLED`); it would replace the fork with an upstream build.
- **Files under `.claude/`** (skills, settings) are tracked with `git add -f`: upstream's `.gitignore` ignores `.claude/`.

## Work process
- One GitHub issue (a sub-issue of an epic) = one branch = one PR into `develop`. Branch names: `feat/`, `fix/`, `docs/`, `chore/` + `<issue>-<slug>`. PR body starts with `Closes #<issue>`.
- Coding and review go through the global `coder` / `reviewer` agents, usually via the `review-loop` workflow. Fork-specific gates: `.claude/skills/project-review-gate/SKILL.md`.
- Issues are sized so one coder session can finish them; split anything bigger before dispatch.
- **Decisions:** `docs/fork/decisions.md` is append-only: supersede an entry with a new one, never rewrite it. Cross-cutting decisions (anything affecting another area or the owner's rulings) stop and ask the owner on the issue or PR.

## Universal rules
1. **Gates are Make targets.** `make check` runs only the gates the branch's changes need; each gate logs to `target/gate-logs/` and prints a summary and its real exit code. Never run the desktop suite for changes that don't touch upstream modules.
2. **Never pipe or silence a check without `set -o pipefail`:** redirect output to a file, keep the exit code, then read the file. Never paste whole build logs into the conversation.
3. **Verify before claiming.** Never write "tests pass" or "verified" without running the command on the current state.
4. **Verify citations.** A file path, line number or quoted rule must be re-checked at the time of writing.
5. **Final CLAUDE.md pass before a PR:** re-read the root and touched-folder `CLAUDE.md` against your diff.
6. **Never `git stash`** (the stash stack is shared by every worktree) and **never write git config** (`.git/config` is shared). Both are denied in `.claude/settings.json`.
7. **Prefer `gh` with `--json` field selection** over the GitHub MCP server: its responses are much smaller.
8. Record new decisions in `docs/fork/decisions.md`.

## Build and test
```
make help            # all targets
make check           # the gates this branch needs
make desktop-test    # engine/AI/desktop suite, ~2 min (upstream modules or root pom changed)
```
The engine and AI tests live in `forge-gui-desktop/src/test`, not in `forge-game` or `forge-ai`.
