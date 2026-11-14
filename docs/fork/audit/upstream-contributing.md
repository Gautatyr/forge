# Contributing to upstream Card-Forge — rules, feasibility, local setup (2026-11-14)

Status: **adopted 2026-11-14** (decision log, "The fork contributes fixes upstream, owner-gated"). Every upstream write is drafted, then read by the owner, and posted only after the owner's go.

## 1. Upstream's rules (`CONTRIBUTING.md` on upstream `master`, read 2026-11-14)
- **Setup:** fork on GitHub, clone the fork, JDK 17+, Maven. Build: `mvn -U -B clean -P windows-linux install` (`-DskipTests` for speed).
- **Before a PR:** search open PRs and issues on the same topic; discuss large changes on Discord first; one goal per PR; profile performance-sensitive changes (1v1, 4-player Commander, wide token boards); screenshots for UI changes.
- **CI:** `mvn -U -B clean test` on Java 17 and 21 under Xvfb, on every push and PR. Checkstyle fails the build on unused or redundant imports.
- **Card scripts:** `forge-gui/res/cardsfolder`, format documented in the wiki's Card-scripting-API; copy a similar recent card as template; test the card in a game before the PR.
- **AI coding agents: explicitly allowed.** Claude Code is named. Conditions:
  - The human is the responsible author: understand the change and be able to explain it.
  - Disclose substantial agent work in the PR body or as a co-author line.
  - Reuse existing architecture; smallest clear change; fix the root cause; small PRs.
  - Short code comments; no comments that narrate the fix.
  - Reproduce the bug first, check the fix in a game, and say what was verified.
  - Concise PR text.
  - For engine or AI changes, run an adversarial agent review before opening.
  - Answer review comments in your own words, or say when text is pasted from an agent.
- **Tests:** fewest tests that protect behaviour. **No tests for card-script-only changes.** Engine tests should check a general rule, fail without the change, be fast and deterministic (no full games), one per behaviour, added to existing classes.
- **Bug reports:** GitHub issue template (describe, reproduce, expected, version).
- **Area owners** (`docs/Development/ownership.md`): ability effects friarsol, Hanmac, Northmoc, TRT; card scripting TRT, Northmoc, Simisays, Fulgur14, Dracontes. Check back after a merge in case it breaks snapshots.
- **License:** GPL-3.0. No CLA.

## 2. How upstream behaves in practice (measured 2026-11-14)
- **AI-assisted work is normal:** 205 of the last 1,000 commits on upstream `master` carry a `Co-authored-by: Claude …` line (Opus 5.5 most often).
- **Small fixes merge fast:** in the 60 most recent merged PRs, median time to merge was 8 h (max 89 h). One-line card-script fixes from occasional contributors (e.g. upstream PRs 12802, 12805, 12811, 12812, 12844) merged within 0–38 h.
- **Few rejections:** of the last 100 closed PRs, 6 were closed without merging.
- **Large backlog:** 247 open PRs, median age 65 days. These are mostly large engine, AI or feature PRs from regulars; a large or debatable engine change can wait weeks.
- **Our access:** `Gautatyr` has pull-only permission on Card-Forge/forge (no push), so a push there is impossible even by mistake. Every outside contributor works this way: branches live in their own fork, and the PR asks upstream to pull from it.
- **Review questions on small fixes are rare.** Of the 120 most recent merged PRs, 15 were small script-only fixes (10 lines or fewer, all under `forge-gui/res/`):
  - 11 got no written comment from anyone else; 1 got "thanks".
  - 3 got an "Initial Claude review" comment that maintainer MostCromulent posts on some PRs (17 of the 120): 2 said "no blocking issues", 1 found a real problem the author had to fix.
  - Expect the questions to be about whether the fix is right and complete, not about style.

## 3. Feasibility for our findings (audit `card-rules-2026-11-14`)
Duplicate search done on upstream PRs and issues (titles and bodies):

| Finding | Upstream state | Change size | Fit with the rules |
|---|---|---|---|
| Fiend Hunter, doubled ETB loses a creature | none | script line, or the shared `ForgetOtherRemembered` handling (65 scripts) | easy if script-only; a shared fix needs a look at the other 64 scripts |
| Skyclave Apparition, doubled ETB token size | none | script | easy; needs a short rules argument (CR 607.2a), no official ruling for the doubled case |
| Narset Transcendent, rebound never expires | none | one script flag (`ThisTurn$ True`) | trivial, matches 35 of 38 peer scripts |
| Hapatra, AI picks no target | none | one script flag (`IsCurse$ True`) | trivial |
| Boggart Trawler text | none | one Oracle line | trivial |
| ~~Cast from graveyard misses "leave your graveyard" triggers~~ | **withdrawn 2026-11-14: false positive** (the priority loop in `PhaseHandler` fires it; the audit test bypassed the loop) | — | no contribution |
| Garruk, Veiled Butcher | issue 12143 + PR 12218 open | — | already handled; at most confirm the bug on the issue |

Verdict: **feasible.**
- The four script fixes are the kind upstream merges within a day. Per the rules they need no tests: check them in a game instead.
- ~~The engine fix is a good, well-scoped first engine PR.~~ Withdrawn 2026-11-14: the "bug" was a test-harness false positive (see the table). Lesson for future audits and contributions: reproduce through the real priority loop (`PriorityTestBase`) before claiming an engine bug.

Costs and risks:
- **Owner time.** You must be able to explain each change and answer reviewers.
- **Fork policy reversal.** `CLAUDE.md` "Fork rules", `docs/fork/decisions.md`, and the git-and-workflow memory say never write upstream. A new decision entry must supersede that.
- **Public trail.** PRs come from the public `Gautatyr` account. Commits use the GitHub noreply address (`97909616+Gautatyr@users.noreply.github.com`), so no private email is exposed.

## 4. Local setup (done 2026-11-14)
- **Checkout:** `/home/hugo/workspace/CodeRepository/forge-contrib`, a git worktree of the fork repo, detached at upstream `master` (`5a7f95b72a3` when created). It shares the fork repo's remotes:
  - `upstream` = Card-Forge/forge, fetch only (push URL `DISABLED`).
  - `origin` = Gautatyr/forge, a GitHub fork of Card-Forge/forge, so PRs can come from its branches.
- **Before calling something a rules bug:**
  1. Read the card's official rulings (Scryfall "Notes and Rules Information", source `wotc`) and the rulings of the cards it interacts with.
  2. Reproduce through the real priority loop (`PriorityTestBase`).

  Two audit findings were withdrawn on 2026-11-14 for skipping one of these: Skyclave Apparition had an official ruling matching Forge, and the cast-from-graveyard trigger came from a test harness shortcut.
- **Flow per contribution** (once the owner approves):
  1. `git -C ../forge-contrib fetch upstream`
  2. `git -C ../forge-contrib switch -c contrib/<slug> upstream/master`
  3. Make the change; run `mvn -U -B clean test` (the CI command).
  4. Push the branch to `origin` (Gautatyr/forge, already allowed by the fork rules).
  5. `gh pr create -R Card-Forge/forge --base master --head Gautatyr:contrib/<slug>`. This is the only step that writes upstream, and it is not yet allowed.
- **Why a worktree and not a new clone:** GitHub allows one fork of a repository per account, so contribution branches must live in Gautatyr/forge anyway. The fork repo already has exactly these remotes. A new clone would need `git remote add` / `git config`, which this project's `.claude/settings.json` denies.
- **No CLAUDE.md in that checkout:** upstream has no `CLAUDE.md`/`AGENTS.md`, and the fork's `CLAUDE.md` is not on upstream `master`. Agents working there must be briefed with upstream's `CONTRIBUTING.md`.
- **Baseline CI run:** see section 5.

## 5. Baseline: upstream CI command on a clean upstream master
- **Run:** `mvn -U -B clean test` in `forge-contrib` at `5a7f95b72a3`, JDK 17 (the only JDK installed), on the real display (no Xvfb locally).
- **Result:** `BUILD SUCCESS` in 2 min 44 s. Tests: 2,589 run (23 + 27 + 2,539), 0 failures, 0 errors, 7 skipped. Checkstyle ran and passed.
- The order-dependent sticker-test failure the fork worked around (fork issue #43) did not show up in this run.
- **Gap:** CI also tests on JDK 21. Testing locally would need `paru -S jdk21-openjdk` (owner installs) plus `JAVA_HOME` set per run.
