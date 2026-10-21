# DRAFT — Epic: new web match screen (multiplayer-first)

Status: draft for the owner's review (2026-10-15). Once approved, this becomes the epic issue on Gautatyr/forge, and each item below becomes a sub-issue. After that, the GitHub epic is the source of truth and this file is only the original draft.

## Goal
Replace the Swing in-game screen with a modern web match screen (React + TypeScript), fed by the Java engine over a local WebSocket. Commander with 3–4 players is the primary case; 1v1 must work. English and French. The Swing app keeps every other screen for now.

## How to work on this epic
- Read `CLAUDE.md`, `docs/fork/decisions.md` and `docs/fork/design/match-screen-decisions.md` first.
- One sub-issue = one branch = one PR into `develop` on Gautatyr/forge.
- Never interact with upstream Card-Forge (read-only fetch and issue reading only).
- Record new decisions in `docs/fork/decisions.md`.

## Phase 0 — Foundations (done)
- [x] Codebase audit (`docs/fork/audit/`)
- [x] Tech choice: web UI (`docs/fork/decisions.md`)
- [x] Web bridge spike: go (`docs/fork/architecture/spike-report.md`)
- [x] Mockup v1 + owner review 1 (`docs/fork/design/mockup-notes.md`, `mockup-review-1.md`)

## Phase 1 — Design iteration (frontend, mock data)
1. **Mockup pass 2: review-1 fixes** — stack-follows-targets, side-panel scrolling, scale slider, stable controls, Focus default, configurable board split, hand staggering. *(in progress)*
2. **Mockup pass 3: product decisions** — turn sequence and phase stops, manual mana payment and floating mana, keyword icons with hover explanations, readable opponent cards and better use of space.
3. **English/French switch** — i18n structure for UI strings; card names and text from Forge's translations; French card images where Scryfall has them.
4. **Remaining interactions** — mulligan, damage assignment, number/text input, attacking planeswalkers and battles, end of game, concede, settings.
5. **Owner review 2** — click-through review; rulings archived in `docs/fork/design/`.

## Phase 2 — Bridge (Java, `fork-web`; independent of the visual design)
6. **Hidden information per viewer** — the server sends each player only what they may see (hands, libraries, face-down cards, reveals).
7. **Connection security and backpressure** — `Origin` check, per-launch token, bounded send queues.
8. **Human seat: prompts and actions** — the 13 prompts and 16 player actions over the WebSocket; hardened replies (timeouts, cancellation, thread-safe ids).
9. **Generated TypeScript types** — generate wire types from `ProtocolMethod` and `TrackableProperty` at build time, so upstream changes break the build loudly.
10. **Card images over HTTP** — serve images from Forge's local cache.

## Phase 3 — Wire the UI to the engine
11. **Adapter: wire format → UI view-model** — the only layer that knows the wire format.
12. **Playable 1v1 vs AI** — end to end, launched from the command line.
13. **Playable 4-player Commander vs AI.**
14. **Launch from the Swing app, and packaging** — starting a match opens the web match screen; decide browser vs JCEF vs Electron/Tauri.

## Phase 4 — Polish (later)
Animations and sound, themes, full accessibility pass, rebindable shortcuts, 5–8 player layouts, network play and spectating.

## Out of scope (future epics)
AI improvements, rules fixes, replacing the other Swing screens (deck editor, quest, …), the weekly upstream-sync routine.
