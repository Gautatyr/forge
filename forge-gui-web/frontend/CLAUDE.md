# CLAUDE.md — forge-gui-web/frontend

The web match screen: Vite + React + TypeScript (strict), pnpm, CSS Modules over one
design-token file. Data comes from mock scenarios, a recorded game, or the live bridge (`src/adapter/`).

## Layout
- `src/model/` — the UI view-model. Components depend only on these types.
- `src/mock/` — mock scenarios (switch with the "Mock" tag or the `` ` `` key; or
  `?scenario=<id>&layout=<columns|table|focus>` in the URL).
- `src/components/`, `src/state/`, `src/styles/` — UI, UI state, tokens and global styles.
- `src/wire/generated/` — wire types generated from the engine (issue #9). Only
  `src/wire/` and `src/adapter/` may import them; ESLint blocks imports elsewhere.
- `src/adapter/` — live source: WebSocket client, wire → view-model (`toView.ts`), prompts,
  intents → commands. Message shapes it expects from the bridge: `protocol.ts`.
  - Live: `make web-server ARGS="--mode commander"` + `make web-dev`, open
    `http://localhost:<vite port>/?live=1&seat=0#token=<token the bridge printed>` (Vite proxies `/ws`).
  - Replay without the engine: `?replay=commander4&at=<messages>&play=<ms per message>`.
    Record another: `node scripts/record-stream.mjs --url ws://127.0.0.1:<port>/ws --token <t> --seat 0 --out x.jsonl`.

## Rules
- Binding design rulings: `docs/fork/design/match-screen-decisions.md`. Notes on what
  exists: `docs/fork/design/mockup-notes.md` (append a section per pass).
- Every colour, spacing, radius and font size comes from the design tokens; never
  hard-code them in components.
- Every state is shape/icon + colour, never colour alone (colour-blind players).
- No user-facing string hard-coded once i18n lands (issue #3): English and French, and
  French runs ~30 % longer.
- Card images load from `cards.scryfall.io` (live: resolved in batches through Scryfall's
  `cards/collection`, `src/adapter/images.ts`); the bridge will serve them later (#10).

## Dev loop and verification
- `make web-dev` (per-worktree port), `make web-front-check` (install, type-check, lint,
  tests, build).
- Verification policy (Playwright desktop context, measurements before screenshots, JPEG
  screenshots only): `.claude/skills/project-review-gate/SKILL.md`.
