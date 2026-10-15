# Design memo: new match screen (discovery input)

> Archived agent report, 2026-10-15. Baseline commit `0b0f7ecc511` (upstream/master at the time).

**Decision:** Build a fixed, opinionated 1v1-first match screen with no docking. The board is where you act, your whole hand is always visible, there is one prompt bar next to the hand, the stack shows as cards, and passing is fast by default with full control one key away. Multiplayer gets its own layout later.
**Status:** Needs Hugo. This is the discovery input for the design discussion; nothing here is settled. **Confidence:** medium. The pain points and inventory are well evidenced. The layout calls are taste, and no rulings log exists yet.
**The user's goal here:** at any moment, see what matters and act on it without hunting, opening panels or reading docs.

**What I worked from.** There is no product-context skill or rulings log in the repo. The only recorded taste is `docs/Development/UI-Guidelines.md`. I did not read the Java files the dispatch names (IGuiGame, ProtocolMethod, the input classes, the views, the desktop `screens/match`), because my standing rules forbid reading source code. The inventory below comes instead from what users see: `docs/User-Guide.md`, `docs/Advanced-Yield-Options.md`, `docs/interface-overview.png`, the prompt strings in `forge-gui/res/languages/en-US.properties` (135 "Choose…" and 103 "Select…" strings), `forge-gui/res/defaults/match.xml`, and 150 upstream GUI issues. Questions 1 and 2 at the end close that gap.

---

## 1. Interaction inventory

**Every turn (must be effortless)**
- **See:**
  - your full hand;
  - both battlefields: tapped, summoning-sick, P/T changes, counters, marked damage, attachments, grouped tokens and lands;
  - life totals;
  - hand, library, graveyard and exile counts;
  - whose turn it is, the current step, and who has priority;
  - the stack and its targets;
  - floating mana;
  - what the game is waiting for.
- **Do:**
  - pass priority;
  - play a land; cast a spell; activate an ability ("Choose ability to play");
  - pay mana, automatically (Auto-Pay, Enter/Space) or by clicking sources or pool symbols;
  - pick targets, and un-pick them (#3420);
  - declare attackers, including attack-all ("Alpha Strike") and choosing the player, planeswalker or battle to attack;
  - declare blockers;
  - inspect any card, including its other face;
  - end turn or yield; undo (`nlUndoMode`); cancel a half-cast spell (#9442).

**Every game (must be quick and clear)**
- Coin toss and play/draw; mulligan and keep, then choosing cards to put on the bottom; opening-hand actions ("Choose cards to activate from opening hand").
- Discard to hand size. Scry and surveil. Search the library, which means picking from a long list.
- Choose a mode (#7232: mode text gets truncated today), X, a colour, a number or a creature type. Optional costs. Reveal or look at cards.
- Order simultaneous triggers ("Always use this order"). Divide combat damage with trample or deathtouch (the L/R-click damage strings). Since the Foundations rules there is no damage order, as `nlOrderCombatants` confirms.
- Browse any graveyard or exile. Read the log. Make auto-yield and always-yes/no decisions on stack items. Concede.
- End of game: the reason for the win or loss, then next game or sideboarding.

**Rare (must be discoverable, not prominent)**
- Piles, votes, dice and coin manipulation, contraptions and sprockets, The Ring tempts you, dungeons (#9706), Speed (#6946), Monarch, Initiative, City's Blessing, day/night.
- Energy, poison, rad and experience counters.
- Face-down cards (morph, manifest, foretell; #3449). Split, flip, transforming, adventure and omen cards.
- Banding, exert, enlist, splice. Cost order and cost reduction, replacement-effect order, prevention-shield choice, layer timestamp ("Full Control").
- Ordering cards into the library or graveyard. Ante. Macros, dev mode, the Dependencies tab.

**Variants and network play**
- **Commander, Brawl, Oathbreaker, Tiny Leaders:** command zone, commander tax ("Cast from command zone N times"), commander damage per opponent, partners.
- **Planechase:** current plane, planar die, chaos.
- **Archenemy:** scheme deck, 1 vs team.
- **Vanguard:** an avatar that changes life and hand size.
- **Player count:** up to 8 players, with teams.
- **Network play:** chat, "Must wait for priority…", host settings applying to everyone (undo), yield preferences kept per player.
- **Spectating:** sees no hidden information.

The generic shape behind the long tail is: choose N of these cards or options (with a minimum and maximum), order these, distribute a number, or yes/no. If one surface handles those shapes well, the rare prompts come almost for free.

## 2. Pain points of the current desktop match screen

1. **It's a configurable workspace, not a game screen.** `match.xml` defines 8 cells holding about 12 panels. The user guide spends whole sections on dragging tabs and splitting cells. In `interface-overview.png`, the board gets 60% of the width while one hovered card is shown twice (Card Detail plus Card Picture, the whole right-hand fifth of the screen).
2. **The prompt is far from the action.** The prompt and the OK / End Turn buttons sit bottom-left (`x=0, y=0.732`), while your hand is bottom-centre and the targets are on the board. Tab can't reach the buttons (#11425). Pop-ups lack a sensible default action (#8515, #8444, #8482).
3. **Power features hide behind right-click and modifier keys.** Yield markers (right-click a phase pip), stack auto-yield (right-click a stack item), Full Control (right-click your avatar), zone display mode, group counts (right-click a badge), Shift-click helpers. Speed only appears when you hover the portrait (#6946). This is exactly what Hugo means by "search how to do x".
4. **Cryptic symbols.** The phase strip is two-letter codes per player (UP, DR, M1, BC, DA…), where a click sets a stop and a right-click sets a yield. Zone and mana counts are unlabelled icon columns, and all mana-pool slots show even at 0 (screenshot items 7 and 9).
5. **The hand hides cards.** Cards overlap and cover each other (#9721). This hits Hugo's stated goal directly.
6. **Modal dialogs block the board.** You can't check the dungeon while venturing (#9706). Zones open in floating windows or tabs. The graveyard type summary is only a tooltip (#6916).
7. **Information is disconnected.** Card names in the log don't show the card (#7137). Combat state lives in a separate tab (#2084). Stack text is sometimes wrong (#5634), so showing the card itself matters.
8. **Multiplayer hides opponents behind tabs** ("Ivan Field (3 new)"). Turn-order sorting is opt-in (`User-Guide.md`, "Sort Player Fields").
9. **Weak accessibility.** Colour-blind support is "use another skin" (`User-Guide.md`, Accessibility). Screen-reader support fails on Linux (#3272). HiDPI scaling breaks (#3380). Targeting arrows differ only by red versus blue.
10. **Too many settings on the surface.** Yield alone has auto-pass, markers, stack yield, end turn, 6 interrupts, suggestions, decline scopes and timeouts. The engine is excellent (keep it); the surface is too heavy.

## 3. Benchmarks

| Topic | Borrow | Avoid |
|---|---|---|
| **Hand** | Arena: hover lifts a card; drag or double-click to play; cards playable from other zones sit beside the hand. Forge already has "Playable Zone Cards" (`lblFlashbackZone`). | Arena's unlabelled gap between hand and other-zone cards, which is hard to read when the hand is empty or full (mtgazone). |
| **Inspection** | Arena: hover for text, right-click for full detail including the original printing. MTGO: hold Q to zoom, E to view your own face-down cards. Forge: mouse-wheel zoom, Ctrl for the other face. One gesture everywhere, plus a key to flip (#6569). | Four different gestures (Forge today). |
| **Stack** | Arena: stack shown as cards on the right, hover shows targets, a big stack expands to the centre. MTGO: right-click a stack item for yields. Forge's targeting arrows. | A text-only stack. |
| **Priority** | Arena: stops only when you can act; Space passes, Enter passes until a response, Shift+Enter passes the turn, Ctrl gives Full Control; stops are set on a visible timeline by each portrait. MTGO: one key clears all yields (5), one key skips when you have no play (8). Forge: interrupts (`Advanced-Yield-Options.md`). | XMage's skip keys that skip one step too far (#4470), and stops you can only change in preferences, which XMage itself wants to replace with Arena-style markers (#5633). |
| **Targeting** | Arena: click, with legal targets highlighted. | Cockatrice: manual arrows drawn by right-drag, colour-coded, no rules enforcement. Fine for a sandbox, wrong for a rules engine. |
| **Combat** | Arena: click a creature, then the defender; click a pile's count to commit the whole pile; hover the defender to see what is unblocked. Forge: group badges, Alpha Strike. | Arena's auto damage assignment as the only path. Guides tell players to turn it off because it is sometimes wrong (mtgazone). |
| **Choices** | MTGO: Yes/No on keys 3/4. Forge: Ctrl+1–9 quick-select (`lblHotkeySelectHint`). | Modal pop-ups without a default (#8515). |
| **Log** | Forge's own Low/Medium/High verbosity plus card images. | A log that isn't linked to cards (#7137). |
| **Multiplayer** | MTGO and Forge show every seat at once. Forge's Grid/Rows options already exist. | Tabs. Arena is 1v1 only, so it is no model here. Untap.in is a bare sandbox (no step tracker, per Draftsim), so it is no model either. |
| **Forge mobile** | It proves the same engine works with no docking: long-press to zoom ("Zoom/Details"), long-press a phase to yield, a single Game menu. | — |

Competitor practice here is evidence of convention, not of quality. Arena matters most because many friends will already know its keys. I could not find a primary XMage user guide; its rows rest on XMage's own issues.

## 4. Design principles

1. **The board is the interface.** Frequent actions happen on the cards. This rules out a corner "prompt panel" as the main place to act.
2. **Everything you may know is visible without opening anything.** This rules out an overlapping hand, opponents behind tabs in 1v1, and hover-only stats (Speed, #6946).
3. **One question at a time, asked where you're looking, and it never locks the board.** The prompt bar sits beside the hand. This rules out blocking modal dialogs (#9706).
4. **Words over symbols when meaning matters.** Buttons say what will happen ("Attack with 3", "Resolve", "To my turn"). This rules out two-letter phase codes and unlabelled counts.
5. **Fast by default, full control on request.** This rules out clicking OK through empty steps, and it also rules out silent skips past things you cared about. Interrupts stay on.
6. **Every power feature has a visible door.** Anything on right-click or a key is also a visible control. This matches UI-Guidelines: "never the exclusive entry point". It rules out right-click-only features.
7. **Fixed layouts per player count, no docking.** This rules out user-arranged panels.
8. **Colour is never the only signal, and everything scales.** This rules out red-vs-blue-only arrows and colour-only stop states.

## 5. Key decisions to settle with Hugo

**D1. Layout strategy.**
- (a) 1v1 hero layout first; a separate 3–4 seat layout with opponents as compact strips across the top, one of which can be expanded; 5–8 players reuse it, compressed.
- (b) One universal grid for every player count.
- (c) Tabs, as today.
- **Recommendation: (a).** 1v1 versus AI is the main use, and a universal grid makes 1v1 worse to serve a rare case. Rejected (c): it violates principle 2.

**D2. Hand display.**
- (a) Arena-style fan with hover-lift.
- (b) A flat row of full cards that shrinks to a readable minimum, then overlaps only the art, never the name and cost band.
- (c) Names only.
- **Recommendation: (b).** Playable cards get a highlight with a shape and outline, not just colour. Cards playable from other zones sit in a labelled group to the right. This answers #9721 and Hugo's "no opening stuff". Rejected (a): it hides cards, which is the complaint.

**D3. Card detail and zoom.**
- (a) A permanent side panel, as today.
- (b) On hover, a large preview on the opposite half of the screen; holding a key or right-clicking opens an inspector with both faces, counters, a P/T breakdown, attachments and the original printing.
- (c) Both.
- **Recommendation: (b).** It gives the board back 20% of the width. Taste call; medium confidence.

**D4. Stack and priority.**
- (a) Arena defaults (auto-pass when you can't act, with Forge's interrupts) and one key for Full Control.
- (b) MTGO-style explicit stops everywhere.
- (c) Today's model.
- **Recommendation: (a), built on Forge's existing engine:**
  - One primary button whose label says what it does next.
  - The stack appears only when non-empty, as a column of cards with the controller shown, arrows to targets on hover, and a "Resolve all" control.
  - A labelled phase track with stops you click; yield markers are a second click state shown with a distinct icon.
  - A visible "Cancel auto-pass" chip whenever any yield is active (MTGO's key 5).
  - The full Yield Settings stay one menu away.

**D5. Targeting and combat.**
- (a) Click to select: legal targets lit, everything else dimmed, chosen targets listed in the prompt bar, a second click deselects, then Confirm.
- (b) Drag arrows.
- **Recommendation: (a).** Drag can come later.
- **Attacking:** click creatures to toggle them. The defender defaults to the only opponent; otherwise click a defender chip. "Attack with all" is a button, and piles commit by count.
- **Blocking:** click a blocker, then an attacker. Arrows are drawn with shape and colour.
- **Damage:** auto-assigned by default, with "Assign manually" inline.

**D6. Prompts and choices.**
- (a) Board choices go in the prompt bar. Off-board choices (library search, modes, colours, ordering) open in a non-blocking choice tray with a "Peek at board" control and a default on Space.
- (b) Modal dialogs.
- **Recommendation: (a).** One generic tray serves all ~240 prompt families.

**D7. Information density.**
- (a) Always show the state that drives decisions (P/T, counters, damage, sick, tapped, attachment count, all zone counts with labels) and put card text on hover.
- (b) A "detailed/clean" toggle.
- **Recommendation: (a)**, plus a held key to show every overlay. A toggle splits the product into two experiences.

**D8. Game log.**
- (a) A side drawer.
- (b) A recent-events strip.
- (c) Both.
- **Recommendation: (c).** The last few events show near the stack, the full log sits in a drawer, card names are hoverable (#7137), and Forge's verbosity levels are reused.

**D9. Keyboard shortcuts.**
- **Recommendation: adopt Arena's map where it doesn't clash.**
  - Space: primary action or pass. Shift+Enter: pass turn. Ctrl: Full Control. Z: undo.
  - Esc: cancel. Forge's optional "Escape ends turn" (`nlEscapeEndsTurn`) should not be the default.
  - P: auto-pass, as now. 1–9: choose an option.
  - "?" shows a shortcut overlay. Keep Forge's rebindable `SHORTCUT_*` set.
- Rejected: MTGO's number-key scheme, which fewer of Hugo's friends will know (inference).

**D10. Accessibility.**
- **Recommendation for the MVP:**
  - A colour-blind-safe default palette (UI-Guidelines: "default skin should favour accessibility").
  - Shape plus colour on every state.
  - A UI scale from 75% to 200%, independent of the OS (#3380).
  - A minimum text size.
  - A logical keyboard focus order (#11425).
- Screen-reader support comes later, but nothing in the MVP may preclude it (#3272).

**D11. Card rendering.**
- (a) Full card images with overlays.
- (b) Art-crop tiles, as #3236 asks.
- **Recommendation: (a).** Forge has no reliable art crops (maintainer reply on #3236).

## 6. MVP scope (1v1 vs AI, Constructed)

**Must have**
- The fixed 1v1 layout.
- The hand from D2.
- The battlefield with lands and tokens grouped, tapped, counters, attachments, P/T, damage and summoning sickness.
- Labelled zone counts, with a non-blocking viewer for graveyard, exile and the command zone (emblems, dungeon, Ring, Speed).
- The stack as cards.
- Priority: a contextual primary button, auto-pass with interrupts, end turn, phase stops.
- Mulligan and bottoming.
- Casting with targets, modes, X and optional costs.
- Mana payment, automatic and manual.
- Attack and block, including planeswalkers and battles as defenders, attack-all, and damage distribution.
- The generic choice tray: choose N, order, distribute, yes/no.
- The inspector with flipping between faces.
- The log, undo, concede, the end-of-game result, and the hand-back to the Swing screens.
- The core shortcuts and UI scale.

**Can wait**
- Multiplayer layouts (3–8 players) and Commander specifics (commander damage table, tax display).
- Planechase, Archenemy, Vanguard and ante.
- Network play, spectating and chat.
- Macros, dev mode and the Dependencies tab.
- A native Yield Settings screen, if the Swing one can be reused (Question 3).
- Animations, sound and themes.

**Cost and risk (my estimate):** L overall. The biggest risk is the long tail of prompts, which the generic tray (D6) contains. The second is the hand-off between the Swing screens and the new screen around sideboarding between games.

**Proposed rulings for the log**
- On the match screen, everything a player may know is visible without opening anything, and nothing modal ever hides the board.
- Every action reachable by right-click or a shortcut also has a visible control.
- Fast by default, full control on request: auto-pass with interrupts is the default; holding priority is one key.

**Questions for the orchestrator**
1. Please map the 44 game→player and 16 player→game protocol messages against my inventory in section 1, and list any that my categories (board choice, choose N, order, distribute, yes/no, state update) don't cover.
2. Is Auto-Pass on or off by default today?
3. Can the new screen open existing Swing dialogs mid-match (Yield Settings, Preferences, sideboarding between games), or must they be rebuilt? What size is each?
4. Do all choice prompts arrive in a common shape (options, minimum, maximum, ordering), so that one generic tray can render them? This sizes the MVP.

Sources:
- [MTG Arena hotkeys and interface guide (mtgazone)](https://mtgazone.com/arena-hot-keys-and-interface-guide-simplify-your-game-with-these-easy-tricks/)
- [Playing a match on Arena (mtgazone)](https://mtgazone.com/playing-a-match/)
- [Arena keyboard shortcuts (Draftsim)](https://draftsim.com/mtg-arena-keyboard-shortcuts/)
- [MTGO getting started tips and tricks](https://www.mtgo.com/getting-started/getting-started-tips-tricks)
- [Cockatrice one-minute game guide](https://github.com/Cockatrice/Cockatrice/wiki/One-minute-game-guide)
- [XMage #5633 stop markers](https://github.com/magefree/mage/issues/5633), [#168 priority hot keys](https://github.com/magefree/mage/issues/168), [#4470 skip keys](https://github.com/magefree/mage/issues/4470)
- [How to play Commander online, Untap.in section (Draftsim)](https://draftsim.com/how-to-play-commander-online/)
