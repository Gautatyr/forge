# Card-rules report, group g5 (Imotekh, Sythis, Lorehold)

Saved by the orchestrator from the agent's final message. Test class: `tests/G5DeckCardsTest.java` (originally in worktree `agent-addf5e0e77ff80eff`, detached at 29bf33f7a5b). Final run: 61 tests, 2 failures (the bug below), 2 skipped (Anrakyr and Nim Deathmantle: the AI declined an optional payment), 57 passed.
Command: `mvn -o -B -pl forge-gui-desktop -am test -Dtest=G5DeckCardsTest -Dsurefire.failIfNoSpecifiedTests=false`

## Confirmed bug: casting a card from a graveyard never fires "one or more cards leave your graveyard" triggers
- Cards: Imotekh the Stormlord via Anrakyr the Traveller (Imotekh deck). Engine-level: every `Mode$ ChangesZoneAll | Origin$ Graveyard` trigger is affected (56 card scripts at this commit, e.g. Tormod the Desecrator, Quintorius, Desecrated Tomb, Chalk Outline, Kheru Goldkeeper), via flashback, Muldrotha, Gravecrawler-style casts, etc.
- Oracle (Imotekh): "Whenever one or more artifact cards leave your graveyard, create two 2/2 black Necron Warrior artifact creature tokens."
- Expected (CR 601.2a): casting moves the card from the graveyard to the stack, so it leaves the graveyard and the trigger fires.
- Actual: the spell resolves; no tokens.
- Tests failing: `imotekhTriggersWhenArtifactIsCastFromGraveyard` (Imotekh + Muldrotha, cast Sol Ring from graveyard: expected 2 tokens, got 0); `leaveGraveyardTriggerOnFlashbackCast` (Tormod, the Desecrator + Strike It Rich flashback: expected 1 Zombie, got 0).
- Controls passing (effect moves the card): `leaveGraveyardTriggerControlViaEffect` (Regrowth + Tormod), `imotekhTriggersWhenArtifactCardReturnedFromGraveyard`, `imotekhTriggersOnUnearth`, `imotekhTriggersOnceWhenSeveralArtifactCardsLeaveTogether`, `imotekhWithMyrRetrieverChain`, `imotekhWithLivingDeath`.
- Root cause (verified by orchestrator): `ChangesZoneAll` triggers run only from `CardZoneTable.triggerChangesZoneAll` (`CardZoneTable.java:100-134`, per agent). A move is recorded in the table only when its params carry `AbilityKey.InternalTriggerTable` (`GameAction.storeChangesZoneAll`, `GameAction.java:741-745`). `GameAction.moveToStack(Card, SpellAbility)` (`GameAction.java:854-858`) passes only the last-state params, no table. All cast paths use it: human `PlaySpellAbility.java:625`, AI `ComputerUtil.java:118`, `MagicStack.java:144`, `PlayerControllerAi.java:1489`. `PlaySpellAbility` already builds a `CardZoneTable` at line 526 for cost payments (triggered at 559) but not for the cast move itself.
- Upstream: no matching issue (searched Imotekh, "leave your graveyard", Tormod the Desecrator, Quintorius, Desecrated Tomb, Chalk Outline, Kheru Goldkeeper).
- Severity: changes game outcome (each Anrakyr recast from graveyard loses two 2/2s).
- Fix direction: record the move to the stack in a `CardZoneTable` and trigger it once the spell is on the stack. Acceptance: both failing tests pass; one trigger per cast; no trigger when casting from hand; none when a cast is cancelled/rolled back.

## Ruled out
- Cost reducers "not stacking": test error (Glorious Anthem has only one generic mana). With Ghostly Prison, Herald of the Pantheon + Jukai Naturalist reduce {2}{W} to {W}.
- Lorehold opponent-upkeep loot: trigger goes on the stack; AI declines the optional discard.

## Tested and correct (58 cards)
Imotekh (return from graveyard = 2 tokens; Tormod's Crypt exiling two artifacts = 2 not 4; artifact token dying doesn't trigger; Unearth, Myr Retriever, Living Death trigger; Grand Strategist pumps another artifact creature); Lorehold (miracle on first-drawn instant; native miracle same; Approach of the Second Sun via granted miracle counts as cast from hand and wins; sorcery via miracle on opponent's upkeep); Approach of the Second Sun; Sythis; Monument to Endurance (3p); Library of Leng + Monument; Song of the Dryads (CR 305.7); Olórin's Searing Light (3p); Tragic Arrogance (3p); Promise of Loyalty (3p); Hit the Mother Lode; Strength of the Harvest; Isolated Watchtower (3p); Hallowed Haunting; Valakut Awakening; Necropotence; Karmic Justice; Darksteel Mutation on Sythis; Ancestral Mask; Chandra's Ignition (3p); Volcanic Vision; Immolating Gyre; Storm Herd; Technomancer; Psychomancer + Chronomancer; Currency Converter; Mimic Vat; Scrap Trawler; Rebuff the Wicked; Stroke of Midnight (3p); Herald of the Pantheon + Jukai Naturalist; Kenrith's Transformation; Lignify; Authority of the Consuls; Eidolon of Blossoms + Setessan Champion + Valgavoth's Lair; Palantír of Orthanc; Dread Return flashback; Triarch Praetorian unearth; Sculpting Steel; Perch Protection (gift forced); Dawn's Truce (gift forced); Fertile Ground + Mirari's Wake; Sanctum Weaver; Flickering Ward; Flare of Fortitude; Destiny Spinner; Heliod + Cleric Class.

## Not tested (~111)
- Mostly low risk (lands, rocks, vanilla bodies, simple removal/protection).
- AI declined optional payment: Anrakyr (6 life), Nim Deathmantle ({4}).
- Need combat / several AI turns: Ghostly Prison, Sphere of Safety, Elephant Grass, Promise of Loyalty vow restriction; Luminarch Ascension, Emeria's Call; Generous Plunderer, Senu, Fated Clash, Armix.
- AI-choice cards: Call Forth the Tempest, Creative Technique, Dance with Calamity, Improvisation Capstone; Redirect Lightning, Bolt Bend, Untimely Malfunction; The Mycosynth Gardens X copy.

## Harness limits
`${revision}` POM problem (use `-am`); `playUntilStackClear` stops before post-resolution triggers (added `resolveAll()`; all 7 first-run failures were this); `getFirstSpellAbility()` returns a permanent's cast spell, not its activated ability; face-down exiled cards have no name; `playStack` picks no charm modes and pays no optional costs (gift forced by hand); AI makes every "you may" choice; no real Commander game built (command zone, tax, commander damage untested).
