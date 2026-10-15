# Product decisions for mockup pass 3 (issue #2)

> Archived product-agent spec, 2026-10-15. Two items await the owner: the default opponent layout and the keyword icon source.

# Match screen: product decisions on the four delegated items (after mockup review 1)

**Decision:** (1) The turn strip shows game state in words. Stops leave the strip: you edit them in a "Stops" panel with "Stop" and "Pass" written in each cell, and the pass button says where the game will next stop for you. (2) Auto-pay happens the moment you cast. You pay by hand by tapping sources first, or by switching auto-pay off. Floating mana sits in the right panel, just above the prompt. (3) Each keyword gets an icon from one consistent set, sized to fit small cards. Keywords added by other cards are drawn in reverse colours. Hovering an icon gives the keyword's name and one line of explanation. (4) Opponents' cards grow from 77–89 px to about 118–125 px at 1920×1080. Lands and other non-creature permanents move to a smaller second row, the player header becomes one line, cards resize to fill the space, and small cards get a readable name label. **Recommended default layout: Columns.**

**Status:** Items 1–4 are **Settled** (you delegated them; all are reversible at mockup stage). The default layout and the source of the icons are **Needs Hugo**. **Confidence:** high on 1, 2 and 4. Medium on 3, because what the engine can tell us about each keyword is still unknown.

**The user's goal here:** read the table at a glance and act without hunting. You need to know whose turn it is, what is waiting for you, what each creature can do, and that paying for a spell takes one click.

**French (new ruling):** every label below is sized for French, which runs about 30–35 % longer. Copy is given in English and French. Long text truncates with "…" and shows in full on hover. Icons are a plus here, since they carry no language.

---

## 1. Turn sequence and stops

**What you see normally** (top bar, 56 px):
```
▲ Mira's turn                 Beginning      │        Combat         │
Turn 10 · next: ■ Theo     Upkeep  Draw  Main 1 │Start Attack ▶Block Damage End│ Main 2  End step   [Stops]
⌛ Waiting for you
```
- **Whose turn:** the player's shape plus name ("▲ Mira's turn" / "Tour de Mira"), with "Turn 10 · next: ■ Theo" under it. With 4 players, "next" tells you whose turn follows.
- **Who has priority:** a chip with an hourglass and words. It reads "⌛ Waiting for you" (orange, "À vous de jouer") or "⌛ Waiting for ■ Theo" (neutral, "En attente de Theo"). The same tag shows on that player's header. AI opponents pass priority quickly, so their tag appears only after 400 ms; otherwise it would flicker.
- **The steps:** Upkeep, Draw, Main 1, Combat (Start, Attack, Block, Damage, End), Main 2, End step. In French: Entretien, Pioche, Principale 1, Combat (Début, Attaque, Blocage, Dégâts, Fin), Principale 2, Fin de tour.
  - Untap and Cleanup are dropped: you never get priority there. A discard during cleanup is named in its own prompt.
  - "Begin" is renamed "Start".
  - Small captions name the groups ("Beginning", "Combat").
- **Current step:** a filled pill with ▶. Earlier steps of this turn are in faint text, later ones in normal text. The pill shape carries the meaning, not its colour.
- **No stop marks on the strip.** The yellow dots are gone. The question you actually have at that moment is "if I pass, when do I get to act again?", and the main button now answers it in words: "Pass priority · Next stop: Theo's Attack step" ("Prochain arrêt : Attaque, tour de Theo").
- Hovering a step says, for example: "Upkeep: the game stops here for you on your turns, not on opponents' turns. Click to change." Clicking a step, or the **Stops** button, opens the editor.

**The stops editor** (a panel that drops down over the opponents' area, does not lock the board, and closes with Done or Esc):
```
Stops: where the game waits for you                                            [Done]
                  Upkeep  Draw  Main 1 │ Start Attack Block Damage End │ Main 2  End step
On my turn        [Stop] [Stop] [Stop] │ Pass  [Stop] [Stop] Pass  Pass │ [Stop]  [Stop]
On opponents'      Pass   Pass   Pass  │ Pass  [Stop] [Stop] Pass  Pass │  Pass   [Stop]
turns
Set per opponent ▸     Reset to defaults     Auto-pass when I can't act: Off
```
- Each cell is a toggle written as a word: a filled "Stop" chip, or plain faint "Pass" ("Arrêt" / "Passer"). Clicking changes it straight away; there is no Save.
- The columns line up with the strip's steps.
- "Set per opponent ▸" opens one row per opponent (▲ Mira, ■ Theo, ◆ Ana), which covers Forge's per-player model. If the opponents differ, the shared row shows "Mixed" ("Variable").
- The auto-pass switch stays under the main button, off by default (ruling D4). The editor repeats it.

**Edge cases**
- **1v1:** the second row reads "On opponent's turns".
- **4 players:** nothing grows, because the strip only shows the turn being played.
- **1366 px, or French that doesn't fit:** the top-bar buttons (Log, Display, Keys) drop their words first and keep the key letter plus a tooltip. If space is still short, the combat steps fold into one "Combat" pill outside combat.

**Rules out:** two rows of dots; colour as the only sign that a stop is set; per-player strips like Forge's UP/DR codes.

## 2. Manual payment and floating mana

**Fast path (the default).** You click a castable card, pick targets if it has any, and it is paid at once. The lands tap and the log says which ones. Z undoes. Floating mana is always spent first.

**Paying by hand, two visible ways in:**
1. **Tap sources before casting.** When you have priority, clicking an untapped land or mana creature adds its mana to your pool. Your next spell uses the pool first and auto-pays the rest. This is the Arena convention, and it costs no extra click.
2. **The "Auto-pay mana: On" switch** sits under the auto-pass switch. With it off, every cast opens payment mode.

Payment mode also opens on its own, even with auto-pay on, when the cost includes a choice: X, convoke, delve, Phyrexian mana.

**Payment mode** (in the right panel, where the prompt already lives):
```
Floating   {G} {G}  · empties at end of step
Pay {2}{G} for Cultivate        [✓G][ 2 ]
Click lands or creatures that add mana.
┌ Pay the rest automatically   Space ┐
└ Taps: Forest, Temple Garden        ┘
  Cancel (Esc)   Undo   To my turn
```
- **Cost:** paid symbols are filled with a ✓, unpaid ones are outlined.
- **Sources on the board:** sources that can still pay light up like any card you can click (blue ring plus a notch). Other sources dim. A land with two colours shows a small choice next to it: "Add {G}" / "Add {W}".
- **Paying from the pool:** clicking a pool symbol pays with it.
- **Cancel:** returns the card and untaps the sources.
- **Copy in French:** "Payer le reste automatiquement" fits the button at 1366. The second line of the button wraps to at most two lines.

**Floating mana:**
- Shown in the right panel, directly above the prompt, and only when the pool is not empty. It takes height from Recent, so the persistent buttons never move.
- Mana symbols have distinct shapes. Three or more of one colour show as "{G}×3".
- An opponent's floating mana shows on their header ("Floating {R}{R}") only while it is not empty. This is real game state. It is not the untapped-lands display that ruling ruled out.

**Rules out:** a payment pop-up on every spell; a mana pool always on screen with empty slots (Forge today).

## 3. Keyword icons

**Which keywords get icons**
- **Own icon:** keywords that matter on the battlefield and have an icon in the set. That covers flying, reach, trample, deathtouch, lifelink, vigilance, haste, first strike, double strike, menace, defender, hexproof, indestructible, ward, toxic, plus long-tail ones the set already covers (prowess, exalted, afflict…).
- **Generic icon:** every other battlefield keyword (protection, shroud, infect, annihilator…). These use the set's own "static" or "triggered ability" icon, which keeps the style consistent. Each one is still a separate icon you can hover. Giving one its own icon later is a single mapping entry.
- **No icon:** keywords that only work outside the battlefield (flash, cycling, kicker, flashback, cascade, convoke) and enchant/equip.

**Icon source (Needs Hugo):**
- I recommend the Mana font's "Arena ability symbols". The font is under the SIL Open Font License and its stylesheets are MIT. Arena already shows abilities as icons, so many of your friends will know these shapes. That is evidence of convention, not of quality.
- The symbols are Wizards of the Coast designs, as Forge's mana symbols already are. Please confirm you are comfortable shipping them.

**How the icons look**
- **Shape:** one-colour glyph, 18 px, on a 20 px dark disc with a thin light rim, so it reads over any art. The click area is 24 px.
- **Printed vs added by another card:** a printed keyword is a light glyph on a dark disc. A keyword added by another card is reversed: a dark glyph on a light disc. That difference is in lightness, so it survives colour blindness.
- "Until end of turn" is not drawn differently. Three states would not be learnable at 18 px; the tooltip says it instead.
- No keyword icon may reuse a state icon (sword, shield, target, crown, zz, hourglass). Keyword icons always sit in a disc, so they stay distinct.

**Placement and limits**
- Icons sit in a column on the right edge of the card, stacked upward from just above the power/toughness box. On a card with no P/T they start at the bottom-right corner.
- They cover only the rules-text box, never the art's centre (ruling D11).
- On tapped cards the icons stay upright.
- **How many:** cards 110 px wide or more show up to 3, or 2 plus a "+N" chip. Cards 72–109 px wide show 2, or 1 plus "+N".
- **Order:** keywords added by other cards first, then evasion, combat, protection, then the rest.

**Hover text** (300 ms delay; also reachable by keyboard focus):
```
Flying
Can be blocked only by creatures with flying or reach.
Granted by Swiftfoot Boots · until end of turn
```
- The name includes its value: "Ward {2}", "Protection from red".
- The tooltip is at most 320 px wide and 3 lines; text never gets truncated.
- The 15 keywords with their own icon get lines we write ourselves: at most 70 characters in English, about 90 in French. The long tail uses the engine's reminder text.
- Lines I settle now:

| Keyword | Line |
|---|---|
| Reach | Can block creatures with flying. |
| Trample | Excess combat damage carries over to the player or planeswalker it attacks. |
| Deathtouch | Any damage it deals to a creature destroys it. |
| Lifelink | Damage it deals also gains you that much life. |
| Vigilance | Attacking doesn't tap it. |
| Haste | Can attack and use {T} abilities right away. |
| First strike | Deals combat damage before creatures without it. |
| Double strike | Deals first-strike and regular combat damage. |
| Menace | Can't be blocked except by two or more creatures. |
| Defender | Can't attack. |
| Hexproof | Opponents' spells and abilities can't target it. |
| Indestructible | Damage and "destroy" effects don't destroy it. |
| Ward | Opponents' spells or abilities that target it are countered unless they pay the ward cost. |

**Ways to see the names in words:**
- The inspector lists every keyword with its full text.
- Holding the overlay key (ruling D7) turns the icons into word chips: "Flying · Trample".

**Scope:** keyword icons appear only on permanents on the battlefield, not on cards in hand or on the stack.

## 4. Opponents' cards bigger, space used

**Two size tiers per player area**
- The **creature row** holds creatures, planeswalkers and battles at full size.
- The **support row** holds lands (grouped), other non-creature permanents, and the commander while it is in the command zone, captioned "Command zone · tax +4" like the hand group. It is drawn at 60 % of full size.

**Fill the space**
- Each area picks the largest card size that fits its height and width. The cap is 180 px at 1080p, so a near-empty board doesn't get giant cards.
- **When an area runs out of space:**
  1. The support row shrinks, down to 45 %.
  2. Creatures wrap to a second row.
  3. As a last resort, cards overlap like the staggered hand, so only art is ever covered.
- Cards never go below 72 px.

**One-line opponent header**
```
24 ▲ Mira   Hand 4 · Library 70 · Graveyard 2 · Exile 1   ♛ Krenko 5/21   ⌛
```
The header takes 40 px. It wraps to two lines below 1600 px or when the French doesn't fit ("Bibliothèque 70").

**Name labels**
- Battlefield cards drawn narrower than 150 px get a 12 px label laid over the printed title bar: light text on a dark band, truncated with "…".
- Display has a "Name labels on small cards" switch, on by default.

**Resulting sizes**

| Screen | Opponents (Columns) | Your creatures |
|---|---|---|
| 1920 | about 118–125 px (from 77–89) | about 155 px (from 123); the empty side margins close |
| 1366 | about 75 px (from about 50); labels on, 2 icons | — |
| 2560 | about 157 px; no labels | — |

**Right panel**
- It stays full height and in the same place in every layout, so controls stay where you expect them.
- From top to bottom: the parts that come and go (Stack, Combat, an open zone); then **Recent**, which stretches to fill whatever height is left (at least 3 events); then the action block at the bottom (floating mana, prompt, main button, Undo row, switches).
- The prompt sits directly on top of the button, which closes the 70 px gap.
- Part of the empty space in the screenshot comes from the mock having only 5 log events.

**Display panel:** the Small/Medium/Large card size option is replaced by a **board split** slider (opponents 35–55 %, default 45 %) plus the name-label switch.

**Rules out:** text-only opponent tiles; side panels you drag and dock; shrinking all permanents equally.

## Default layout: Columns (Needs Hugo)

- **Columns** keeps every opponent's whole board visible. It reads left to right in turn order, matching the turn strip, and grows to 5–6 players. With the changes above it matches Table's best card size of 115 px.
- **Rejected, Table:** it shrinks your board to 89 px and only works with exactly 3 opponents.
- **Rejected, Focus:** it hides non-creatures and lands, which breaks the agreed principle that everything you may know is visible. It stays the recommended choice for 5–8 players.

## Other alternatives rejected

- **Stops shown as dots, or as words under every step:** this is the confusion you reported, or clutter.
- **Stop marks on the strip with a legend:** if it needs a legend, the design isn't clear.
- **Always pausing for payment:** one extra press on every spell.
- **Text tags instead of icons for the long tail of keywords:** they don't fit on 75 px cards.
- **A different look for keywords that last only until end of turn:** too many states to learn.
- **Running the opponents' area full width by moving the right panel down:** it would move the stack depending on the layout.

## Cost and risk (my estimate)

| Item | Size |
|---|---|
| Turn strip and stops editor | M |
| Mana payment | M (depends on question 2) |
| Keyword icons | M (depends on question 3) |
| Card sizing | M |

The main risk is the size calculation with long French names and very large token boards. It can be unit-tested like the existing layout maths.

## Proposed rulings for the log

- Stops are a setting, not something to show at a glance: the strip shows game state in words, the pass button names the next stop, and stops are edited in a panel with words in every cell.
- Paying is automatic and immediate; you pay by hand by tapping sources first or by switching auto-pay off. Floating mana appears only when it exists.
- Keyword icons come from one set and appear only for keywords that matter on the battlefield. Keywords added by other cards are drawn in reverse colours. Every icon can be hovered and has a version in words.
- Battlefield cards fill their space in two tiers (creatures first). Below 150 px a card gets a readable name label.
- All copy must fit in French; when it doesn't, truncate with the full text on hover, never shrink the font.

## Questions for the orchestrator

1. What are Forge's default stops per step? Does Forge still give priority in a "Pass" step when something is on the stack? This decides the editor's defaults and its help line.
2. Can the bridge auto-pay right at cast, spend the pool first, and preview which sources auto-pay will tap ("Taps: …")?
3. For each keyword on a permanent, does the engine expose: printed or added, its source, how long it lasts, keywords a card has lost, and reminder text in French?

Sources:
- [Mana font icon list and license](https://mana.andrewgioia.com/icons.html)
- [MagicArena Wiki: Abilities (Arena depicts abilities as icons)](https://magicarena.fandom.com/wiki/Abilities)
