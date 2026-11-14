# Card-rules report, group g4 (Aminatou, Guff, Tam, Vnwxt)

Saved by the orchestrator from the agent's final message (the agent could not write files here).
Test class: `.claude/worktrees/cards-g4/forge-gui-desktop/src/test/java/forge/ai/G4DeckCardsTest.java` (copy: `scratchpad/cards/g4src/G4DeckCardsTest.java`). Final run: 71 tests, 4 failures (all from the two bugs), 2 tests disabled (AI/harness artifacts). Log: `scratchpad/cards/g4-mvn.log`.
Command: `mvn -o -B -pl forge-gui-desktop -am test -Dtest=G4DeckCardsTest -Dsurefire.failIfNoSpecifiedTests=false -Dcheckstyle.skip`

## Confirmed bugs

### 1. Garruk, Veiled Butcher: "would die" replacement catches opponents' creature cards from any zone (KNOWN upstream: issue 12143 open, fix in PR 12218 open — both verified by orchestrator)
- Oracle: "If a creature an opponent controls would die, exile it instead."
- Expected: "die" = battlefield → graveyard (CR 700.4); discard (701.9), mill (701.17), cleanup discard (514.1) unaffected.
- Actual: the replacement fires for any move to graveyard, then does `ChangeZone Origin$ Battlefield → Exile`, which cannot move a card from hand or library → the card stays where it is, while the log says it was discarded/milled.
  - Garruk's own −3 (4 players): opponent with Grizzly Bears ×2 keeps both; opponent with Forest + Bears discards only the Forest.
  - Jace, Wielder of Mysteries +1 on a library of creatures: nothing milled.
  - Cleanup: opponent with 10 creature cards ends turn still holding 10 (no hang).
  - Control: destroyed opponent creature correctly exiled.
- Tests failing: `garrukVeiledButcherMinusThreeCountsOpponents`, `garrukVeiledButcherDoesNotStopOpponentMill`, `garrukVeiledButcherDoesNotStopCleanupDiscard`. Control `garrukVeiledButcherOpponentCreatureDiesIsExiled` passes.
- Root cause (verified): `forge-gui/res/cardsfolder/g/garruk_veiled_butcher.txt:5` lacks `Origin$ Battlefield` (peer cards Gisa, Liesa, Corpseweaver Prodigy, Head of the Hunt, Misery's Shadow, Nemata have it); `:6` replacement is `Origin$ Battlefield`.
- Severity: changes game outcome (opponents can't discard/mill creature cards; hand size not enforced).

### 2. Narset Transcendent −2: rebound grant does not expire at end of turn (NEW, not found upstream)
- Oracle: "When you cast your next instant or sorcery spell from your hand this turn, it gains rebound."
- Actual: Opt cast from hand on a later turn gains rebound and is exiled.
- Test failing: `narsetTranscendentReboundExpiresAtEndOfTurn`; control `narsetTranscendentReboundSameTurn` passes.
- Root cause (verified): `forge-gui/res/cardsfolder/n/narset_transcendent.txt:8` lacks `ThisTurn$ True` → `DelayedTriggerEffect.java:93-94` registers a permanent delayed trigger instead of a this-turn one (`:87-88`). 35 of 38 `DelayedTrigger` + `Mode$ SpellCast` scripts carry the flag; Bloodrage Alpha and Tenacious Pup have no "this turn" in Oracle.
- Fix: add `ThisTurn$ True`. Severity: minor.

## Suspected / not rules bugs
- Gatewatch Beacon: AI never moves the counter (`CountersMoveAi.java:201-202` returns CantPlayAi for this untargeted move). Human gets the prompt; human path untested. AI weakness, not rules.
- AI never fires a planeswalker ultimate that leaves it at exactly 0 loyalty (Aminatou −6 at 6, Tevesh −10 at 10, Vraska −9 at 9). With +1 loyalty all resolve correctly. AI cost policy, not rules.

## Tested and correct (57 cards)
Aminatou (+1, −1 on owned-but-opponent-controlled permanent, −6 rotation in 4p); Bucknard's Everfull Purse (control passes right); Commodore Guff (−3 with 3 walkers: draw 3, each opp 20→17; end-step +1 loyalty); Tam (proliferate ×2 for 2 PW types; PW spells cost 1 less); Vnwxt (Divination draws 4 at max speed); Teferi's Ageless Insight + Vnwxt compound (8), first draw-step draw not replaced; Doubling Season (double loyalty on ETB, +2 cost not doubled); Lae'zel; Carth; Oath of Teferi (2 activations, 3rd refused); Elspeth, Storm Slayer + Doubling Season (4 Soldiers); Sanctum Lurker; Ichormoon Gauntlet; Teferi, Hero of Dominaria −3; Spark Double on a PW; Semester's End; All Will Be One; Ajani Unrelenting; Tevesh Szat −10 (takes commanders incl. command zone); Midnight Clock; Out of Time; Dakkon; Teferi, Temporal Pilgrim; Will Kenrith; Minsc & Boo −2; Enduring Curiosity; The Chain Veil; Windfall; Vraska −9; Brokers Ascendancy; Narset, Parter of Veils; Narset Transcendent +1 and same-turn −2; Jace, Wielder of Mysteries + Vnwxt empty-library win; Psychosis Crawler + Vnwxt (4p); Alandra; Kaya, Ghost Assassin −1 (4p); Nicol Bolas, God-Pharaoh +1 (4p); Chandra, Awakened Inferno +2; Necromancy; Sea of Clouds / Morphic Pool (3p untapped); Chandra, Legacy of Fire end step; Ajani Steadfast −2; Chasm Skulker; Teferi, Time Raveler; The Wandering Emperor; Way of the Pyromancer; Fierce Guardianship; Forge of Heroes; Teferi, Temporal Archmage emblem; Oko −5; Nicol Bolas, Planeswalker steal persists; Resourceful Defense; Triskaidekaphile; Body of Knowledge; Ominous Seas; Vanquish the Horde; Teyo +1; Jace, the Mind Sculptor.

## Not tested (~134)
- ~70 simple (lands, Signets/Talismans, counterspells, wipes, unblockable 1-drops).
- Combat-dependent: Jaya's Phoenix, Leori, Mila, Mangara, Sarkhan the Masterless, Grateful Apparition, Thrummingbird; Bident of Thassa, Coastal Piracy, Reconnaissance Mission, Malcolm, Silent Hallcreeper, Shoreline Looter; Twenty-Toed Toad, Coveted Jewel, Propaganda, Norn's Annex, Onakke Oathkeeper, Silent Arbiter.
- Higher-risk, time-boxed out: Jace, Multiverse Architect; The Theorist; Vronos; Chandra, Legacy of Fire [0]; Karn Liberated −14; Tamiyos; Wrenn and Realmbreaker; Wrenn and Six; Kaya [0]; Nexus Mentality; Expansion Algorithm; Ripples of Potential; Urza Assembles the Titans; The Legend of Yangchen; The Rise of Sozin; Invasions; Wishclaw Talisman; "second card each turn" token makers; Proft's Eidetic Memory; Wizard Class; Racers' Scoreboard; Aether Syphon.

## Harness limits
1. Shared `~/.m2` artifacts need `-am`. 2. `playUntilStackClear` stops before pending triggers (added `resolveAll()`; fixed 6 false failures). 3. AI spends free loyalty activations during phase advances; AI declines optional triggers. 4. AI won't pay a loyalty cost to 0. 5. `canPlay()` ignores "can't be cast" statics (`checkRestrictions()`). 6. Psychosis Crawler 0/0 with empty hand (artifact; test replaced). 7. Hand-set targets skip legality checks (per-opponent targeting cards left untested). 8. Human prompts for optional triggers not exercised.
