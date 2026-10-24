# Match screen mockup: notes

Clickable mockup of the new match screen, built against [match-screen-decisions.md](match-screen-decisions.md) (binding) and [match-screen-memo.md](match-screen-memo.md). Mock data only; no engine. Code: `fork-web/frontend/`.

## Run it
```fish
cd fork-web/frontend
pnpm install
pnpm dev --port 5173          # http://localhost:5173
pnpm check                    # tsc + eslint + vitest (17 tests)
pnpm build                    # production build into dist/
pnpm resolve-cards            # only when the mock card list changes (calls Scryfall)
```
- Scenario picker: the small **Mock** tag at the top-left, or the `` ` `` key. URL parameters also work: `?scenario=blockers&layout=table`.
- Scenario ids: `priority`, `blockers`, `scry`, `search`, `duel`, `hand9`, `hand12`. Layout ids: `columns`, `table`, `focus`.
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
- **Attack:** with an empty stack in main 1, the button says *Go to combat*. Click creatures; click a player plate or a chip in the rail to change whom new attackers hit (live: also a planeswalker or battle the engine offers, on the board or in the rail, `attackOptions`, #65); `A` attacks with all; the button says *Attack with N*.
- **Block (either order):** click your creature then the attacker, or the attacker then your creature; several blockers per attacker. Click a blocker again (or × in the rail), or pair it with the attacker it blocks, to remove the block; pair it with another attacker to move it. Live, after the first click only its legal partners stay lit (engine `blockOptions`, #48); an illegal pair shows "X can't block Y." and keeps the first click.
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
- Damage assignment order, mana payment UI, mulligan, end-of-game screen, concede and settings are not built (menu entries are disabled).
- The fake engine is shallow: no real mana colours, no triggered abilities beyond Sigil, opponents never act after your turn ends.
- Arrow lines are measured from the DOM after render; they do not follow card animations mid-flight.
- Scryfall's image CDN occasionally refuses a burst of requests; a failed image retries once after 1.2 s, then shows the card name.
- No visual regression tests; screenshots are manual (`docs/screenshots/`).

## Screenshots
`fork-web/frontend/docs/screenshots/` holds 9 committed JPEGs (about 3 MB): the three 4-player layouts, blockers, scry, 1v1, a 12-card hand, the inspector, and a deuteranopia simulation.

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

Not done: the player plate's "Priority" tag is unchanged (no 400 ms delay, no "Waiting for" wording). At 1366 px with UI scale ≥ 175 % during combat (no fold), the top bar still overflows and clips the tool buttons; the spec gives no third fallback. Committed JPEGs in `fork-web/frontend/docs/screenshots/` still show the pass-2 top bar.
## Pass 3B: keyword icons (issue #21)
Spec: [product-decisions-pass-3.md](product-decisions-pass-3.md) §3. Icon set and one-line texts: [keyword-icons.html](keyword-icons.html) (a test checks glyphs and lines against it, and codepoints against `mana-font/css/mana.css`).

| What | Code |
|---|---|
| Model: `CardView.keywords: CardKeyword[]` (`name`, `label` with value, engine `reminder`, `grantedBy {cardId, name, untilEndOfTurn}`) replaces `grantedKeywords`. The bridge must fill printed vs added and the source (engine gap: `KeywordInterface.getView` drops them). | `model/types.ts` |
| Catalogue: own icons, 6 extra + hexproof from each colour, generic static / triggered, no-icon list (flash, cycling, kicker, flashback, cascade, convoke, enchant, equip), display order (added first, then evasion, combat, protection, rest), "+N" slot plan. | `components/keywordCatalog.ts` |
| Icons, "+N" chip, tooltip (300 ms hover, focus, click; hoverable; Escape, resize and a scroll that moves the icon close it), word chips. A pointer click on an icon or chip also does the card's click; right-click inspects the card; Enter on a focused icon only shows its tooltip. Font: `mana-font@1.18.0` `fonts/mana.woff2` (187 KB, loaded only when an icon renders; no stylesheet from the package). | `components/KeywordIcons.tsx` |
| Placement: frame over the card box, rotated with tapped cards; each icon turned back upright, so on a tapped card they run along the bottom edge from the P/T box. Column starts above P/T, above the damage badge, or above the attack/block strip (58 %). On grouped cards showing icons the "×N" count moves to the left edge (not for no-icon keywords, nor below 3.25rem). | `Card.tsx`, `Card.module.css` |
| Inspector lists every keyword (no-icon ones too) with disc, line and "Granted by …". | `Inspector.tsx` |
| Overlay key (D7): **hold Alt**. Icons become word chips (added ones reversed); truncated chips show the full text on hover. Chips are placed by measurement: right-aligned, stacked up, each jumping over any overlay marked `data-kw-avoid` (state badges, count, P/T, damage, counters, combat strip); what does not fit becomes "+N" (its title lists them), and on cards with no room at all no chip shows. Listed in the `?` overlay. | `state/overlayKey.ts`, `state/keymap.ts`, `components/wordChipLayout.ts` |
| Mock: printed keywords parsed from oracle text; added ones from attachments, anthems (Avacyn added) and end-of-turn effects (`eotEffects`, with P/T). New cards: Vampire Nighthawk (Ana), Tolarian Terror (Theo), Run Amok on Krenko in `blockers`, and scenario `keywords` (1v1, every icon kind, +N, tapped cards). | `mock/keywords.ts`, `mock/engine.ts`, `mock/scenarios.ts` |

Sizes and choices beyond the spec:
- Disc `max(20px, 1.25rem)`: 20 px at 1080p and 1366×768, grows with larger screens and UI scale. Glyph 0.7 × disc (as the sheet), hit area 24 px, gap 4 px.
- Slots by card width (container queries): 3 from 110 px, 2 from 72 px, 1 below that, none below 3.25rem (52 px at 1080p, 41 px at 768p): no room beside the state badges and the group count. Below 72 px with 2+ keywords the one slot is "+N" (spec gives no rule there).
- Tooltip: max width 20rem (320 px at 1080p), three content rows (name, line, granted); the line wraps instead of truncating (approved lines run to 95 characters).
- Contrast (WCAG): tooltip name 11.6:1, line 7.3:1, granted 5.0:1 on `--c-panel-raised`; disc glyph 16.6:1 either way; inspector line 10.5:1, granted 7.2:1 on `--c-bg`.

Verified (Playwright, 1920×1080 and 1366×768, desktop context): in every scenario and layout, no disc leaves its card or overlaps the P/T box, damage badge, counters, combat strip, state badges or group count; visible icons never exceed the slot rule; hover after 300 ms, focus, Tab order (card, then its icons), Escape, pointer onto the tooltip; tooltips stay on screen; Alt shows word chips and release restores icons; with Alt held no chip covers an overlay, another chip or leaves its slot (48 views); clicking a disc or chip picks the card as a target like a card click; no console errors.

Mock targeting: "Hexproof from <colour>" blocks only opponents' spells of that colour (from the source's mana cost); plain Hexproof blocks all.

Known gaps: at 1366×768 Columns, opponents' creatures are 47 px wide, so one 20 px disc covers a large part of the card (opponents' card size is item 4 of the spec). Committed JPEGs in `fork-web/frontend/docs/screenshots/` were not regenerated (the turn-strip issue changes the same views in parallel).
## Pass 3C: readable opponent cards (issue #22)

Spec: `product-decisions-pass-3.md` section 4.

| Item | Change | Code |
|---|---|---|
| Two tiers | Creature row: creatures, planeswalkers, battles. Support row: other permanents, lands (grouped), the commander in the command zone (two-line caption "Command zone" / "tax +N" over its foot; its host reserves 5.5 rem so the caption stays in the row), at 60 % of the creature size. | `battlefieldGroups.ts` (`inCreatureRow`), `Battlefield.tsx` |
| Adaptive sizing | Largest creature width that fits, cap 11.25 rem (180 px at 1080p; rem follows screen height and UI scale). Fallbacks in order: support 60 → 45 %, creatures wrap (up to 4 lines), staggered overlap at 72 px × UI scale (back cards raised 13 % so their name band shows): the line counts that fit the height with the least overlap (≤ 85 % of a card covered); below 72 px only if even that cannot fit. Widths count group separators (1.5 × gap) and the caption's reserved width. Compact Focus seats (creatures only) have no 72 px floor. | `battlefieldLayout.ts` (`fitBattlefield`, `fitRow`) |
| One-line header | Full and compact plates (not the vertical plate of your seat / 1v1): life, name, zones, commander damage, state tags on one wrapping line. Container queries: < 40 rem hides zone labels and commander names; < 30 rem hides tag text (icon + tooltip stay). The plate's commander thumbnail is gone (support row); compact plates show a crown chip with the tax. | `PlayerPlate.*` |
| Name labels | Board cards narrower than 150 px: 12 px label (`--fs-xs`) over the title bar, drawn on the slot so tapped cards keep it horizontal. State badges move below the label. Display → "Name labels on small cards", on by default. | `Card.*` (`nameLabel` prop), `Battlefield.tsx`, `state/prefs.ts`, `Overlays.tsx` |
| Display | S/M/L card size removed (pref and `?size=` dropped; old stored value deleted on load). Board split (35–55 %, default 45) kept. Columns already default. | `state/prefs.ts`, `MatchContext.tsx`, `Overlays.tsx` |
| Focus compact seat overflow | Compact seats are stacked (header, summary, creatures) instead of a 17 rem side column. No element outside its seat in priority / blockers / stack6 at 1366 and 1920. "Hidden here" counts only what the seat does not draw (`hiddenInCompact`). | `Seat.*` |

Measured creature widths (priority, Columns): 1920×1080 opponents 118–121 px (Mira 107: width-bound, a tapped Krenko plus 3 creatures in 499 px), you 159; 1366×768 opponents 72–79; 2560×1440 opponents 143–163 (Mira 143, same cause), you 212.

## Pass 4: choice tray core and ability menu (issue #30)
Spec: [product-decisions-pass-4.md](product-decisions-pass-4.md) §2.2 and P2 (menu rendering only; clicking a permanent to activate it is #24).

| What | Code |
|---|---|
| Model: `ChoiceOption.playerId / symbol / cost`, `PromptBase.byPlayerId` (seat shape before the title), `ChooseNPrompt.abilityMenu`, `YesNoPrompt.defaultAnswer / cardId`. A reveal / look is a choose-N with `max` 0 (Forge's own reveal is a choice list with nothing to pick); its answer is an empty list. Single-list order: item 0 resolves first. Ability menu: empty answer = cancel (engine's null). | `model/types.ts` |
| Three presentations: tray (choose N, yes/no, order, reveal); one-line bar (title, counter, confirm) when every option is a battlefield card, a card in your hand or a player; ability menu anchored to `sourceCardId` (right of the card, else left, else above/below; follows the card every frame). Number shapes (`distribute`, `input`) render a placeholder: one dispatch line in `TrayBody.tsx` for #31. | `ChoiceTray.tsx`, `tray/*` |
| Choose N: counter "1 chosen · up to 2" / "Choose exactly 1" / "2 chosen · 1–3"; confirm "Confirm (1)", disabled label "Choose 1 more"; card grid, chips for text options (wrap, never truncate), colour symbols with names; > 12 options: filter box (name or type line, results sorted by name), body scrolls; tray max height = your board share. | `tray/trayLogic.ts`, `tray/ChooseN.tsx` |
| In place: options lit (actionable ring), chosen = selected ring + ✓ (cards) / selected ring + "Chosen" tag (plates); other permanents dimmed; non-option clicks do nothing. Bar starts bottom-centre of your board and moves to the corner of your board that covers the fewest options. | `tray/inPlace.ts`, `tray/useInPlacePick.ts`, `Card.tsx`, `battlefieldGroups.ts`, `PlayerPlate.*` |
| Yes/no: engine labels, default primary; Y / N answer, Space = default (the draft is seeded with the default so the main button answers it too). Commander moving zones shows the card at hand size. Reveal / look: cards at hand size with hover preview, OK (Space). Order, one list: column "Resolves first", ↑/↓ per row, Alt+↑/↓ on the focused row (a moved row is scrolled into view; 1.5 rem thumbs so 4 rows fit at 1366×768); two lists: scry layout kept. | `tray/YesNo.tsx`, `tray/Reveal.tsx`, `tray/Order.tsx` |
| Keys: the prompt's keys run in a capture-phase listener in `ChoiceTray` (1–9, V, Y/N, Space, Esc in the menu); `MatchScreen` lost its 1–9 and V branches. `?` overlay lists Y/N and Alt+↑/↓. | `ChoiceTray.tsx`, `MatchScreen.tsx`, `state/keymap.ts` |
| Mock: scenarios 3c–3m (sacrifice in place, choose an opponent, modes, colour, 16-land filter, optional trigger, commander moving zones, trigger order, Mira reveals, look at top 3, Krosan Verge ability menu); Emeria's Call face choice now uses the ability menu (Esc keeps it in hand). | `mock/scenarios.ts`, `mock/engine.ts` (`answerTrayPrompt`) |

Contrast (WCAG): "Chosen" tag 14.1:1 (`--c-text-on-accent` on `--c-selected`); counter / filter placeholder 5.8:1 / 7.2:1.

Known gaps: the main button (`primaryAction`, #24) keeps `confirmLabel` as its label: no "(1)" count and no "Choose 1 more" (enablement and answer match the tray; a test checks every choice scenario). At 1366×768 the hand-size cards of a reveal / look are taller than the tray body, which scrolls.
## Pass 4: manual payment and no hand-holding (issue #24)

Spec: `product-decisions-pass-4.md` §2.1 and P1.

| Item | Change | Code |
|---|---|---|
| No hints (P1) | `CardStatus.playable` and the hand play notch removed: with priority no card is ringed, badged or dimmed. `Decision.priority.playable` stays as data only. Clicking a hand or other-zone card you can't play shows "You can't play X right now." in the prompt line for 3 s (neutral text colour). | `state/cardStatus.ts`, `Card.tsx`, `Hand.tsx`, `ActionPanel.tsx` |
| Prompt copy (P1) | "Mira's Lightning Bolt is on top of the stack. Respond, or let it resolve." / "Your main phase." / "Ana's turn · combat." (other steps: upkeep, draw step, main phase, end step). Targets: "<instruction> for <card>." | `state/primaryAction.ts` |
| Clicks with priority | Card click goes through `useCardClick` (`state/cardClick.ts`): hand/other zone → `play` or the note; your mana source → `tapForMana` (pool), dual → chooser; any other permanent of yours → `activate`; anything else → `MatchContext.activateCard` (targets, combat, choices). | `state/cardClick.ts`, `Card.tsx` |
| Payment mode | `Decision.payMana` (cost, remaining, tax, x, sources with useful colours, autoTaps, autoCanPay, canUndoTap). Action block: floating line, "Pay {cost} for X · includes tax {2}" (paid pips filled + ✓, unpaid outlined, Mana font glyphs), "Click your lands or creatures that add mana.", Cancel (Esc) in the contextual row, main button "Pay automatically" / "Taps: …", Undo becomes "Undo tap (Z)". Sources: sky ring + spark notch; your other permanents dim. Spell goes on the stack when paid. | `Payment.*`, `ManaSymbol.*`, `ActionPanel.*`, `state/cardStatus.ts` |
| Dual lands | Chooser above the card "Add {G} · Add {W}", keys 1–9, Esc / click elsewhere closes. Offers only the kinds that still pay. | `ManaChooser.*`, `MatchScreen.tsx` |
| Pool | `PlayerView.manaPool`. Shown above the prompt only when not empty; ≥ 3 of a kind as "{G}×3"; while paying a symbol that still pays is a button (`spendPool`). Empties at each step change (mock). | `Payment.tsx`, `mock/engine.ts` |
| Auto-pay | Switch under auto-pass, off by default (`GameView.autoPay`, intent `setAutoPay`, not undoable). On: casting pays at once; the log ends "Tapped: Forest, Krosan Verge." | `ActionPanel.tsx`, `MatchContext.tsx` (undo list only) |
| Keys | Space pays automatically, Z undoes the last tap, Esc cancels (sources untap, spent floating mana returns). `?` overlay updated. | `MatchScreen.tsx`, `state/keymap.ts` |
| Mock | Mana abilities parsed from oracle text (`{T}: Add …`, commander identity, Sol Ring {C}{C}). Auto-pay: pool first, coloured symbols from the least flexible source, generic from colourless then single-colour sources. X: an `input` prompt first (`x:<card>`), then payment. Activated abilities: Swiftfoot Boots (Equip {1}, target, sorcery speed), Selfless Spirit (sacrifice). Scenario `payment` (6): Sythis with tax 2 and {G}{G} floating, Green Sun's Zenith (new card) in hand. | `mock/cardRules.ts`, `mock/engine.ts`, `mock/scenarios.ts` |

Contrast (WCAG, on `--c-bg`): unpaid glyphs 8.6–15.7:1 (B lowest); filled pips dark glyph 8.6–15.7:1; ✓ badge 16.6:1; "Floating" text-2 10.5:1, "empties at end of step" text-3 7.2:1; the note uses the existing text colour.

Known gaps: the tray does not draw the `input` shape yet (§2.3), so the X prompt shows the tray's placeholder and its confirm takes the largest X. The engine's "which ability" menu (P2) is #30. Opponents' floating mana is not shown (not in §2.1).

## Pass 4: game start and end (issue #32)
Spec: [product-decisions-pass-4.md](product-decisions-pass-4.md) §2.4 and §2.6.

| What | Code |
|---|---|
| Model: `PlayerView.mulligan` (deciding / kept N / mulligan → N), `PlayerView.out` (turn + `OutReason`, names copied in), `GameView.result` (winner, reason, ranking 1st first, `nextGame`), `YesNoPrompt.keys` (own answer keys), `ChooseNPrompt.progress` ("0 of 1 chosen", plain confirm label), `{player:<id>}` in yes/no labels (seat shape + name). Intents `concede`, `leaveMatch`, `nextGame`. | `model/types.ts`, `model/intents.ts`, `components/PlayerText.tsx` |
| Toss: yes/no "You go first. Play first?", "Play first" / "Let ▲ Mira start". Mulligan: yes/no tray "Opening hand · 7 cards", "Keep 7" (Space) / "Mulligan" (M, no Y/N), "Your first mulligan is free." when the engine says so, "Keep · put 1 on the bottom" after a mulligan that costs a card. Bottoming: in-place choose-N in your hand (existing selected state), "0 of 1 chosen", "Put on bottom". Copy builders for the mock and the adapter. | `state/gameStart.ts`, `tray/YesNo.tsx`, `tray/trayLogic.ts` |
| Opponents' tags: "Deciding…" (hourglass, outline), "Mulligan → 6" (flip icon, outline), "Kept 7" (check, block green). Their words stay on narrow headers (not `.tagText`): 1366 Columns 67/80/47 px in 360 px plates. Life figures reserve 3 digits (`min-width: 3ch`, box no longer shrinks): 40 and 100 measure the same width in every plate. | `PlayerPlate.*` (tags and life only) |
| Opponent out: toast at the top of the board for 5 s ("■ Theo is out: 21 commander damage from Krenko, Mob Boss."), same line in Recent. Columns: the column shrinks away in 250 ms (`--dur-leave`, flex-grow keyframes) and the others widen; Table falls back to Columns below 3 live opponents; Focus drops the seat at once. "next:" already skipped players who lost. Game over: the first two of the ranking (still in the game when it ended) keep their seats and do not leave, so "View the board" shows the final board. | `GameEnd.tsx` (`OutToast`), `useJustOut.ts`, `Board.*`, `state/gameEnd.ts` |
| You out: dialog over your board "You're out: … The game continues.", "Watch the rest" (Esc, focused) / "Back to lobby". Watching: main button "Watching" (eye), no prompt line, Undo / To my turn disabled, Z blocked. | `GameEnd.tsx` (`YouAreOut`), `state/primaryAction.ts`, `ActionPanel.tsx`, `MatchScreen.tsx` |
| Concede: Game menu → "Concede game…" → confirm "Concede this game? You're out; the others keep playing." "Keep playing" focused, "Concede" vermillion (+ close icon). Then as "You are out". | `Overlays.tsx` (`GameMenu`), `GameEnd.tsx` (`ConcedeDialog`) |
| End of game: scrim over the screen, panel 35rem (559 px at 1080p), headline with seat shape, reason, ranked list ("4th ■ Theo, turn 12, 21 commander damage from Krenko"), "Back to lobby" / "Next game" (Enter), "View the board" (Esc). Viewing: top-bar chip "Game over · Back to lobby" in place of the waiting chip; main button "Game over". "Back to lobby": page "Match finished. Forge's lobby is open; you can close this tab." (question 4 fallback). | `GameEnd.tsx`, `TopBar.tsx` |
| No turn before turn 1 or after the game: `GameView.starting` (toss to turn 1) or `result` → `turnPlayerId` undefined. Top bar reads "Game start" (toss) / "Opening hands" (hand icon), or the headline ("● You won", "▲ Mira won", "Draw"); no turn number, no "next:", no lit step, no "Your turn" / "Priority" tag, no active seat. | `state/gameStart.ts` (`turnPlayerId`, `turnHeading`), `TopBar.tsx`, `PhaseTrack.tsx`, `Seat.tsx`, `PlayerPlate.tsx` |
| Keys: game-end views own Enter / Esc in the capture phase; the screen's shortcuts stop while one is open. `?` lists M. | `GameEnd.tsx`, `MatchScreen.tsx`, `state/keymap.ts` |
| Mock: toss, London mulligan (first free, three rotating hands), bottoming, state-based losses after every intent (life ≤ 0, 21 from one commander, 10 poison), a player out leaves with everything they own (their commanders' damage entries drop from the others) only while more than 2 players are in the game, as Forge's `Game.onPlayerLost` (1v1 and the last elimination keep the loser's cards), concede, last player standing wins (ranking: winner, then last out first), next game (same commanders, opening hands). Passing in an opponent's declare-blockers step deals combat damage. Scenarios 7a–7g: `toss`, `mulligan`, `mulligan-bottom`, `player-out`, `you-out`, `game-over`, `game-over-next`. | `mock/gameFlow.ts`, `mock/engine.ts`, `mock/scenariosStartEnd.ts` |

Contrast (WCAG): "Deciding…" text-2 on panel 8.5:1 (7.3:1 on the active plate); "Mulligan → 6" 13.3:1; "Kept 7" 5.4:1; "Concede" 4.8:1 (`--c-text-on-accent` on `--c-attack`); toast 11.6:1; dialog text 13.3:1, ranking detail 8.5:1.

Known gaps: the adapter (#11) must drop commander-damage entries whose commander's owner is out (the mock does it in data; the plate does not filter). "Your hand is empty." wraps one word per line when the hand and the other-zone group are both empty (toss, you out, game over; `Hand.*`, #33). Sideboarding between games (two-list tray) is not mocked. The adapter (#11) must set `GameView.starting` from the toss until turn 1.
## Pass 4: number shapes (issue #31)
Spec: [product-decisions-pass-4.md](product-decisions-pass-4.md) §2.3 (and the X order of §2.1).

| What | Code |
|---|---|
| Model: `DistributePrompt.recipients` are `DistributeRecipient` (`min`: engine minimum; `lethal`: combat, deathtouch and marked damage already counted); `combat: { attackerId, deathtouch, trampleId? }` (the trample recipient is also a row). `InputPrompt.kind` adds `cardName`; `defaultValue`, `constraint`, `cardNames` (`CardNameOption`: name, cost, type line, image). `ChoiceDraft.amounts` holds the distribution; an input's text is `selected[0]`. | `model/types.ts`, `state/ui.ts` |
| Rules (pure, tested): automatic assignment = Forge's default (lethal to each blocker in order, rest to the trample recipient, else to the last blocker); stepper clamps to the row minimum and what is left; the trample row is disabled until every blocker has lethal, and a blocker dropping below lethal returns the trample row's damage to the pool; confirm at 0 left, disabled label "Assign 2 more". Number: whole number in range, disabled "Choose 0–7" / "Enter a number". Name: up to 8 suggestions (name starts with the text, then a word does, then contains it; by name), confirm only on an exact name (case-insensitive, answers the engine's spelling), disabled "Choose a card name". The tray confirm and the main button share these (`trayConfirm`, `answerFromDraft`). | `tray/numberLogic.ts`, `tray/trayLogic.ts`, `state/primaryAction.ts` |
| Distribute / combat damage: "Left to assign: N", one row per recipient (thumbnail or seat shape, name, note, − value +). Notes: "At least 1", "Lethal 2", "Lethal 1 · deathtouch", trample row "Ana (player)" with "Assign lethal damage to every blocker first" and a dashed edge while gated. Rows are as tall as a card thumbnail (seat-shape rows too). First row focused on open; Tab / Shift+Tab move between rows; after the last row Tab goes to the confirm when it is enabled, else wraps to the first row; ↑/↓ ±1, Shift ±5; Space confirms. | `tray/Distribute.tsx` |
| Number: − field + with the range ("0–8"; a typed value past an end disables the button going further out); the field opens on the engine's default, focused and selected; ↑/↓ ±1, Shift ±5, Enter or Space confirms, V peeks. Free text: a field, Enter confirms. | `tray/NumberField.tsx` |
| Name a card: field, constraint under it, suggestions (name, cost pips, type line); the highlighted one (left bar + raised surface) shows its card image beside the list. ↑/↓ move, hover highlights, click or Enter picks, Enter on an exact name confirms, Esc closes the list. The body has a fixed height (the 10 rem preview's), lowered to what the tray body has (`useFitTray`: re-fit on render and on resize of the tray's area, header or footer), so the tray body never scrolls and does not grow when suggestions appear: field, constraint and preview stay in view, only the suggestion list scrolls (highlighted row kept in it). Adventure cards are named by their creature half ("Bonecrusher Giant", `cardDb.frontFace`). | `tray/NameCard.tsx` |
| X before payment: the mock's X prompt carries `defaultValue` (largest affordable X) and a new id per cast; a value out of range keeps the prompt open (the "empty answer takes the largest X" fallback is gone). | `mock/engine.ts` |
| Mock: scenarios 7a–7e (Fiery Justice divides 5 among Krenko, Goblin Chieftain and Mira; Knight of Autumn 6/3 trample blocked by Vampire Nighthawk and Sakura-Tribe Elder; Questing Beast (vigilance, untapped) with deathtouch blocked twice (1v1); X for Green Sun's Zenith; Meddling Mage names a nonland card from the mock card list). New cards Fiery Justice, Meddling Mage. Answers are logged ("Knight of Autumn deals 3 damage to …, 1 to … and 2 to Ana.", "You name Goblin Guide."). | `mock/scenarios.ts`, `mock/engine.ts`, `mock/cardDb.ts` |

Contrast (WCAG): row notes / "(player)" 7.3:1 (`--c-text-2` on `--c-panel-raised`); key hints 5.8:1 (`--c-text-3` on `--c-panel`); range, constraint 8.5:1; type line on the highlighted suggestion 6.2:1; gated value / placeholder 7.2:1 (`--c-text-3` on `--c-bg`).

Verified (Playwright, desktop context, 1920×1080 and 1366×768): 7a–7e tray body never scrolls, nothing leaves the tray; 7e: name body 223 px at 1080p, 152 px at 1366×768 (preview 109×152), re-fits after window resizes; distribute rows all 49 px at 1080p; key flows above; no console errors.

Known gaps: 8 suggestions do not all fit the list (about 7 at 1080p, 5.5 at 1366×768; the 20 px mana pips set the row height), so the list scrolls. No Cancel on the X prompt (Esc does not back out of the cast; not in §2.3). The `?` overlay does not list the distribute / number keys (the tray shows them). Live adapter: `cardNames` would carry every legal name (thousands); a lookup may suit the bridge better.
Known gaps: the tray does not draw the `input` shape yet (§2.3), so the X prompt shows the tray's placeholder and its confirm takes the largest X. The engine's "which ability" menu (P2) is #30. Opponents' floating mana: see pass 4 (#33).

## Pass 4: board and cards, P3–P6 (issue #33)

Spec: `product-decisions-pass-4.md` P3, P4, P5, P6.

| Item | Change | Code |
|---|---|---|
| P3 | Your commander in the command zone shows only in the group beside the hand; opponents' stay at the end of their support row (`commandEntries`). | `battlefieldGroups.ts`, `Battlefield.tsx` |
| P4 | Group beside the hand = your command zone + `PlayerView.otherZoneCasts` (`{cardId, via: flashback/escape/foretell/adventure/other}`), independent of mana and timing. Captions "Command zone · tax +2", "Graveyard · flashback", "Exile · adventure"; `other` shows the zone only. Mock: graveyard cards with flashback, refreshed after every intent. | `model/types.ts`, `otherZoneGroup.ts`, `Hand.tsx`, `mock/engine.ts` (`refreshOtherZoneCasts`) |
| P5 | One chip per source commander (partners: two): crown/burst + owner's seat shape + amount; "Krenko … /21" where the header has room. Hover: "Krenko, Mob Boss (▲ Mira) has dealt Theo 3 commander damage. 21 eliminates." Burst from 15. The shape is the commander's owner. | `commanderChips.ts`, `seatChar.ts`, `PlayerPlate.tsx` |
| P6 Recent | Divider above each turn's entries ("▲ Mira's turn 10"; "Turn 8" when `LogEntry.turnPlayerId` is absent). `LogEntry.youLost: 'life' \| 'permanent'` → bold line. Mock stamps both (life lost: Bolt, Bombardment, combat; permanent: destroy, exile, sacrifice). | `recentRows.ts`, `Rail.*`, `mock/engine.ts`, `mock/builder.ts` |
| P6 plates | Life change "▼−3" / "▲+4" for 4 s in the "life" label's slot (sized for "▼−12", so the header never moves); changes within the 4 s add up; reset on scenario switch. Tokens `--c-life-loss` / `--c-life-gain`. | `lifeMarker.ts`, `PlayerPlate.*`, `styles/tokens.css` |
| Floating mana | An opponent's pool on their header only while not empty: mana icon + "Floating" (the word hides in narrow headers) + {R}{R}, "{G}×3" from three of a colour (pass-3 §2). Its own header item, beside the name and tags, so a large pool adds at most the header's second line. | `poolGroups.ts`, `PlayerPlate.*` |
| P5 names | Opponents' chips show the commander name ("Krenko 16/21") whenever it adds no line to the header, measured per render and resize (`data-cmd-names`); your inline plate keeps the 40rem rule. | `useRoomForNames.ts`, `PlayerPlate.*` |
| Log mana | `{R}`, `{2}`, `{X}` in log text draw as mana symbols, sized so the line keeps its height ("Mira adds {R}{R}."). | `logParts.ts`, `LogText.*` |
| Fix | Plate class list no longer contains a literal `undefined` (`styles[density]` had no `full` class). | `PlayerPlate.tsx` |
| Mock | Scenario `board` (5e): Mira's turn 10, her Bolt at you on the stack (Space: you take 3, plate shows ▼−3), every land of yours tapped (Sythis and Moment's Peace still beside the hand), Theo at 16 from Krenko (burst), Mira {R}{R} floating, Recent across turns 8–10 with bold lines. | `mock/scenarios.ts` |

Contrast (WCAG): loss text on `--c-bg` 8.9:1, gain 9.6:1; divider text (`--c-text-3` on `--c-panel`) 5.8:1; bold lines `--c-text` on `--c-panel` 13.3:1.

Known gaps: no partner pair in the mock card DB (two chips per partner are unit-tested only). The live adapter (#11) does not fill `otherZoneCasts`, `turnPlayerId` or `youLost` yet: without them the group shows only the command zone, dividers read "Turn N" and no line is bold.

## Playtest 1 UX fixes (issue #49)
Rulings: [match-screen-decisions.md](match-screen-decisions.md), "Rulings from playtest 1".

| What | Code |
|---|---|
| Hover preview in one fixed place: over the rail's regions, bottom-aligned on the action block's top, so it never covers the board, seats, hand, choice tray or action block. Image as wide as the rail (height capped by the regions' height minus 5 rem for the notes, which stack above it). Image rect, mock, same for every hovered card (hand, board left/right, rail, command chip): 1920×1080 [1641,463,1912,841], 1366×768 [1148,285,1360,580], 2560×1440 [2188,619,2549,1123]; Columns, Table and Focus identical. It moves only with the action block's height (payment: 1920 [1641,328,1912,706], 1366 [1148,178,1360,473]). A card hovered inside the rail (stack, zone, Recent) or the log drawer (`data-preview-beside`) gets the same box moved left of the rail, or of the drawer while it is open, so the hovered card is never covered (`previewSpot.ts`, `UiState.hover.beside`): mock priority 1920 [1355,463,1625,841], 1366 [924,285,1136,580]; drawer open, replay commander4 1920 [1227,524,1497,902] (drawer left 1504), 1366 [824,332,1036,628] (drawer left 1041). | `HoverPreview.*`, `previewSpot.ts`, `Rail.*`, `Overlays.tsx`, `Card.tsx`, `LogText.tsx`, `state/ui.ts` |
| Opponents' commanders in the command zone: not on their board (`battlefieldRows`); a chip in the header's zone chips (crown, "Commander" where the header has room, "+N" tax). Hover/focus: the card in the hover preview; click or right-click: inspector. Title "Talrand, Sky Summoner is in Theo's command zone. Commander tax +4." | `battlefieldGroups.ts`, `commandZone.ts`, `PlayerPlate.*`, `Battlefield.*` |
| Step names: CR names on the strip ("Upkeep step" … "First main phase" … "End step"), captions "Beginning phase" / "Combat phase" / "Ending phase". Fit ladder: tool words drop, then short names (last word dropped: "Declare attackers"), then combat folds. Full name always first in the hover text. "Next stop: Theo's declare attackers step". Measured (mock `priority`, all three layouts): 1920 and 1600 full names with tool words; 1366 and 1280 short names without tool words. | `model/phases.ts`, `state/turnStrip.ts` (`fitLevel` 0–3), `PhaseTrack.*`, `TopBar.tsx`, `state/stops.ts` |
| Coin toss: "You won the coin toss. Who plays first?" (later games: "You lost the last game. …"). 3+ players: player list, no counter, plain "Confirm" (`ChooseNPrompt.quiet`). 2 players: "Play first" / "Let ▲ X start". Mock toss uses the same title. | `state/gameStart.ts` (`tossTitle`), `adapter/prompts.ts` (`tossChooser`), `adapter/toView.ts`, `tray/trayLogic.ts` |
| No prompt when nothing to decide: a London input that asks for 0 cards at its first message (`InputState.london`) reads "Drawing your new hand" (waiting) and is answered with OK once (`autoAnswer`). A paid one also reads "Return 0", nothing chosen, as it ends (`InputLondonMulligan.done`), and is never answered. | `adapter/session.ts` (`london`), `adapter/prompts.ts` (`freeMulliganKeep`), `adapter/commands.ts`, `adapter/useLive.ts` |
| Rail floors (no % cap): stack 14 rem, combat 11 rem, zone 14.5 rem (one full row of thumbs), Recent 12 rem. Stack + zone + Recent fit at 768 px; with combat too, the regions scroll. | `Rail.module.css`, `CombatPanel.module.css` |
| Large zone view: expand button in the rail's zone header → graveyard/exile over the board (cards `clamp(7.5rem, 11vw, 11rem)`), filter by name or type ("1 of 3"), "Side panel" back, × or Esc closes. Below the hover preview's layer. | `ZoneBrowser.*`, `zoneBrowser.ts`, `Rail.tsx`, `Icon.tsx` (`expand`, `shrink`) |
| Music and sounds (launcher): see `fork-desktop-web/CLAUDE.md`. | `WebMatchAudio.java`, `WebSeats.setEventSink` |

Contrast (WCAG, existing pairs): chip and browser title `--c-text` on `--c-panel` 13.3:1; counts `--c-text-2` on `--c-panel` 8.5:1; empty text 5.8:1; filter placeholder `--c-text-3` on `--c-bg` 7.2:1; hovered buttons `--c-text` on `--c-panel-hover` 9.7:1.

Screenshots regenerated (1920×1080, mock): `1920-01-priority-columns`, `1920-02-priority-table`, `1920-03-priority-focus`, `1920-05-blockers-columns`, `1920-08-choice-scry`, `1920-11-duel`. Not regenerated: `1920-14-hand-12`, `1920-17-inspector-dfc` (no matching mock scenario), `cb-deuteranopia-05-blockers-columns` (simulated render).

Known gaps: live, long AI names in the turn block push the strip to short names at 1920. The large zone view covers an open choice tray. While a board or hand card is hovered, the preview covers the lower rail regions (Recent, an open zone, lower stack items at 1366); while a rail or drawer card is hovered, it covers the board's right edge beside the rail or drawer.

## Stack items as targets (issues #53 part 2, #45)
| What | Code |
|---|---|
| A targeting input that accepts stack items (`setSelectableTargets` with `stackItem` refs: `InputSelectStackItems`, e.g. Counterspell, Stifle) makes them legal targets (`TargetRef` kind `stackItem`). Only while it is open: the item gets the legal-card ring (dashed `--c-actionable`, `--outline-w`), a "Target this" button (target icon) and a clickable thumb; once chosen, the selected ring (`--c-selected`) and "Target chosen" (check icon). Click → `selectStackItem`. The stack hint reads "Choose a target: click a lit spell or ability." Stack-item picks stay on the board even with no spell naming the input (reconnect): no tray, Cancel kept, no max needed (`InputSelectStackItems` sends none). Stack rows list a stack item's own stack targets (`TargetStackItems`). A stack item targeted by the spotlight item gets no arrow (its row is often clipped by the stack scroll region); its row gets the targeted-card shapes instead, dotted `--c-targeted` ring (`--outline-w`) for the top item, solid while the targeting item is hovered, plus a "Targeted by <name>" tag (target icon). | `model/types.ts`, `adapter/toView.ts`, `adapter/prompts.ts`, `adapter/commands.ts`, `Rail.*`, `Arrows.tsx`, `arrowGeometry.ts`, `state/cardStatus.ts`, `state/primaryAction.ts` |

Measured, live (Stifle on an Aether Vial trigger; Counterspell on Gauntlet of Might): stack panel 1920×1080 no overflow (item 237/237 px), 1366×768 (item 184/184 px), button 92×19 / 72×15 px. Contrast (WCAG): button text `--c-text-on-accent` on `--c-actionable` 8.1:1, on `--c-selected` 14.1:1; ring `--c-actionable` on `--c-panel-raised` 5.6:1, `--c-selected` 9.8:1.

Targeted stack row, live 1920×1080 (Counterspell over Vendilion Clique): 0 arrow lines; row ring dotted `rgb(204,121,167)` 3px, solid on hover; 1366×768: row 184/184 px, tag 121 px wide (2 lines, inside the row). Contrast (WCAG): tag `--c-text-on-accent` on `--c-targeted` 6.1:1; ring `--c-targeted` on `--c-panel-raised` 4.2:1.

## Combat forecast, own face-down cards, pick wording (issues #79, #80, #81)
| What | Code |
|---|---|
| Block button detail from every attack on you (`combat.attacks`), not only the attackers you may block: unblocked = power, ×2 with double strike; blocked = 0, or with trample a range up to power − blockers' lethal damage (deathtouch: 1 per blocker); infect as poison, toxic N as N poison per hit; an attack on your planeswalker/battle named apart ("You take 8 damage · Chandra, Torch of Defiance takes 2 damage"; no "You take" line when only it is attacked). Attack detail: "N damage if unblocked" (double strike ×2). Combat panel's "Unblocked: N damage" counts double strike. | `state/combatForecast.ts`, `state/primaryAction.ts`, `CombatPanel.tsx` |
| A face-down card you may look at (`Original` state sent to you: foretold, your morph/manifest, exiled face down you may see): `name`/`front` = its real face, `back` = the face-down face in play, `faceDown.seen`. Drawn with its front (`shownFace`), eye badge "Foretold: only you can look at it" / "Face down: …", same note in the hover preview, inspector's second face "Face down". Characteristics stay the face-down face's; in exile it has no P/T. Foretold → `otherZoneCasts` via `foretell`. | `adapter/toView.ts`, `model/selectors.ts`, `Card.tsx`, `HoverPreview.tsx`, `Inspector.tsx` |
| Picks for a cost or an effect (`purpose: 'pick'`, from the bridge's `input`): button "Discard (1)" / "Sacrifice (1)" / "Choose (1)" (verb from the engine's message), "<verb> N more" while short, "Discard none" when 0 is allowed; detail adds "up to N"; prompt line "<source>: <engine message>."; no target ring/icon, source not marked chosen; Cancel only when the engine allows it, and an unless cost's Cancel reads "Decline: <what happens>" (ellipsis, full text on hover). Targets: "Cast X" (spell), "Activate X" (activated), "Confirm targets" (triggered). | `adapter/session.ts`, `adapter/toView.ts`, `state/primaryAction.ts`, `state/cardStatus.ts`, `PlayerPlate.tsx`, `ActionPanel.*` |

Live (1920×1080, human seat, test decks): 4 Grizzly Bears (no legal blocker) + Suntail Hawk at you, Cloud Sprite blocking the Hawk: "Block with 1 · You take 8 damage", took 8 (6 → −2); Fencing Ace (double strike) + Elite Vanguard: "Attack with 2 · 4 damage if unblocked", dealt 4. Foretold Iron Verdict / Ravenform: named with front art and eye badge in your hand row, cast prompt and payment name it; spectator stream: 0 matches of the name over 483 frames.

## Board information (issue #29, QA playtests 1 and 2)
| What | Code |
|---|---|
| Command-zone objects that are state, not cards to cast (the Monarch, emblems, engine effect cards like "Stomp's Effect" / "On an Adventure", dungeons, planes): `PlayerView.effects` (`GamePieceType` EFFECT/DUNGEON/PLANAR/SCHEME/AVATAR or `IsEmblem`); `command` keeps only castable cards (commanders, a companion), so they leave the group beside the hand and no longer show as "Commander" chips on opponents. Shown as chips in the owner's plate (ringed-spark icon + name, identical names grouped "×2"); hover = the card in the hover preview, click / right-click = inspector. **Placement is a proposal for the owner to judge.** | `adapter/toView.ts` (`EFFECT_PIECES`), `PlayerPlate.tsx`, `StatusChips.tsx`, `statusChips.ts`, `Icon.tsx` (`effect`, `aura`) |
| A card attached to a player (Curse of Bounty): `PlayerView.attachments` from the player's `AttachedCards`; chip "aura" icon + name on the enchanted player's plate. The card stays on its controller's battlefield. | same |
| Imprint / exiled with / until-leaves / haunt / cipher: `CardView.links` from `ImprintedCards`, `ExiledCards`, `UntilLeavesBattlefield`, `ExiledWith`, `HauntedBy`, `Haunting`, `EncodedCards` (what Forge's own card detail lists); only cards in the viewer's `cards` (hidden ones arrive as unseen ids and are dropped; `Remembered` is never sent). Marker: exile-icon badge on the card (title lists them); hover preview note "Imprinted: X"; inspector section with thumbnails. | `adapter/toView.ts` (`cardLinks`, `linkCards`), `cardLinks.ts`, `Card.tsx`, `HoverPreview.tsx`, `Inspector.tsx` |
| Summoning-sick badge: the engine's `Sickness` is "came under control this turn"; `Card.hasSickness()` also lets Haste through, the view doesn't: haste creatures no longer show it. (`can attack as though it had haste` effects aren't in the view.) | `adapter/toView.ts` (`mapCard`) |
| P/T breakdown: the engine view carries the net P/T only (no printed P/T, no per-source modifiers or keyword sources; filling them needs an upstream `CardView` change), so live `ptModifiers` is absent and the inspector shows "Now" alone instead of a false "Printed" row. Mock keeps its breakdown. Keyword `grantedBy` stays mock-only. | `model/types.ts`, `Inspector.tsx`, `HoverPreview.tsx` |
| Stack item targets include those of its sub-abilities (`SubInstance` chain): a modal ability's chosen mode is a sub-ability, so its target lights up and gets its arrow. | `adapter/toView.ts` (`stackTargets`) |
| Hand reveal title: Forge's "Looking at cards in X's hand" is kept only when the whole hand is shown; otherwise "Revealed: <card>" / "Revealed: N cards", "From X's hand." | `adapter/revealWords.ts` |

Live (1920×1080, human seat, test decks vs an Islands-only AI): Goblin Guide (haste) `summoningSick` false, Thorn of the Black Rose (no haste) true, badge only on Thorn; Thorn's trigger → "The Monarch" chip in your plate (111×23 px, plate 216 px wide, no horizontal overflow), your command group beside the hand empty; Curse of Bounty cast on the AI → chip on the AI's plate while the card stays on your battlefield, and a second one on yourself → chip on your plate; Mimic Vat after Lightning Bolt on your own Goblin Guide → `links: [imprinted: Goblin Guide]` ("exiled with this" is dropped when the card is imprinted), exile badge on the Vat, hover note "Imprinted: Goblin Guide", the Guide in exile `exiledWith` the Vat. Per-viewer: `BoardInfoVisibilityTest` (opponent seat and spectator streams: a hidden hand card and a face-down exiled card in `ImprintedCards` / `ExiledCards` arrive as ids that name no object, no name in the frames, `Remembered` never sent; Monarch effect card, aura on a player and a stack item's `SubInstance` reach every viewer).
## Choice tray polish (issue #29, packet B)
| What | Code |
|---|---|
| Colour lists: mana symbol + normal case ("{W} White"); only when every option is a colour name. Surveil: "Surveil N", lists "Keep on top" / "Graveyard", move buttons "To top" / "To graveyard" (`moveTo`; other two-list prompts: "To <list label>"). | `adapter/trayWords.ts`, `adapter/prompts.ts`, `tray/Order.tsx` |
| Identical cards in a tray of cards (library search): one tile "Swamp ×14", "2 of 14 chosen"; click or digit key = one more (at the maximum or with all chosen: one fewer), "−" button one fewer; the answer still lists option ids. | `tray/trayLogic.ts` (`groupOptions`, `stepGroup`), `tray/ChooseN.tsx` |
| Board cards: a selected card or group says "selected" in its accessible name; a selected group's count chip shows ✓ in `--c-selected`. | `Card.tsx`, `Card.module.css` |
| X: "Choose X for …" asked as a list (0 … 9, Other…) is the number field ("0 or more" with "Other…"); a number past the list answers "Other…" and the engine's follow-up prompt is typed for you; Cancel / Esc answers nothing (the engine cancels the spell). The payment shows "X = n" (the X announced for that card) and "Equip {2}" (activated ability, from the bridge's `payFor`). | `adapter/trayWords.ts`, `adapter/commands.ts`, `adapter/session.ts`, `adapter/toView.ts`, `Payment.tsx` |
| Mulligan copy: "…shuffle and draw 7 new ones, then put N on the bottom" (hand shown is already bottomed). | `adapter/prompts.ts` (`mulliganFacts`), `state/gameStart.ts` |
## Focus ring and round counter (issue #29, U8)
| What | Code |
|---|---|
| Keyboard focus: white 6 px double ring (`--focus-ring`), never a state colour or line style. Cards: inside the card edge over the frame; plates: outside the state outline; other controls: 2 px outside. | `styles/tokens.css`, `styles/global.css`, `Card.module.css`, `PlayerPlate.module.css` |
| Top bar "Round 7 · Turn 26" (FR "Tour de table 7 · Tour 26"): bridge `round` (`RoundCounter`); mock: turn ÷ players, rounded up. | `state/gameStart.ts` (`turnNumberText`), `TopBar.tsx`, `adapter/session.ts`, `mock/engine.ts` |
## Choice tray compact list (issue #140)
| What | Code |
|---|---|
| Tiles that cannot fit even at 4 rem become a list (name, key hint, chosen state; piles: index, name, ↑ / move / ↓); hover shows the card preview. Decided once per prompt; mock scenarios `long-title`, `surveil`, `scry`, `tutor-groups` at 1280x720 / 1366x700, `look-many` for the reveal rule. | `tray/tileFit.ts` (`settleFit`, `tileKind`), `tray/CompactList.tsx`, `useCardHover.ts`, `ChoiceTray.module.css` (`.compactList`) |

## Hover preview size (issue #172)
| What | Code |
|---|---|
| Preview over the board at every height, above the hand, flush with the rail or log drawer side. The same image rect for every hovered card (the hovered card may be covered, as on 2026-10-16): mock, columns layout, no prompt: 1920x1080 [1138,123 486x679], 2560x1440 [1519,165 647x904], 1366x768 [796,97 339x473], 1280x720 [736,97 313x437]; image bottom 6-11 px above the hand; never under 271x378. The box is the image alone: the notes block hangs out of the flow and never moves or resizes the image: above it when every row fits there, else beside it (left, then right) at the image's top, so no note row is cut (heavy card: tapped, 3 counter kinds, 3 attachments; combat-damage 1366x768 fr: notes [683,97 175x187] left of the image). Only the open prompt moves or narrows it, and inside one prompt state it is still one rect: `scry` 1366x768 [817,97 318x444], 1280x720 [773,97 276x385]; `combat-damage` 1920x1080 [1222,124 402x561]; a hovered stack item that lights targets under the spot sends it to the far side (stack6 1920x1080 [8,123 486x679]) or narrows it (table layout). Supersedes the in-rail rects of the "Hover preview in one fixed place" row above, and `hover.beside` / the beside spot (removed). | `HoverPreview.*`, `previewPlacement.ts` (`overBoardWidth`, `placePreview`, `fitPreview`, `layoutNotes`, `layoutPreview`), `previewSpot.ts` (attribute only), `Hand.tsx` (`data-hand`) |
