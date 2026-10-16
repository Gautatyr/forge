# Playtest 1 (2026-10-16 morning)

Owner's first real game in the web match screen: Commander, 4 players (owner vs 3 AIs), 40 life, started with `make play` from Forge's lobby. **Verdict: looks and feels good, but gameplay bugs make it unplayable.** The game was abandoned.

## Owner's review (paraphrased in order; quotes kept where useful)
1. No music during the game.
2. Coin toss text reads "Odinn, you have won the coin toss. Choose exactly 1": drop "choose exactly 1"; ask who starts.
3. The first London mulligan is free (Commander), yet a "put 0 cards on the bottom" prompt still appears: a popup with nothing to do.
4. The starting player drew a card on their first turn. **This is correct:** CR 103.8a skips that draw only in two-player games; CR 103.8c: "In all other multiplayer games, no player skips the draw step of their first turn."
5. The step names in the top bar must be the official ones.
6. The hover preview shows on the left or the right depending on the card's position in the hand. Switching gaze side to side is annoying; it should stay in one place.
7. Opponents' commanders are drawn on their board as if they were in play. Feels like they're on the battlefield. A hover on a command-zone chip in the opponent's header is enough.
8. Played a land with an ability, tapped it, undid twice: the land stayed visually tapped although it could be used again (state not refreshed after undo).
9. Szarekh attacked: no mill 3, no choice of a milled card.
10. Sometimes, after playing a land, its preview stays on screen until another card is hovered.
11. (Same as 8: the land still shows tapped later, although it plays normally.)
12. Phyrexian Arena: no upkeep trigger.
13. Gray Merchant of Asphodel: its effect didn't trigger. "It is making this unplayable."
14. Blocking: possible blockers are lit without checking rules like flying, so creatures that can't block are lit.
15. Wanted: a large view of the graveyard or exile to search through cards.
16. Anrakyr the Traveller's attack trigger didn't appear on the stack.
17. Side panels get too small when several are open; they need a bigger minimum size.
18. Triarch Praetorian returned from the graveyard to the battlefield: no "lose 2 life, draw 2".

## Triage
- **P0, triggers:** 9, 12, 13, 16 and 18 are all triggered abilities controlled by the human seat. The engine resolves them in the Swing screen, so the suspect is the bridge's handling of the human seat's triggers (ordering or confirming triggers, or how replies map back).
- **P0, state sync:** 8 and 11 (view not refreshed after undo); 10 (stale preview).
- **P1, rules-correct highlights:** 14 (use the engine's legality, not a local guess).
- **P1, UX and copy:** 1, 2, 3, 5, 6, 7, 15, 17.
- **No change:** 4.
