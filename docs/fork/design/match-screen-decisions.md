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

## Language (2026-10-15)
- The match screen is switchable between **English and French**: UI text, keyword explanations, card names and text, and card images where Scryfall has French printings.
- Forge already ships the data: `forge-gui/res/languages/fr-FR.properties` (UI strings) and `forge-gui/res/languages/cardnames-fr-FR.txt` (card names and text).
- Layouts and copy must leave room for French, which runs longer than English.

## Facts checked in the code (2026-10-15)
- The engine's 13 prompt messages that need an answer fit 5 shapes: choose N from a list (min/max), yes/no, order (including moving between two lists), distribute an amount, type a text or number (`showInputDialog`). One generic choice tray can render them all. See [../architecture/web-ui.md](../architecture/web-ui.md).
- Sideboarding between games uses the generic two-list order dialog on desktop (`forge-gui-desktop/src/main/java/forge/gui/GuiChoose.java:227`), so the choice tray covers it.
- Existing Swing windows (Yield Settings, 270 lines) can be opened by the Java side mid-match as a stopgap.
