# Mockup review 1 (2026-10-15)

The owner's review of the first match-screen mockup ([mockup-notes.md](mockup-notes.md)), plus the orchestrator's review. Rulings that came out of it are folded into [match-screen-decisions.md](match-screen-decisions.md).

## Owner's verdict
"The design as a first draft is nice", and the 4-player view "looks clearer than original". A cool first prototype that needs a lot of work to be usable.

## Owner's comments
1. Good first draft; the 4-player view is clearer than the Swing client.
2. **Keyword icons with explanations.** Cards with keyword abilities (haste, flying, trample, …) should show an icon per keyword. Hovering an icon explains what it represents, with a short summary of the effect.
3. **The turn sequence at the top is unclear,** especially the small yellow dots (the phase stops).
4. **Target highlights.** The rings around targeted cards are a good idea, but showing the targets of every stack item at once gets messy as the stack grows. Show targets for the item that is playing (resolving), not for all of them.
5. **Bug: side panel does not scroll.** When a graveyard or exile pile is displayed, the side panel itself cannot scroll, so the recent log is hidden.
6. **Bug: the UI scale slider applies live** while dragging, so the layout resizes constantly and the slider is painful to use.
7. **Stable button positions.** Contextual buttons may appear and disappear, but buttons that are always present must stay in the same place. Today Undo moves around as other buttons appear, so the cursor has to chase it.

## Answers to the mockup's open questions
| # | Question | Answer |
|---|---|---|
| 1 | Focus layout: switch automatically to the attacking/active opponent? | Applies to the Focus layout. The opponent whose turn it is should be the focused one by default. |
| 2 | Board split 45% opponents / 55% you? | Good default, but configurable. |
| 3 | How should phase stops be shown? | Owner doesn't know: product to propose and decide. |
| 4 | Beyond 9 cards: shrink first or stagger? | Stagger right away. |
| 5 | Where do manual mana payment and floating mana go? | Product to figure out and decide. |
| 6 | Show opponents' untapped mana by colour? | No: the Swing client doesn't, and its usefulness in game is doubtful. |

## Orchestrator's review (owner agrees)
1. Opponents' cards are too small to read without hovering (77–89 px wide in Columns). This is the central problem of a 4-player screen.
2. Space is underused: wide empty margins around your board, and a large empty gap in the right column between the log and the prompt. Use it for bigger cards.
3. The phase stops (two rows of dots per step) break the "words over symbols" principle.
