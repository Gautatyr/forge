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

Known gaps: at 1366×768 Columns, opponents' creatures are 47 px wide, so one 20 px disc covers a large part of the card (opponents' card size is item 4 of the spec). Committed JPEGs in `forge-gui-web/frontend/docs/screenshots/` were not regenerated (the turn-strip issue changes the same views in parallel).
