# CLAUDE.md — fork-web/frontend

The web match screen: Vite + React + TypeScript (strict), pnpm, CSS Modules over one
design-token file. Data comes from mock scenarios, a recorded game, or the live bridge (`src/adapter/`).

## Layout
- `src/model/` — the UI view-model. Components depend only on these types.
- `src/mock/` — mock scenarios (switch with the "Mock" tag or the `` ` `` key; or
  `?scenario=<id>&layout=<columns|table|focus>` in the URL). Not offered in a live game (`mockScenariosAllowed`).
- `src/components/`, `src/state/`, `src/styles/` — UI, UI state, tokens and global styles.
- `src/wire/generated/` — wire types generated from the engine (issue #9). Only
  `src/wire/` and `src/adapter/` may import them; ESLint blocks imports elsewhere.
- `src/adapter/` — live source: WebSocket client, wire → view-model (`toView.ts`), prompts,
  intents → commands. Seat messages (call, prompt, reply, action…) are generated with the wire
  types (`WireEnvelope`); `protocol.ts` names the unions.
  - Live: `make web-server ARGS="--human-seat 0 --mode commander --players 4 --life 40"` + `make web-dev`, open
    `http://localhost:<vite port>/?live=1&seat=0#token=<seat 0 token the bridge printed>` (Vite proxies `/ws`).
    A new token needs a reload (only the hash changes). Dev builds expose the view-model as `window.__liveGame`.
  - Replay without the engine: `?replay=commander4&at=<messages>&play=<ms per message>`.
    Record another: `node scripts/record-stream.mjs --url ws://127.0.0.1:<port>/ws --token <t> --seat 0 --out x.jsonl`.

## Rules
- Binding design rulings: `docs/fork/design/match-screen-decisions.md`. Notes on what
  exists: `docs/fork/design/mockup-notes.md` (append a section per pass).
- Every colour, spacing, radius and font size comes from the design tokens; never
  hard-code them in components.
- Every state is shape/icon + colour, never colour alone (colour-blind players).
- No user-facing string hard-coded (issue #3): add it to `src/i18n/en.ts` and `fr.ts` and call `t('key', {…})`
  (a missing French key fails `tsc`; `i18n/hardcoded.test.ts` fails on hard-coded text). French runs ~30 % longer:
  fix overflow with layout, not shorter French. Engine-written text and the mock stay English (decisions.md).
- Card images (`src/adapter/images.ts`): live, the bridge's `/img?key=<image key>&token=…` for every card
  and token (Vite proxies `/img`), Scryfall by name as the fallback (`CardImage.fallback`); replay and mock,
  Scryfall (`cards/collection` in batches).
  A card with no image source (edition `???`: the Alchemy "A-" cards; or every source failed) is drawn as `CardText`, the
  engine's own data, in the hover preview and the inspector (`CardArt`).

## Dev loop and verification
- `make web-dev` (per-worktree port), `make web-front-check` (install, type-check, lint,
  tests, build).
- Verification policy (Playwright desktop context, measurements before screenshots, JPEG
  screenshots only): `.claude/skills/project-review-gate/SKILL.md`.
