# CLAUDE.md — forge-gui-web/frontend

The web match screen: Vite + React + TypeScript (strict), pnpm, CSS Modules over one
design-token file. Today it runs on mock data; issue #11 wires it to the bridge.

## Layout
- `src/model/` — the UI view-model. Components depend only on these types.
- `src/mock/` — mock scenarios (switch with the "Mock" tag or the `` ` `` key; or
  `?scenario=<id>&layout=<columns|table|focus>` in the URL).
- `src/components/`, `src/state/`, `src/styles/` — UI, UI state, tokens and global styles.
- `src/wire/generated/` — wire types generated from the engine (issue #9). Only the
  adapter may import them; ESLint blocks imports from components.

## Rules
- Binding design rulings: `docs/fork/design/match-screen-decisions.md`. Notes on what
  exists: `docs/fork/design/mockup-notes.md` (append a section per pass).
- Every colour, spacing, radius and font size comes from the design tokens; never
  hard-code them in components.
- Every state is shape/icon + colour, never colour alone (colour-blind players).
- No user-facing string hard-coded once i18n lands (issue #3): English and French, and
  French runs ~30 % longer.
- Card images load from `cards.scryfall.io` in mock data; the bridge will serve them later.

## Dev loop and verification
- `make web-dev` (per-worktree port), `make web-front-check` (install, type-check, lint,
  tests, build).
- Verification policy (Playwright desktop context, measurements before screenshots, JPEG
  screenshots only): `.claude/skills/project-review-gate/SKILL.md`.
