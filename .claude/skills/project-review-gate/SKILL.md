---
name: project-review-gate
description: Forge-fork coder/reviewer gates — `make check` (only the gates a change needs), quiet logs, frontend verification in Playwright (desktop context, measurements before screenshots), bridge review axes (hidden information, security, threading), upstream ban. Preloaded by the reviewer agent; read before opening or reviewing a PR.
---

## Agent loop — Forge-fork rules for the `coder` / `reviewer` agents

The `coder` and `reviewer` agents are global and project-agnostic; they defer to this
section for fork-specific rules. The orchestrator owns merges, issue filing and epic
updates. Root `CLAUDE.md` rules apply on top (upstream ban, branches, pushing).

**Gates (both agents).**
- Run `make check` from the worktree root. It runs only the gates the branch's changes
  need (vs `origin/develop`): `web-front-check` for `forge-gui-web/frontend/`,
  `web-java-test` for `forge-gui-web` Java (or upstream modules), `web-desktop-test` for
  `forge-gui-desktop-web` (or `forge-gui-web` main code, or upstream modules), `desktop-test` only
  when an upstream module (`forge-core`, `forge-game`, `forge-ai`, `forge-gui`,
  `forge-gui-desktop`) or the root `pom.xml` changes. Nothing depends on
  `forge-gui-web`, so the desktop suite cannot fail because of it: never run it for
  web-only changes.
- Each gate writes its full log to `target/gate-logs/<name>.log` and prints a summary and
  the real exit code. Quote the `== <gate>: exit N` line as evidence. Read the log file
  (grep it) instead of re-running a command to see more output.
- Run a single module's tests while iterating (e.g. one test class with
  `mvn -B -q -pl forge-gui-web test -Dtest=ClassName`, or `pnpm vitest run <file>`),
  and the full `make check` once on the final state.
- Never paste whole build or test logs into the conversation, and never pipe a check
  through `tail`/`grep` without `set -o pipefail`: redirect to a file, keep the exit code.

**Frontend verification (both agents).**
- Dev server: `make web-dev` (per-worktree port, printed). Kill it before ending your turn.
- Playwright browser: it is shared, and its default tab emulates a phone. Open your own
  desktop context or tab, set the viewport explicitly (1920×1080 and 1366×768; add
  2560×1440 only for layout changes), never close tabs you did not open.
- **Measure before you look:** check layout with `getBoundingClientRect` / computed styles
  via `browser_evaluate`, not with screenshots. Take screenshots only at the end, at most
  one per scenario and viewport you changed. Accessibility snapshots are large: use them
  only to find an element.
- Screenshots are never committed as PNG. Only the 9 JPEGs in
  `forge-gui-web/frontend/docs/screenshots/` are tracked; regenerate one (same name,
  `magick in.png -strip -quality 80 out.jpg`) only if its view changed.
- Design source of truth: `docs/fork/design/match-screen-decisions.md` (the owner's
  rulings). A visible deviation from a ruling is a finding.

**Bridge review axes (`forge-gui-web` Java).**
- Hidden information: a client receives only what that player may see (`mayView`),
  including reveals and face-down cards. Any leak is blocking.
- Security: no client → server input before the Origin check and per-launch token pass.
- Threading: engine state is touched on the game thread; never block a Netty event loop;
  anything that waits has an explicit timeout.
- Client ids are resolved through current zone collections, never `Tracker.getObj`.

**Verdict threshold for this project (Hugo, 2026-10-15).** Hugo ruled that for the Forge
fork, for now, "everything is blocking" does **not** apply. This project ruling replaces
the hard-track "everything blocking, even nits" line of the global reviewer file here.
- **Blocking:** correctness and behaviour bugs, security, hidden information, threading,
  missing or broken tests, unmet acceptance criteria, violated owner rulings, and polish a
  user would notice in normal use (clipped or overlapping text, misaligned or jumping
  controls, wrong in-app copy).
- **Non-blocking:** slight polish and nitpicks — offsets of a few pixels visible only when
  zoomed in, single-frame glitches, internal code-style or immutability preferences with
  no concrete failure, wording of comments and docs.
- Verdict: **APPROVE** when only non-blocking notes remain; list them in one line each
  under "Notes (non-blocking)". **CHANGES-REQUESTED** only for blocking findings.

**Reviewer.**
- Report every finding in round 1. Round 2 checks the fixes and anything the fixup
  changed; a new finding in round 2 must concern code the fixup touched or a regression.
- Run the gates yourself with `make check` on the PR head. Don't re-run them unchanged.

**Coder.**
- Branch `feat/<issue>-<slug>` (or `fix/`, `docs/`, `chore/`) from `origin/develop`.
- PR into `develop` on Gautatyr/forge, body starts with `Closes #<issue>`; list declared
  deviations. Lean text: agents read it.
- If the task is too big to finish in a reasonable session, stop and report a split
  proposal instead of pushing through.
