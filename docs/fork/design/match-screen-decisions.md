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

## Facts checked in the code (2026-10-15)
- The engine's 13 prompt messages that need an answer fit 5 shapes: choose N from a list (min/max), yes/no, order (including moving between two lists), distribute an amount, type a text or number (`showInputDialog`). One generic choice tray can render them all. See [../architecture/web-ui.md](../architecture/web-ui.md).
- Sideboarding between games uses the generic two-list order dialog on desktop (`forge-gui-desktop/src/main/java/forge/gui/GuiChoose.java:227`), so the choice tray covers it.
- Existing Swing windows (Yield Settings, 270 lines) can be opened by the Java side mid-match as a stopgap.
