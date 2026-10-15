# Product decisions for design pass 4 (playable Commander game)

> Archived product-agent spec, night of 2026-10-15 → 16. Settled by the product agent under the owner's delegation.

**Decision:** Remove every "you could play this" highlight and keep highlights only while the game asks for a choice. Then build the six missing pieces a real 4-player Commander game needs, in this order: manual payment, game start and end, the choice tray, the number prompts, then the card and board fixes.
**Status:** Settled. You delegated these calls and all of them can be undone; nothing here needs Hugo. **Confidence:** high on the review and the order of work. Medium on four engine-dependent details (questions at the end).
**The user's goal here:** sit down in the morning and play one full Commander game against 3 AIs from the first hand to the result, without wondering how to do something. Read the table like paper and act only when the game asks.

## 1. Review of the current screen (review-2, 1920×1080)

**P1. Hand-holding highlights break the newest ruling.** In 01, 03, 05, 07 and 08, the hand cards Path to Exile, Heroic Intervention, Beast Within and Moment's Peace have a blue ring plus a play badge, and the prompt says "Respond with a lit card" / "Play a land or cast a lit card". This breaks the 23:30 ruling and the final answers in `decisions.md`.
- Fix: no ring, no badge, no dimming on hand cards, on the other-zone group or on permanents during ordinary priority. Every hand card reacts the same on hover (it lifts).
- Clicking a card you can't play gives a short neutral note in the prompt line for 3 s: "You can't play Primeval Titan right now." No shake, no red.
- New prompt copy:
  - "Mira's Lightning Bolt is on top of the stack. Respond, or let it resolve."
  - "Your main phase."
  - "Ana's turn · combat."
- Highlights that stay, only while that choice is open:
  - legal targets while you pick targets;
  - possible attackers while you declare attacks;
  - possible blockers, and the attackers they can block, while you declare blocks (02 is correct as it is);
  - cards to choose for a prompt;
  - mana sources while you pay.

**P2. There is no way to see that a permanent has an ability, so no way to use it.** Once the highlights are gone, Goblin Bombardment and Viscera Seer look the same as vanilla cards.
- Fix: clicking any permanent of yours while you have priority tries to activate it.
  - Lands and mana creatures add mana (spec §2).
  - One non-mana ability activates straight away.
  - Several abilities open the **ability menu**, anchored to the card. Each row shows the cost symbols and the ability's text. Keys 1–9 pick a row; Esc closes.
- Adventure and modal faces use the same menu (Emeria's Call already asks which face).

**P3. Your commander is drawn twice (06).** Sythis shows in your support row ("Command zone · tax +2") and again beside the hand.
- Fix: your own commander in the command zone appears only in the group beside the hand, where you cast it from. Opponents' commanders stay in their support row.

**P4. The group beside the hand gives a playability hint.** If it lists only the cards castable right now, its contents tell you what you can afford.
- Fix: the group lists every card you have permission to cast from another zone: commander, flashback, escape, foretell, adventure in exile. Mana and timing don't affect the list. Captions stay as they are ("Graveyard · flashback").

**P5. Commander damage on opponents' headers doesn't say who dealt it.** Theo's header reads "♛ 3" (01, 03).
- Fix: one chip per source commander, showing the controller's shape and the amount: "♛ ▲ 3". With room, the commander name joins it: "♛ ▲ Krenko 3/21".
- Hover text: "Krenko, Mob Boss (▲ Mira) has dealt Theo 3 commander damage. 21 eliminates."
- From 15, the existing burst style applies. Partners get two chips.
- Your own plate already lists sources by name; keep it.

**P6. It's hard to catch up after three AI turns.** Recent is one flat list (01, 03), and AIs act fast.
- Fix: Recent gets a divider per turn ("— ■ Theo's turn 10 —").
- Lines where you lose life or lose a permanent are bold.
- Each plate shows the life change ("−3") beside the life total for 4 s, using shape plus colour (▼ for loss, ▲ for gain).

**P7. Prompt copy assumes auto-pay.** "Cast a lit card" and the old fast-path copy have to go once payment is manual. That is handled by §2.1.

Not repeated here: the items already parked in #29 (Priority tag, header zone words, top-bar clipping, and the rest).

## 2. What is still missing to play a complete game

### 2.1 Manual mana payment (pass-3 §2, with the override)
Auto-pay is a switch, **off by default**. It sits under auto-pass: "Auto-pay mana: Off" / "Paiement auto : Non".

**Payment mode** opens in the action block when you cast or activate an ability that has a mana cost:
```
Floating   {G}{G} · empties at end of step
Pay {2}{G}{W} for Sythis · includes tax {2}
Click your lands or creatures that add mana.
[ Pay automatically            Space ]
[ Taps: Forest, Temple Garden        ]
Cancel (Esc)
```
- **Cost display:** paid symbols are filled with ✓; unpaid symbols are outlined.
- **Sources:** sources that can still pay get the sky ring and a mana notch. Other permanents dim; opponents' boards don't.
- **Grouped lands:** clicking a group ("Forest ×3") taps one untapped land from it. The group splits into untapped and tapped as it already does.
- **Lands with two or more colours:** a small chooser appears at the card, "Add {G} · Add {W}", keys 1 and 2.
- **Floating mana:** clicking a pool symbol spends it.
- **Finishing:** the spell goes on the stack as soon as the cost is fully paid. No confirm step.
- **Keys:**
  - Z undoes the last tap.
  - Esc cancels: the card goes back and its sources untap.
  - Space pays the rest automatically.
- **Order of steps:** for X costs, the number prompt (§2.3) comes first, then payment. Convoke and delve show their extra sources the same way.
- **Before casting:** clicking a land while you hold priority adds its mana to the pool. The pool shows above the prompt only while it isn't empty.
- **With auto-pay on:** casting pays at once, and the log names the lands that were tapped.

### 2.2 Choice tray: three shapes plus reveals
Common rules for every shape:
- The tray is non-modal and sits over your board only.
- "Peek at board" (V) folds it.
- The orange main button mirrors the tray's confirm. Space confirms when the confirm is enabled. A disabled confirm says why ("Choose 1 more").
- **Where options are picked:** if every option is a card on the battlefield, in your hand, or a player, you choose in place with the existing selected state (yellow ring + ✓). The tray then shrinks to a one-line bar with the title, the counter and the confirm. Otherwise the cards and options show inside the tray.

**Choose N (min/max)**
- Title from the engine, for example "Choose up to 2 basic land cards".
- Counter: "1 chosen · up to 2", or "Choose exactly 1" when the number is fixed.
- Card grid, or chips for text options (modes, colours, creature types).
- Click toggles a choice; keys 1–9 toggle the first nine. Confirm label: "Confirm (1)".
- Lists over 12 items get a filter box ("Filter by name or type") and a scrolling body that grows up to the full height of your board. Search results are sorted by name.
- Mode text never truncates; rows wrap.
- Colour choice: five symbols with their names.

**Yes / no**
- Two buttons with the engine's labels; the engine's default is primary.
- Keys: Y and N; Space = the default.
- Optional triggers put the source card in the header: "Use Sigil of the Empty Throne's ability?"
- **Commander moving zones** uses this shape with the card shown:
  - Title: "Sythis, Harvest's Hand would go to your graveyard."
  - Buttons: **"Move to command zone"** (default) / "Leave it in the graveyard".

**Order, and two lists**
- Uses the existing scry layout.
- Single-list order (simultaneous triggers): one column labelled "Resolves first" at the top, with ↑/↓ buttons on each item. Alt+↑/↓ moves the focused item.
- Two lists: the engine's labels, click moves a card between lists, and the arrows reorder.

**Reveal / look**
- Title: "▲ Mira reveals" / "You look at the top 3 cards of your library".
- The cards show at hand size, each with a hover preview.
- One button: "OK" (Space). The reveal is also logged in Recent with the card names hoverable.

**Ability menu:** see P2. When the engine asks to choose an ability, it renders as the card-anchored menu, not the tray.

### 2.3 Choice tray: number shapes
**Distribute an amount**
- Title: "Divide 5 damage among 3 targets".
- One row per recipient: thumbnail or player shape, name, stepper, and the engine's minimum.
- "Left to assign: 2". Confirm is enabled at 0.
- Keys: Tab between rows; ↑/↓ change by 1; Shift+↑/↓ change by 5.

**Combat damage assignment** (same shape)
- Title: "Assign Krenko, Mob Boss's 7 damage". It opens prefilled with the automatic assignment: lethal damage to each blocker, the rest to the player when the attacker has trample. One Space accepts that, which is D5's "auto with manual option".
- Each blocker row shows "Lethal 2", or "Lethal 1 · deathtouch".
- The trample row reads "▲ Mira (player)" or names the planeswalker. Its stepper is disabled until every blocker has lethal damage, with the note "Assign lethal damage to every blocker first".

**Number**
- "Choose X for Fireball": a stepper plus a typed field, with the range shown ("0–7"). The field opens on the engine's default.

**Name a card / text**
- A field with up to 8 autocomplete suggestions, each with its cost and type line.
- Highlighting a suggestion shows its preview. ↑/↓ moves through the list; Enter picks.
- The engine's constraint appears under the field ("Name a nonland card"). Confirm works only with an exact card name.

### 2.4 Game start
- **Toss winner:** a yes/no prompt, "You go first. Play first?", with the buttons "Play first" / "Let ▲ Mira start" (engine labels).
- **Mulligan (London):**
  - Your 7 cards sit in the hand row at full size.
  - Tray: "Opening hand · 7 cards". Text: "Keep these cards, or shuffle and draw 7 new ones." When the engine says the next mulligan is free, it adds **"Your first mulligan is free."**
  - Buttons: **"Keep 7"** (Space) and "Mulligan" (M). After a mulligan that costs a card, the keep button reads "Keep · put 1 on the bottom".
  - Once you keep, choose in place in your hand: "Choose 1 card to put on the bottom of your library", "0 of 1 chosen", confirm "Put on bottom".
  - Opponents' headers show the tags "Deciding…", "Kept 7" and "Mulligan → 6".
- Life plates show 40, and the life figures must fit 3 digits.

### 2.5 Commander specifics
- **Casting from the command zone:** from the group beside the hand. The caption is "Command zone · tax +{2}" and payment says "includes tax {2}". The tax goes up by 2 each time.
- **Commander damage:** P5, plus your own plate's list. 21 eliminates.
- **Commander moving zones:** the yes/no prompt in §2.2.

### 2.6 Players leaving and the end of the game
**An opponent is out**
- A toast at the top of the board for 5 s: "■ Theo is out: 21 commander damage from Krenko, Mob Boss." Recent logs the same line.
- Their column leaves (250 ms) and the others widen. Table falls back to Columns below 3 opponents.
- "next:" skips them, and their commander's damage entries drop from your plate.

**You are out (4-player)**
- A dialog over your board: "You're out: 21 commander damage from Krenko, Mob Boss. The game continues."
- Buttons: "Watch the rest" (Esc) and "Back to lobby" (ends the game).
- While watching, the action block reads "Watching" and gives no prompts.

**Concede**
- Game menu → "Concede game…". Confirm: "Concede this game? You're out; the others keep playing."
- "Keep playing" has default focus; "Concede" is vermillion and needs a click or Enter.
- After that, it behaves as "You are out" above.

**End of game**
- A centred panel, 560 px, with the board dimmed behind it.
- Headline: "You won" or "▲ Mira won". Reason: "Last player standing."
- A ranked list, for example: "4th ■ Theo, turn 12, 21 commander damage from Krenko".
- Buttons: **"Back to lobby"** (Enter) and "View the board" (Esc). Viewing keeps a top-bar chip "Game over · Back to lobby".
- If the match has more games, the primary button becomes "Next game". Sideboarding uses the two-list tray.

## 3. Implementation split (by importance)

1. **Payment (ActionPanel, primaryAction, payment state, mana-source highlight):** §2.1 and the copy changes from P1. Update #24 to match §2.1. **M.**
2. **Game start and end (MatchScreen overlays, Board reflow, TopBar Game menu, PlayerPlate status tags):** §2.4 and §2.6. Mulligan bottom selection reuses the existing selected state; no Card edits. **M.**
3. **Choice tray core (ChoiceTray shell, choose-N, yes/no, order, reveal, ability menu, choosing in place):** §2.2. **M–L.**
4. **Number shapes (new files only: Distribute, Number, NameCard bodies):** §2.3. It touches the tray's dispatch in one line only. **M.**
5. **Board and cards (Card, Hand, Battlefield, cardStatus, PlayerPlate commander chips and life change, Recent dividers):** P1 visuals, P3, P4, P5, P6. **M.**

## Rejected
- **A soft "playable" glow, or one shown only on hover:** still hand-holding, against the 23:30 ruling.
- **Auto-pay by default:** overridden by Hugo.
- **A modal pop-up per prompt:** breaks D6.
- **A greyed stub plate for players who are out:** the dispatch says their board disappears, and the toast plus log carry the news.
- **Asking about damage assignment every combat:** D5 says automatic, with a manual option.

## Cost and risk
- About 4×M plus one M–L, roughly one session each. The main risk is the four engine facts below.

## Proposed ruling for the log
"Highlights are answers, never hints: a card lights up only when the open prompt lets you pick it. Every other card looks and reacts the same."

## Questions for the orchestrator
1. Does Forge make the first mulligan free in 4-player Commander, and does the prompt say so?
2. Can the bridge list other-zone cast permissions regardless of current affordability (P4)?
3. Does a reveal block the engine until acknowledged? If not, show it in the rail instead of the tray.
4. When you are out, does the game keep running among the AIs? And can "Back to lobby" bring Forge's lobby to the front or close the tab? If not, the page should say "Match finished. Forge's lobby is open; you can close this tab."

Sources (all under `docs/fork/`):
- `design/match-screen-decisions.md` (D2, D5, D6, the 23:30 ruling, the payment override)
- `decisions.md` (final answers, 2026-10-15)
- `design/product-decisions-pass-3.md` §2 and §4
- `design/mockup-notes.md`
- `design/review-2/01-priority.jpg` to `10-keyword-tooltip.jpg`
