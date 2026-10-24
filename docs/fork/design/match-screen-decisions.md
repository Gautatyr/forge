# Match screen: owner's rulings

Rulings by the owner (Hugo) on 2026-10-15, in response to [match-screen-memo.md](match-screen-memo.md). Where this file and the memo differ, this file wins.

## Overall direction
- **Goal, in the owner's words:** "modern and clean UI, that looks and feel good (ux) but is clear. I don't want the user to search how to do x or y, or need to open stuff to checkout all the cards in the hands, it need to be clear and useful first."
- **Multiplayer first.** The first version must be designed for Commander with 3–4 players. 1v1 must also work. Handling many players on one screen needs real design work; do not bolt it on later. Layouts for 5–8 players can come later, but the design must not preclude them.
- **Pain points from the memo: agreed**, with one nuance. A fully configurable docking workspace is wrong, but **some light customisation of how the board is displayed is wanted**.
- **Contextual UI:** modern UIs can show things when needed and hide them when not. Consider this as a tool where it helps. It is not a requirement everywhere.
- **The memo's design principles: accepted.**

## Decisions D1–D11
| # | Topic | Ruling |
|---|---|---|
| D1 | Layout | Multiplayer first (3–4 player Commander), see above. Replaces the memo's "1v1 hero layout first". |
| D2 | Hand | Flat row of full cards. **A normal hand of up to 8–9 cards stays fully readable with no overlap.** Overlap only above that, and then only over the art, never the name and cost. Playable cards outlined; cards castable from other zones in a labelled group. |
| D3 | Card detail | As memo: large preview on hover, no permanent side panel; a key or right-click opens an inspector (both faces, counters, P/T breakdown, attachments). |
| D4 | Priority and stack | As memo (contextual main button, stack as cards when not empty, labelled phase track with clickable stops), **except: auto-pass and auto-yield are OFF by default and are a toggle.** This matches Forge's current default (`YIELD_AUTO_PASS_NO_ACTIONS = false`, `ForgePreferences.java:138`). |
| D5 | Targeting and combat | As memo (click to select, legal targets lit, attack-all button, auto damage assignment with manual option), **plus: blocks can be declared in either order — click the blocker then the attacker, or the attacker then the blocker.** |
| D6 | Prompts | As memo: non-modal choice tray with "peek at board"; Space = default. |
| D7 | Information density | As memo: always show decision-driving state; card text on hover; hold a key for all overlays. |
| D8 | Game log | As memo: recent events near the stack, full log in a drawer, hoverable card names. |
| D9 | Shortcuts | As memo: Arena-style keymap, `?` overlay, rebindable. |
| D10 | Accessibility | As memo. **Colour-blind support is a priority: the owner has colour-blind friends.** Shape + colour on every state, colour-blind-safe palette, UI scale 75–200%. |
| D11 | Card rendering | Full card images. **Cards are nice to look at; players must be able to admire them in game.** |

## Rulings from mockup review 1 (2026-10-15)
Source: [mockup-review-1.md](mockup-review-1.md).
- **Keyword icons:** permanents show an icon per keyword ability (haste, flying, trample, …). Hovering an icon explains the keyword with a short summary of its effect.
- **Target highlights follow the stack:** show targets for the stack item that is resolving next (the top). Other items show their targets only on hover. Never ring every target of every item at once.
- **Stable controls:** persistent buttons (e.g. Undo) keep a fixed position. Contextual buttons appear in reserved space without shifting the persistent ones.
- **Scrolling:** each region of the side panel scrolls on its own; opening a zone pile must never push the log out of reach.
- **UI scale:** changing the scale must not reflow the layout continuously while dragging (apply on release, or preview then apply).
- **Focus layout:** the focused opponent defaults to the one whose turn it is.
- **Board split:** 45% opponents / 55% you by default, configurable.
- **Hand beyond 9 cards:** stagger right away; no shrinking step first.
- **No per-colour untapped-mana display for opponents.**
- **Open, delegated to product:** how to show the turn sequence and phase stops (the current dots are unclear); where manual mana payment and floating mana go.
- **Open, from the orchestrator's review:** opponents' cards are too small to read; space is underused.

## Rulings on the pass-3 product decisions (2026-10-15)
Source: [product-decisions-pass-3.md](product-decisions-pass-3.md). The spec stands except where overridden here.
- **Default opponent layout: Columns** ("ok lets try"). Table and Focus remain options.
- **Keyword icon source:** use the Mana font's Arena ability symbols **only if they cover exactly the keywords we need**. If coverage would be a patchwork, use **Forge's existing keyword icons** instead (`FSkinProp.iconsFromCardState`). Drawing our own set may come later.
  - **Checked 2026-10-15: the Mana font is used.** Its Arena ability set (SIL OFL 1.1 font, MIT stylesheets; the symbols are Wizards of the Coast designs) has all 15 keywords that get their own icon, plus prowess, exalted, flash, and the generic "static ability" and "triggered ability" icons for the long tail. Protection, shroud and infect exist only in another section of the font; the spec gives them the generic icon anyway, so the set stays consistent.
- **Mana payment: manual payment is the default; auto-pay is a toggle (off by default).** This overrides the spec's "auto-pay on cast" default. Tapping sources before casting still adds mana to the pool; the "Taps: …" preview still shows what auto-pay would tap.

- **Keyword icon set approved** by Hugo after viewing the reference sheet (`docs/fork/design/keyword-icons.html`): 15 own icons, 6 extra keywords plus hexproof from each colour, 2 generic icons, the printed / added-by-another-card disc styles.

## Ruling after the 23:30 preview (2026-10-15)
- **No hand-holding.** Don't highlight every playable card. The screen gives information; the player counts their untapped lands and available mana and decides what they can play, like in a paper game. This overrides D2's "playable cards outlined" and the spec's "cards you can click light up".
- Preview verdict: better, not final. Two more product design-and-review passes before full implementation.

## Design pass 4 (2026-10-16, settled by the product agent under delegation)
Source: [product-decisions-pass-4.md](product-decisions-pass-4.md).
- **Highlights are answers, never hints:** a card lights up only when the open prompt lets you pick it (targets, attackers/blockers while declaring, cards to choose, mana sources while paying). Every other card looks and reacts the same.
- Clicking a permanent with priority tries to activate it; several abilities open a card-anchored ability menu.
- Your commander in the command zone shows only in the group beside the hand; that group lists every card you may cast from another zone, whatever you can afford.
- Commander damage chips name the source commander and its controller.

## Rulings from playtest 1 (2026-10-16)
Source: [playtest-1.md](playtest-1.md).
- **Official step names** in the turn strip (Comprehensive Rules wording), shortened only when space forces it, with the full name on hover.
- **The hover preview stays in one fixed place** whatever the card's position.
- **Opponents' commanders are not drawn on their board** while in the command zone. A command-zone chip in the opponent's header shows the commander on hover. This overrides pass 3/4's support-row placement.
- **No prompt when there is nothing to do** (for example, a free mulligan with 0 cards to put on the bottom).
- **Coin toss copy:** "You won the coin toss. Who plays first?", without "Choose exactly 1".
- **Music and sounds** play during web matches as they do in Forge.
- **Legal choices come from the engine:** possible blockers and attackers are what Forge allows (flying, reach, menace, …), never a local guess.

## Rulings on the UI direction memo (2026-10-22)
Source: [ui-direction-memo.md](ui-direction-memo.md) (section 4, open questions).
- **Stops only when you're involved** (memo U1a: opponents' declare attackers when you or your planeswalkers are attacked, declare blockers when you're in the combat, end step only before your turn): a **setting**, offered as an alternative to auto-pass. Like auto-pass (D4), it is not on by default.
- **Pass after casting your own spell** (U1b): a toggle, off by default.
- **Style direction:** not chosen yet. The owner first wants to see directions A, B and C (prototype in the mock).
- **Motion:** "medium" by default, with Subtle / Medium / Showy and Reduced / Off in the Display settings.
- **Incoming-attack lane:** yes, shown only when you are attacked.
- **Playmat art:** Scryfall's art crop when online, otherwise a crop of the card image.
- **Rematch** on the end-of-game screen: yes, if the launcher can start the same match again.
- **"Changed since your last decision" marker** on cards: yes; it is information, not a hint.

## Ruling on the hover preview at small heights (2026-10-22)
Source: PR #107 (parked) and its reviews.
- At small window heights (e.g. 1366×768), when the rail cannot hold a readable hover preview and the full Stack and Combat panels, **the preview shows over the board instead of in the rail**, so the panels stay complete. At larger sizes the fixed spot (refined in PRs #52 and #103) is unchanged. The preview never shrinks to an unreadable thumbnail.

## Rulings after QA playtest 3 (2026-10-24)
Source: the owner's answers to two questions raised by QA pass 3 (#29 visual notes) and the PR #135 audits (#140).
- **Spells between opponents:** "Stop only when I'm involved" keeps every stack stop as before. A **separate toggle** in the Stops panel, off by default, also skips stack items that neither target nor affect you or your permanents (spells and abilities the AIs aim at each other).
- **Choice tray at small heights (#140):** when the tray's tiles cannot fit with their labels and key hints (short laptop windows, about 1366×650–700 and 1280×720), the tray shows a **compact list** (card name + key hint) instead of tiles; hovering a row shows the card preview. Larger windows keep the tiles.

## Ruling on the hover preview size and place (2026-10-24, issue #172)
Source: the owner's answer on #172. **Supersedes** the 2026-10-22 text "At larger sizes the fixed spot (refined in PRs #52 and #103) is unchanged" and the rail spot of PRs #52 and #103.
- The hover preview is **big and in one fixed spot over the board**, flush with the rail side, its bottom on the hand. Sizes are the 2026-10-16 ones: 647x904 at 2560x1440 (full screen), 486x678 at 1920x1080. Smaller windows scale down, never under 271x378.
- It **may cover the hovered card**. It is the **same rect for every hovered card**, whatever its zone (board, hand, stack, rail).
- It **moves or narrows only when the open prompt needs room**: the prompt's cards, its tray, the targets a hovered stack item lights. Inside one prompt state it is still the same rect for every hovered card.

## Ruling on spell stops while passing (2026-10-24, after the owner's first game)
- With **Auto-pass when I can't act** on, an opponent's spell still stops the owner while they hold a castable instant, even one that can't answer that spell. The engine counts any castable card or activatable ability as "can act", and cannot judge whether a response is useful.
- Options offered: stop only for spells that target you or your permanents; never stop for spells while passing; keep as is. **Owner ruling: keep as is.** Any opponent spell stops you while you hold something castable, and Space lets it resolve. Do not add a relevance heuristic or a "spells don't interrupt passing" option unless the owner asks again.

## Language (2026-10-15)
- The match screen is switchable between **English and French**: UI text, keyword explanations, card names and text, and card images where Scryfall has French printings.
- Forge already ships the data: `forge-gui/res/languages/fr-FR.properties` (UI strings) and `forge-gui/res/languages/cardnames-fr-FR.txt` (card names and text).
- Layouts and copy must leave room for French, which runs longer than English.

## Facts checked in the code (2026-10-15)
- The engine's 13 prompt messages that need an answer fit 5 shapes: choose N from a list (min/max), yes/no, order (including moving between two lists), distribute an amount, type a text or number (`showInputDialog`). One generic choice tray can render them all. See [../architecture/web-ui.md](../architecture/web-ui.md).
- Sideboarding between games uses the generic two-list order dialog on desktop (`forge-gui-desktop/src/main/java/forge/gui/GuiChoose.java:227`), so the choice tray covers it.
- Existing Swing windows (Yield Settings, 270 lines) can be opened by the Java side mid-match as a stopgap.
