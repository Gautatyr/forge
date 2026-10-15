# Match screen mockup: notes

Clickable mockup of the new match screen, built against [match-screen-decisions.md](match-screen-decisions.md) (binding) and [match-screen-memo.md](match-screen-memo.md). Mock data only; no engine. Code: `forge-gui-web/frontend/`.

## Run it
```fish
cd forge-gui-web/frontend
pnpm install
pnpm dev --port 5173          # http://localhost:5173
pnpm check                    # tsc + eslint + vitest (17 tests)
pnpm build                    # production build into dist/
pnpm resolve-cards            # only when the mock card list changes (calls Scryfall)
```
- Scenario picker: the small **Mock** tag at the top-left, or the `` ` `` key. URL parameters also work: `?scenario=blockers&layout=table&size=l`.
- Scenario ids: `priority`, `blockers`, `scry`, `search`, `duel`, `hand9`, `hand12`. Layout ids: `columns`, `table`, `focus`. Sizes: `s`, `m`, `l`.
- Display options persist in `localStorage` (`forge.match.prefs.v1`); URL parameters override them.

## Stack
- Vite 8, React 19, TypeScript 6.0 (strict, `noUncheckedIndexedAccess`), ESLint 10 + typescript-eslint, Vitest 5. TypeScript 7 (the native port) is current but typescript-eslint supports only `<6.1`.
- **Styling: CSS Modules + one token file** (`src/styles/tokens.css`). Chosen over Tailwind v4 because the components carry a lot of state-driven styling (rings, strips, badges) that reads better as named classes than as utility strings, tokens stay plain CSS custom properties the future theme/scale settings can override at runtime, and there is no extra build plugin. Components never use a colour literal.
- Fonts are bundled (`@fontsource`), so nothing loads at runtime except card images from `cards.scryfall.io`.
- All sizes are in `rem`; the root font size is `clamp(12.5px, 1.48vh, 26px) × UI scale`, so 1080p = 16 px, 1440p ≈ 21 px, and the UI-scale slider (75–200 %) scales everything (D10).

## Code map
| Path | Role |
|---|---|
| `src/model/types.ts` | UI view-model: `GameView`, `PlayerView`, `CardView`, `StackItem`, `Decision`, five `ChoicePrompt` shapes. Components depend only on this. The bridge adapter maps the wire format onto it. |
| `src/model/intents.ts` | Everything the player can ask (`play`, `toggleTarget`, `primary`, `assignBlock`, `answer`, `setStop`, …). Maps later onto `selectCard` / `selectButtonOk` / `sendYieldUpdate` etc. |
| `src/state/` | Screen-only state (`ui.ts`), display prefs, derived card status, main-button wording (`primaryAction.ts`), either-order block logic (`blockClick.ts`), keymap. |
| `src/components/` | The screen. Layout maths for the hand and battlefields is pure and unit-tested (`handLayout.ts`, `battlefieldLayout.ts`). |
| `src/mock/` | Fake engine (`engine.ts`), scenario builder, scenarios, resolved Scryfall data (`scryfall-cards.json`, 74 cards). Throwaway once the bridge exists. |
| `scripts/resolve-scryfall.mjs` | One-off resolver: `/cards/collection` POST + 3 token searches, 600 ms spacing, backs off on 429, descriptive User-Agent, asserts every image is on `cards.scryfall.io`. |

## Scenarios
| Id | What it shows |
|---|---|
| `priority` | 4-player Commander, your turn 9, main 1, you hold priority. Stack: your Swords to Plowshares → Ana's Meren; Mira's Lightning Bolt → your Eidolon of Blossoms. Instant-speed cards lit (Path, Heroic Intervention, Beast Within, Moment's Peace via flashback). Sythis on the battlefield with Swiftfoot Boots, Knight of Autumn with Rancor and two +1/+1 counters, Setessan Champion with three, summoning-sick Selfless Spirit, tapped Elvish Mystic, three Angel tokens grouped, lands grouped; Talrand in Theo's command zone (tax +4); Theo's Search for Azcanta transformed; commander damage on three players; graveyards and exiles filled; life 22–34. |
| `blockers` | Mira's turn 10, declare blockers. Krenko, Goblin Chieftain and two Goblin tokens attack you, Skirk Prospector attacks Theo. |
| `scry` | Temple of Plenty entered: scry 2 in the choice tray (two lists, move and reorder). |
| `search` | Cultivate resolving: choose up to 2 of 4 basic land cards (choose-N shape, keys 1–9). |
| `duel` | 1v1 constructed against the AI, your main phase. |
| `hand9` | Nine cards in hand plus two castable elsewhere (Sythis from the command zone with tax, Moment's Peace by flashback): eleven cards, no overlap. |
| `hand12` | Twelve cards in hand: staggered overflow. |

Things to click (all fake logic, all undoable with `Z`):
- **Cast:** click a lit card. Targeted spells enter targeting (legal targets dashed + target icon, everything else faded; the card being cast turns yellow). `Esc` cancels. Lands play; Emeria's Call asks which face. Casting an enchantment triggers Sigil of the Empty Throne.
- **Resolve:** `Space` or the orange button. In `priority`: Heroic Intervention → Bolt fizzles (hexproof); Swords exiles Meren to the command zone and Ana gains 3.
- **Attack:** with an empty stack in main 1, the button says *Go to combat*. Click creatures; click a player plate or a chip in the rail to change whom new attackers hit; `A` attacks with all; the button says *Attack with N*.
- **Block (either order):** click your creature then the attacker, or the attacker then your creature. Click a blocker again (or × in the rail) to remove the block.
- **Hover** any card or log name for the large preview; **right-click** or `I` for the inspector.
- **Stack:** hover an item to draw its target line; "Always yield to this" per item; the global *Auto-yield* toggle in the stack header.
- **Phase track:** the two octagons under each step are stops for your turns / opponents' turns.
- **Zones:** Graveyard and Exile chips open the zone in the rail.
- **Top bar:** Log (`L`), Display (`D`), Keys (`?`), Game menu.

## The opponent layouts (Display → Opponents layout)
Card widths measured at 1920×1080 in `priority` (creature row; px).

| Layout | Opponents | You | Strengths | Weaknesses |
|---|---|---|---|---|
| **Columns** (default) | 77–89 | 123 | Equal weight, nothing to configure, reads left-to-right in turn order. Scales to 5–6 players as more columns, 7–8 as two rows. | Opponent cards are small at 1080p: art recognisable, rules text needs hover. |
| **Table** | 115 (left/right seats), 90 (top) | 89 | Seats match turn order (next player on your left, clockwise); side seats are tall, so their creatures get the biggest cards of any layout; combat from a side seat is easy to read. | Your own board shrinks; with 5–8 players the side columns need to split. 3 opponents only; other counts fall back to Columns. |
| **Focus** | 94 focused; 45–91 compact | 123 | One opponent at full detail, picked by you ("Show whole board") or automatically: the attacker in combat, else the active player. The memo's original proposal. Best for 5–8 players. | Compact seats hide non-creature permanents and lands (a count is shown); you must switch focus to read them. |

Every battlefield picks its own arrangement (creatures and lands in two rows, or one row; up to four lines per row) to give creatures the biggest cards that fit, so the same code serves wide, tall and compact seats and 1v1 (176 px cards).

## Design choices beyond the rulings
- **Look:** dark blue-green "night table" so card art carries the colour; chrome stays quiet. Display face Bricolage Grotesque (life totals, names, the main button); body Atkinson Hyperlegible Next, a typeface designed for low-vision legibility; numbers in Atkinson Hyperlegible Mono.
- **State encoding (Okabe–Ito, always colour + shape + icon):** orange = you must act (priority tag with hourglass, main button); sky blue solid ring + play notch = playable; sky blue dashed ring + target icon = legal target; yellow thick ring + check = chosen; vermillion ring + sword strip naming the defender = attacking (card also nudged toward the defender); green ring + shield strip naming the attacker = blocking; reddish-purple dotted ring + target badge = targeted by the stack; "zz" badge = summoning sick; rotation = tapped; crown = commander; ▲/▼ inside the P/T pill = modified P/T. Block lines are solid with shield markers; stack-target lines are dashed with target markers.
- **Measured contrast (WCAG):** body text on panels 13.4:1, secondary 8.5:1, tertiary 5.8:1 (5.0:1 on raised panels); dark text on orange 8.3:1, sky 8.1:1, yellow 14.1:1, vermillion 4.8:1, green 5.4:1, purple 6.1:1; tinted state text on panels ≥ 6.2:1. A simulated deuteranopia render is committed as `docs/screenshots/cb-deuteranopia-05-blockers-columns.jpg`. Weakest pair: under deuteranopia the blocking green turns grey-olive; it still differs from attacking (yellow) in lightness, and the shield icon, strip text and solid line carry it.
- **Hand overflow (D2):** up to 9 cards always flat (161 px wide at 1080p; 135 px with 9 + 2 other-zone cards). Beyond that, a two-level stagger: odd cards sit higher, behind, with their whole name-and-cost band (13 % of the height) above the front cards; front cards are never covered. Hover or focus lifts any card fully into view. Unit-tested up to 20 cards.
- **Cards castable from other zones** sit right of the hand behind a divider, each captioned ("Command zone · tax +2", "Graveyard · flashback"). Your commander in the command zone always shows there.
- **Attackers stay upright during combat** (Arena does the same) so the cards you must block stay readable; they are still tapped in the model.
- **Combat lives in the right rail** while it lasts: every attack with its defender, your blocks, unblocked damage, and (while attacking) whom new attackers hit. The rail is the "what is happening" column: stack (when not empty), combat (in combat), an open zone, recent events.
- **Choice tray** sits over your own board only, never over opponents; `V` or "Peek at board" folds it into a one-line bar. The orange main button mirrors the tray's confirm.
- **Main button wording:** *Resolve* (with what resolves), *Go to combat*, *End turn*, *Pass priority*, *Cast Path to Exile*, *Attack with 2*, *Block with 2 · You take 4 damage*, *Skip attack*, *No blocks*, *Confirm scry*. Disabled with a reason while someone else decides.
- **Dimming** only applies to your own irrelevant cards and to illegal targets; opponents' boards stay readable in combat.
- **Auto-pass** is a labelled switch under the main button (`P`); **auto-yield** is off globally (stack header) and per item. Both default off (D4); a test asserts it for every scenario.
- **To my turn** (pass until your next turn, `Shift+Enter`) replaces Forge's "End turn" wording, which is ambiguous on an opponent's turn.
- **Commander damage** is shown on the player who took it, with the source commander, value and /21; from 15 on the chip gets an outline, bold text and a burst icon instead of the crown.

## Open questions for the owner
1. **Which opponent layout** should be the default for 3–4 players: Columns, Table or Focus? Should Focus auto-switch to the attacking or active player (it does now), or only on click?
2. **Your board vs theirs:** at 1080p the split is 45 % opponents / 55 % you. Would you trade some of your board for bigger opponent cards?
3. **Two opponents attacking you at once** cannot happen in Commander (only the active player attacks), so the blockers scenario has one opponent attacking you and Theo. Is that the case you meant, or a team format (Two-Headed Giant, Archenemy)?
4. **Stops:** two rows of octagons (your turns / their turns) under each step. Clear enough, or prefer per-player stops (Forge's current model) behind a "More" door?
5. **Hand of 10+**: is the stagger acceptable, or would you rather shrink cards further before staggering? (Today: 10+ staggers only when flat cards would drop below 85 % of full size.)
6. **Mana payment** is not designed yet (auto-pay is assumed). Where should manual payment and the floating mana pool live: in the action panel, or on the lands?
7. **Lands of opponents**: grouped by name and tapped state. Enough, or show a per-colour untapped count ("3 untapped: G G U") so you can read open mana at a glance?

## Not done / known gaps
- Distribute (damage assignment) and text/number input prompts are typed in the view-model but drawn as a placeholder.
- Planeswalkers/battles as attack targets, damage assignment order, mana payment UI, mulligan, end-of-game screen, concede and settings are not built (menu entries are disabled).
- The fake engine is shallow: no real mana colours, no triggered abilities beyond Sigil, opponents never act after your turn ends.
- Arrow lines are measured from the DOM after render; they do not follow card animations mid-flight.
- Scryfall's image CDN occasionally refuses a burst of requests; a failed image retries once after 1.2 s, then shows the card name.
- No visual regression tests; screenshots are manual (`docs/screenshots/`).

## Screenshots
`forge-gui-web/frontend/docs/screenshots/` holds 9 committed JPEGs (about 3 MB): the three 4-player layouts, blockers, scry, 1v1, a 12-card hand, the inspector, and a deuteranopia simulation.

The full PNG set (34 views at 1366, 1920 and 2560 px, plus 5 colour-blind simulations, about 53 MB) is kept out of git: `*.png` in that folder is ignored. It exists only on the machine where it was taken; regenerate it with the Playwright browser tools when needed.

## Pass 2 (2026-10-15)
Clear-cut rulings from [mockup-review-1.md](mockup-review-1.md). Product decisions (phase stops, mana payment, keyword icons, opponents' card size) are not in this pass.

| Ruling | Change | Code |
|---|---|---|
| Target highlights follow the stack | One stack item is in the spotlight: the top one by default, or the hovered one. Only its targets get the purple ring, the target badge and the dashed line; targeted players get a ring and a "Targeted" tag. Other items show nothing until hovered. Default spotlight is off while you choose targets (legal-target rings win). Hover text still names every item targeting a card. The stack list scrolls; the line starts on the visible part of its item and is hidden while the item is scrolled out. A player target's line and marker end just outside the plate's ring. Lines pass behind text (masked): plates, compact-seat summaries, card P/T, counts, counters, damage, combat strips (`data-arrow-occluder`). A card any stack item targets is never grouped into a ×N entry. | `state/cardStatus.ts` (`spotlightItem`, `playerTargetSpot`), `Arrows.tsx`, `arrowGeometry.ts`, `battlefieldGroups.ts`, `Rail.tsx`, `PlayerPlate.tsx` |
| Side panel scrolling | Every rail region (stack, combat, open zone, recent) keeps its header and scrolls its own body. Regions size to content and share the shortfall; floors keep each header and a few lines visible; the rail scrolls as a last resort. Recent shows the last 20 events, newest first. | `Rail.module.css`, `CombatPanel.module.css` |
| UI scale slider | Dragging previews the value ("release to apply"); the scale applies on the native `change` event (pointer release, or each keyboard step). | `Overlays.tsx` (`ScaleSlider`) |
| Stable controls | Action panel, bottom up: auto-pass switch; fixed two-column row Undo / To my turn (Stop passing in the same slot); main button with a fixed minimum height; a reserved one-row slot for contextual buttons (Attack all, Cancel). Cancel moved out of the Undo row. The prompt text may use the empty slot; it is clamped to the whole lines that fit. "Attack with all (N)" is now "Attack all (N)". | `ActionPanel.tsx`, `ActionPanel.module.css` |
| Focus layout default | Focus is screen state, no longer a saved preference. An opponent's turn starts: focus them. Your turn: keep the current focus (first load: the opponent who played before you). Attacking an opponent (attacker toggle, Attack all, defender pick) focuses them. "Show board" overrides until the next of these. In Focus the attack defender is the focused opponent (`currentDefender`), so the big seat always matches the selected defender. The button moved into the compact plate's name row, so a short seat can no longer clip it. | `state/focus.ts`, `MatchContext.tsx`, `Board.tsx`, `PlayerPlate.tsx` |
| Board split configurable | Display → "Board height for opponents": 35 / 40 / 45 / 50 / 55 %, default 45. Applies to Columns, Focus and Table (Table's top row was 42 %, now follows the setting). 1v1 stays 50 / 50. | `state/prefs.ts` (`opponentShare`), `Board.tsx`, `Overlays.tsx` |
| Hand beyond 9 cards | 10+ cards stagger at full size at once (pass 1 shrank to 85 % first). They stay flat only if all fit at full size with no overlap. Cards shrink only when back cards would collide; the shrunk row, other-zone cards included, fits the width. Measured at 1920×1080 with 2 other-zone cards: 9 → 135 px (flat), 10 and 12 → 161 px, 15 → 156.5 px; every hand ends at the same right edge. | `handLayout.ts` |
| No per-colour untapped mana for opponents | Confirmed none exists. Compact seats show only a land count with the number untapped. | — |

New scenarios: `stack6` (six-item stack, three players, card and player targets), `hand10`, `hand15`. The Focus scenario at load now focuses Ana (played before you) instead of Mira.

The mock engine now resolves abilities and triggers without moving their source (Goblin Bombardment deals 1 damage; other abilities log their text).

Tests: 55 (pass 1: 17). New: spotlight (`state/stackSpotlight.test.ts`), focus and default defender (`state/focus.test.ts`), hand 10/12/15 and n + extra widths (`components/layout.test.ts`), line start and player anchor (`components/arrowGeometry.test.ts`), grouping of targeted tokens (`components/battlefieldGroups.test.ts`). The auto-pass/auto-yield default test now covers every scenario.

Verified with Playwright at 1920×1080 and 1366×768 (desktop context, device scale 1): every scenario in all three layouts with no console errors or warnings. Undo, To my turn and the auto-pass switch keep identical rects in 18 states, including targeting, attack drafts, pending blocks, passing to your turn and waiting. Rail regions scroll independently with the stack, an open graveyard and recent events all visible at 1366×768. The scale stays unchanged while dragging and applies on release and on arrow, Home and End keys. All 9 committed JPEGs were regenerated. The deuteranopia JPEG uses the Machado 2009 matrix in linear RGB (ImageMagick `-color-matrix`).

Not addressed, waiting on product: at 1366×768 and 1920×1080 the compact plate of an opponent with a commander thumbnail (Theo) is still taller than its seat, and its bottom chips are clipped.

## Pass 3D: right panel (issue 23)
Spec: [product-decisions-pass-3.md](product-decisions-pass-3.md), section 4 "Right panel".

| Change | Code |
|---|---|
| The right panel is one full-height column (grid area `rail` spans the board and hand rows), same place in every layout. Top: stack, combat, open zone (when present); then Recent, which takes the height left (floor: header + three two-line events). Bottom: the action block. | `MatchScreen.module.css`, `Rail.tsx`, `Rail.module.css` |
| Action block, top to bottom: floating-mana slot (`data-slot="floating-mana"`, hidden while empty; issue 24 fills it), prompt, contextual row (Attack all, Cancel; present only while one shows), main button, Undo / To my turn, auto-pass switch. It is content-sized and bottom-anchored, so whatever comes and goes above the main button takes its height from Recent and the controls below never move. | `ActionPanel.tsx`, `ActionPanel.module.css` |
| Prompt: content-sized, at most 4 whole lines (`-webkit-line-clamp`), full text in the hover title. Fixes the 0 px prompt at 200 % UI scale, and the one-frame cut (the measured line count and its ResizeObserver are gone). | `ActionPanel.*` |
| Player-target anchor: the segment to the plate centre is intersected with the plate box inflated by the gap, no cap; the marker centre is always ≥ gap (17 px) from the plate. | `arrowGeometry.ts` (+ tests) |

Above the action block, the regions scroll as a last resort (at 200 % UI scale with a stack and an open zone); the action block never scrolls.

Measured with Playwright (desktop context, scale 1): at 1366×768 and 1920×1080, 100 %, every scenario in all three layouts and in states (zone open, passing to your turn, attack declaration, attack draft with Cancel), the only space below the last region is the column padding; Recent shows ≥ 3 whole events whenever the log has 3; Undo, To my turn and the switch keep identical rects; the prompt sits one `--sp-2` gap above the next control. At 200 % the prompt is 55 px (1366) / 70 px (1920) tall and never clipped. Stack6, every layout, 1366/1920/2560: player-target marker centre 17 px or more from the plate.

## Pass 3A: turn strip and Stops panel (issue #20)
Spec section 1 of [product-decisions-pass-3.md](product-decisions-pass-3.md), defaults from its "Engine facts".

| Change | Code |
|---|---|
| Top bar left: "<shape> <name>'s turn" / "Your turn", "Turn N · next: <shape> <name>" (skips players who lost), chip "⌛ Waiting for you" (orange) or "⌛ Waiting for <shape> <name>" (neutral). Waited-for player = the `waiting` decision's player, else you. An AI's chip appears after 400 ms (slot kept). | `TopBar.tsx`, `state/turnStrip.ts` |
| Strip: Upkeep, Draw, Main 1, Start, Attack, Block, Damage, End, Main 2, End step; captions "Beginning" (Upkeep, Draw) and "Combat". Untap and Cleanup dropped; "Begin" → "Start". Current step = filled pill with ▶; earlier steps faint. No stop marks. Hover: on whose turns the game stops there; click (or **Stops**) opens the editor. | `PhaseTrack.tsx`, `model/phases.ts` (`PRIORITY_STEPS`, `STEP_RUNS`, `stopName`) |
| Fit: from natural widths (`fitLevel`), tool buttons drop their words first (icon + key letter + tooltip), then the combat steps fold into one "Combat" pill outside combat; the turn block truncates with "…" last. English fits at level 0 down to 1000×768 at UI scale 100 %; the levels engage at 1366 px from UI scale 150 %. | `TopBar.tsx` (`useFit`), `state/turnStrip.ts` |
| Main button names the next stop with an empty stack: "Pass priority" / "End turn" · "Next stop: Theo's Attack step" / "your Main 1" (`nextStop`: rest of this turn, then each following turn, per-opponent rows included). The Space key moved onto the label line so the detail line gets the full width. | `state/primaryAction.ts`, `state/stops.ts`, `ActionPanel.*` |
| Stops editor: non-modal panel over the opponents' area (no scrim), Done or Esc. Rows "On my turn", "On opponents' turns" ("On opponent's turns" in 1v1); cells are words: filled "Stop", faint "Pass", dashed "Mixed". "Set per opponent ▸" (multiplayer) adds a row per opponent; the shared row shows "Mixed" when they differ, and a shared click sets every opponent. "Reset to defaults", the auto-pass switch, help line "You always get to respond when something is on the stack." Columns line up under the strip's steps (measured, within 3 px); when the strip folds, the grid sizes itself. | `StopsPanel.tsx` |
| Stops are a client setting in prefs (`prefs.stops`), Forge's defaults: your turn Main 1, Declare blockers, Main 2; opponents' turns Beginning of combat, Declare attackers, Declare blockers, End step. Shared rows persist; per-opponent rows last one match (dropped on load). `GameView.stops` and the `setStop` intent are gone; the bridge (#11) answers `isUiSetToSkipPhase(turnPlayer, phase)` from the client's stops. | `state/prefs.ts`, `state/stops.ts` |

Dev "Mock" tag moved to the bottom-left corner (it covered the turn block).

Measured contrast: "Stop" chip 10.5:1, "Pass" 5.8:1, "Mixed" 8.5:1 (on `--c-panel`); neutral chip 7.3:1; captions 7.2:1 on the bar, 5.8:1 on the combat run.

Not done: the player plate's "Priority" tag is unchanged (no 400 ms delay, no "Waiting for" wording). At 1366 px with UI scale ≥ 175 % during combat (no fold), the top bar still overflows and clips the tool buttons; the spec gives no third fallback. Committed JPEGs in `forge-gui-web/frontend/docs/screenshots/` still show the pass-2 top bar.
