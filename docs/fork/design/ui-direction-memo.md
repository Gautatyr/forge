# UI direction memo: UX and style (2026-10-22)

Product review of the web match screen, asked by the owner: "analyse the ui and see if we could improve it on 2 sides, the UX aka the functional side, and on the aesthetic side, maybe get a bit fancy on the style and effects". This is a memo for discussion, not a set of rulings: every item marked "ruling" waits for the owner.

**What it rests on:** the mock (`develop` faa8eec6d36) at 1920×1080 and 1366×768, and one live 4-player Commander game (seat 0 against 3 AI precons, about 26 turns), with a scripted player measuring how often the game stops for you. Screenshots: `.playwright-mcp/aa03-*.jpg` (git-ignored, local only). Items already in #29 (QA playtests 1 and 2, Block UX) and the polish batch in progress (packets A, B, C, E) are left out unless a proposal builds on them.

**Confidence:** high on the UX findings, which were measured in a live game. Medium on the style directions, which are a matter of taste.

## 1. Summary

| # | Change | Side | Effort | Ruling? |
|---|---|---|---|---|
| 1 | **Stop settings built for 4 players.** Measured: 61 presses of the main button over turns 15–25 (about 2.75 rounds), 31 of them on steps with an empty stack during opponents' turns. | UX | S (new defaults), M (stops that depend on being attacked) | **Yes** (touches D4) |
| 2 | **Motion that shows what happened:** cards visibly move between zones (draw, cast, resolve, dies → graveyard), tap and untap animate, and life totals count up or down. Today a creature killed during the AI turns simply disappears. | Both | M | Yes (how fancy) |
| 3 | **A spotlight when an opponent casts; the stack moves to the centre when it holds 3 or more items.** The side panel shows only about 2.5 stack items at 1080p. | Both | M | Light |
| 4 | **Clear combat in multiplayer:** arrows from each attacker to the player it attacks, an "incoming attack" lane on your side when you're attacked, damage numbers. | Both | M–L | Yes (the lane) |
| 5 | **A visual direction: "Commander tabletop"**, each seat on a playmat made from its commander's art. | Style | M | **Yes** (pick A, B or C) |
| 6 | **A card stage for admiring cards:** a bigger inspector; the opening hand shown large at the start. | Both | S–M | Light |
| 7 | **A real end-of-game moment:** winner's commander art, per-player stats, life-over-time chart, then Rematch or Lobby. | Both | M | Yes (Rematch) |
| 8 | **Small fixes:** Space never confirms a destructive default, the focus ring no longer looks like "chosen", a round counter. | UX | S | Settleable |

## 2. UX and function (ranked)

### U1. Passing priority is the main cost of a Commander game
- **Problem:**
  - Quiet round (turns 2–5): **11 presses**, 2 on my turn and 3 per opponent (Beginning of combat, Declare attackers, End step), even when nobody attacked.
  - Mid-game (turns 15–25): **61 presses**:
    - 31 stops on opponents' steps with an empty stack;
    - 25 "Resolve" presses for opponents' spells and triggers, 8 of them in one Lifecrafter's Bestiary / Pouncing Shoreshark turn;
    - 4 on my own turns, and 1 OK.
  - Casting your own spell also needs an extra Resolve press.
  - Cause: the default stops on opponents' turns, `['beginCombat','declareAttackers','declareBlockers','end']` (`fork-web/frontend/src/state/prefs.ts`). These are Forge's 1v1 defaults, multiplied by 3 opponents.
- **Proposal** (keeps D4: auto-pass and auto-yield stay off; this only changes stop settings):
  - (a) Default stops for 3 or more players, on opponents' turns:
    - **Declare attackers**, only when you or your planeswalkers are attacked;
    - **Declare blockers**, only when you're in the combat;
    - **End step**, only on the turn of the player just before you.
  - Beginning of combat stays one click away in the Stops panel.
  - (b) Optional: pass after casting your own spell (Arena's convention), with a "hold priority" key. Ruling: it is close to auto-pass.
- **Expected effect:** about 31 → about 8 step stops per 9 opponent turns (an estimate, not measured). The stack stops stay.
- **Effort:** S for (a) as plain new defaults; M for stops that depend on being attacked (a check in the bridge).
- **Risk:** missing the "before attacks" window. Mitigation: the button's existing "Next stop: …" text and the Stops editor.

### U2. You can't see what just happened
- **Problem:**
  - A creature vanished during an AI turn (Shriekmaw on Dragonlord's Servant); the only trace was a log line.
  - The UI has 3 animations in total: a column leaving, the life-change chip, and the preview fading in.
  - The AIs act in bursts.
- **Proposal:**
  - A motion layer that compares successive game states. Cards keep the same id across zones in `GameView.cards`, so zone moves can be animated.
  - Bursts are queued and compressed, and never block input (see the motion system below).
  - Cards changed since your last decision get a small "new" corner tick, which goes away when you act. This is information, not a hint.
- **Effort:** M. **Risk:** animations lagging behind an AI burst. Mitigation: a cap on total animation time per burst.

### U3. Opponents' boards are hard to read
- **Problem:**
  - `board` scenario at 1920: opponents' creatures **92–109 px** wide, lands 48–55 px. Pass 3 targeted 118–125 px.
  - At 1366, live: lands about 35 px, creatures about 70 px.
  - Early game, each column is mostly empty space.
- **Proposal:**
  - Retune the fill rule: the creature row comes first, and lands get at least 60 px.
  - Hovering an opponent's header, or keys 1–3, temporarily widens that column to about 60%. Contextual; nothing is hidden.
- **Effort:** M. **Risk:** layout jitter. Mitigation: open on a short delay, never while a prompt is open.

### U4. Combat reads poorly across the table
- **Problem:**
  - Attackers stay in the attacker's column, about 600 px from your blockers. Who they attack shows only as small name labels.
  - Combat between two AIs is visible only in the log.
- **Proposal:**
  - Curved arrows from each attacker to the attacked player's header, with a sword glyph and a dash pattern (never colour alone).
  - When you're attacked, ghost copies of the attackers line up in a lane at the top of your board, so you click or drag blockers over a short distance. Blocks in either order still work (D5).
  - Damage numbers on creatures and headers.
- **Effort:** M–L, after the combat batch (packet E). **Risk:** two copies of the same card. Mitigation: the ghost copy is dimmed and labelled "Attacking you".

### U5. The stack and casting give little feedback
- **Problem:**
  - `stack6` shows about 2.5 items in the side panel; the rest scrolls.
  - During payment and targeting, the card you're casting leaves your hand and is shown nowhere.
- **Proposal:**
  - With 3 or more items, the stack fans out over the centre of the board in a layer that doesn't block you and folds back with V.
  - An opponent's cast is shown large for about 1 s, without blocking.
  - While you pay or pick targets, your card sits in a dashed "Casting…" slot on top of the stack. Esc sends it back to your hand.
- **Effort:** M. **Risk:** covering the board. Mitigation: the existing peek control (V).

### U6. Admiring cards
- **Problem:**
  - The hover preview is 271×378 px and covers Recent (also QA pass 2 note 13).
  - The inspector card is 352×491 px in a half-screen drawer that is mostly empty.
  - The mulligan shows the 7 cards at hand size over an empty board.
- **Proposal:**
  - The inspector becomes a "card stage": the card at about 70% of the screen height (about 540×755 at 1080), rules text beside it, and an "art" toggle.
  - The opening hand is shown large in the centre.
  - The 4 commanders are introduced briefly as portraits.
- **Effort:** S–M.

### U7. End of game is flat
- **Problem:** the result panel is a ranked list and two buttons; no stats, no rematch.
- **Proposal:**
  - The winner's commander art full-bleed behind the panel.
  - Per player: damage dealt, commander damage, spells cast, turns survived.
  - A life-over-time chart built from the life history kept on the client.
  - "Rematch", if the lobby can start the same match again, plus "Lobby".
- **Effort:** M.

### U8. Small items (settleable)
- **Space default:** "Cancel Search? Up to 1 more card(s) can be selected" has **Yes** as the Space default, so spamming Space throws away the search. Rule: Space never confirms a cancel, decline or skip.
- **Focus ring:** it uses `--c-selected` (`fork-web/frontend/src/styles/global.css`), so a focused commander looks "chosen". It needs its own token with a double-ring shape.
- **Round counter:** "Turn 26" means round 7. Show "Round 7 · Turn 26".
- **Not verified:** whether `make play` shows the lobby names; the dev bridge shows "AI 1 (Feline Ferocity [C17] [2017])" in headers and the top bar.

## 3. Visual direction

### Common to all three
- The Okabe–Ito state colours stay, and every state keeps its icon or shape.
- Body text stays Atkinson Hyperlegible.
- Each direction is only a token set plus surface CSS.
- Contrast (WCAG): text-3 on panel is 5.6–6.0:1 in every direction (today 5.79); the state text colours stay at 7.1–12.6:1.

### A. "Commander tabletop" (recommended)
- **Palette:** warm walnut-charcoal: `--c-bg #12100e`, `--c-table #1b1714`, `--c-panel #231e1a`, `--c-line #3d342d`. Text `#f3ede4`, `#cbbfb0`, `#a89a89`. Brass `#c9a45c` for rims only. Brass against priority orange measures **1.04:1**, so brass never sits next to priority and never means a state.
- **Type:** a soft serif display font, e.g. Fraunces (open licence), for names, life totals and banners; tabular figures for life.
- **Surfaces:**
  - Each seat sits on a playmat made from its commander's art: blurred, darkened to 15–20% lightness, with a vignette. Seats also become easier to tell apart, without relying on colour.
  - A light felt grain from one small texture tile.
  - One light source, so all shadows fall the same way.
- **Cards:**
  - A lift with a soft shadow on hover; a ±4° tilt on hover only for cards in hand or on the stage.
  - Tapping rotates the card over 180 ms with a slight settle.
  - Foil sheen on hover, showy level only.

### B. "Arcane sanctum"
- **Palette:** deep ink `#0b0d1a`, `#11142a`, `#181c38`; gilt `#c8a96a` (7.4:1 on the panel).
- **Type:** Cinzel (open licence) for headings only. It is all-caps, so French gets about 10% longer.
- **Surfaces:** filigree frames, rune-like mana glows.
- **Effects:** colour particles per spell, matching its mana; spell colour never carries meaning.
- **Risks:** competes with the card frames and art, which are already fantasy; the heaviest for performance.

### C. "Clean broadcast"
- **Palette:** graphite `#0e0f11`, `#15171a`, `#1c1f23`, with white plus the priority colour only.
- **Look:** sharp frosted-glass panels.
- **Feel:** data first: a feed of key events (who killed what), big number pops, fast 120–200 ms snaps, no particles.
- **Trade-off:** the closest to today and the cheapest, but the least "fancy".

### Motion system (shared by all directions)
| Moment | Subtle | Medium (default) | Showy |
|---|---|---|---|
| Draw | slides into the hand | card flies from the library chip | flips from its back |
| Cast / land | slides to the stack or battlefield | lift, then a short flight with a settle | a rim pulse in the direction's accent |
| Opponent cast | slides into the stack | 1 s spotlight near the stack | spotlight plus a seat banner |
| Tap / untap | rotates over 180 ms | plus a staggered untap step | — |
| Attack / block | the card nudges toward its target | arrows flow toward the defender | sword trail; blockers slide toward attackers |
| Damage | −N chip with ▼ | number pop, 2 px shake on the hit card or header | a dying creature crumbles and flies to the graveyard chip |
| Stack resolves | the item fades out | pops, then flies to where it goes; a countered spell cracks | — |
| Targeting | dashed curve | animated dashes flowing toward the target, arrowhead | — |
| Life | the number counts up or down | plus the ▼/▲ chip (exists) | a bigger pop for 5 or more |
| Turn / step | the step pill slides along the strip | a "Theo's turn" banner, about 900 ms, not blocking | a bigger "Your turn" moment |
| Game over | panel | commander art plus stats | confetti, only if you won |
| Ambient | none | a very slow light drift on the playmats | — |

- **Sound hooks:** Forge plays sounds on its side from game events (`fork-desktop-web/src/main/java/forge/fork/desktop/WebMatchAudio.java`). Animations start on the same state change so sound and motion line up. Moving playback into the browser can wait.
- **Performance:**
  - Animate only movement, scaling and opacity.
  - Card flights are computed from the card's position before and after a change, keyed on the card id.
  - At most 6 flights at once. An AI burst is compressed to at most 1.5 s in total, then skips to the end state.
  - Arrows are measured after render (`docs/fork/design/mockup-notes.md`), so they must follow moving cards.
  - No full-screen blur. The texture is one tile under 20 KB.
- **Reduced motion:**
  - Today `global.css` sets every animation to 0 ms, which hides the damage pops too.
  - Replace that with a Display setting, "Motion: Full / Reduced / Off", defaulting to the operating system's choice.
  - Reduced keeps the information as static chips and banners, and uses cross-fades instead of flights.
  - No flashing more than 3 times per second.

**Recommendation: A at "medium".** It serves "admire the cards" (the art becomes the table), Commander is a social format played in paper, and it evolves the current "night table" tokens (`tokens.css`) rather than replacing them. B fights the card art; C under-delivers on "fancy". C's event feed is worth borrowing into A's Recent panel.

## 4. Open questions for the owner (with the PO's recommendation)

1. **Stops for 3 or more players (U1a):** should attack and end-step stops depend on whether you're involved? **Yes.** It is a stop setting, not auto-pass, and can be undone in the Stops panel.
2. **Pass after casting your own spell (U1b):** **a toggle, off**, consistent with D4; offered in the Stops panel.
3. **Style direction:** A, B or C? **A**, decided after seeing the 3 skin prototypes in the mock (packet 2).
4. **How fancy:** **medium by default**, with Subtle/Medium/Showy and Reduced/Off in Display.
5. **Incoming-attack lane (U4):** ghost copies on your side, or arrows only? **The lane**, only when you're attacked.
6. **Commander-art playmats:** these need an art crop, and Forge has none that is reliable (memo D11). **Scryfall's art crop when online**, otherwise a CSS crop of the full card image.
7. **Rematch on the end screen:** worth a lobby round trip? **Yes**, if the launcher can start the same match again.
8. **"Changed since your last decision" tick (U2):** information or hand-holding? **Information.** It marks no choice.

## 5. Implementation split (ordered, with file ownership in mind)

1. **Quick wins (S):** Space-default safety (tray logic); focus-ring token (`tokens.css`, `global.css`); round counter (`TopBar`); new default stops for 3 or more players (`state/prefs.ts`, `state/stops.ts`).
2. **Style prototype (M):** A, B and C as token sets behind `?skin=` in the mock; one scripted "motion demo" scenario (`src/mock/`) so the owner can compare live; no component logic changes. Feeds questions 3 and 4.
3. **Motion foundation (M):** motion tokens and a new `src/motion/` (state comparison into events, queue, burst compression); Motion setting in `prefs.ts` and Display; reduced-motion rewrite in `global.css`; tap and untap; life count.
4. **Card flights and spotlight (M–L):** a flights layer; hooks in `Card`, `Hand`, `Battlefield`, `Rail`; opponent-cast spotlight; the "Casting…" slot.
5. **Stack centre stage (M):** `Rail` plus a new StackStage.
6. **Combat presentation (M–L, after packet E):** `Arrows.tsx`, `arrowGeometry.ts`, `Battlefield`, `CombatPanel`; damage numbers; conditional stops in the bridge (`fork-web` Java).
7. **Chosen skin, full (M):** `tokens.css`, `Board`/`Seat`/`PlayerPlate` CSS, playmat art crop (`adapter/images.ts`), fonts.
8. **Card stage and game start (S–M):** `Inspector`, `HoverPreview`, opening-hand stage, table intro.
9. **End-of-game moment (M):** `GameEnd.tsx`, `state/gameEnd.ts`, life history; Rematch after question 7.
10. **Opponent column focus and size retune (M):** `battlefieldLayout.ts`, `Board`.

## Not verified
- The press-count savings in U1 are an estimate.
- Names shown in `make play` (only the dev bridge was checked).
- Frame rate with flights on a busy board.
- How well the playmat art crop works without Scryfall.
- Benchmark notes on Hearthstone, Legends of Runeterra, Snap and Balatro come from general knowledge, not checked in this session.

Source: [mtgazone: priority and the phases of each turn](https://mtgazone.com/priority-and-the-phases-of-each-turn/)
