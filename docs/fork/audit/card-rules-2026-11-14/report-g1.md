# Card-rules report, group g1 (Kaalia, Henzie, Henzie Goon, Teysa)

Saved by the orchestrator from the agent's final message (the agent could not write files here).
Test class: `.claude/worktrees/agent-acbaabadb51eb153d/forge-gui-desktop/src/test/java/forge/cards/G1DeckCardsTest.java` (87 tests, uncommitted; worktree detached at 29bf33f7a5b, sources identical to cards-g1). Final run: 87 tests, 2 failures (both AI choices). Log: `scratchpad/cards/g1-mvn.log`.
Command: `mvn -o -B -am -pl forge-gui-desktop test -Dtest=G1DeckCardsTest -Dsurefire.failIfNoSpecifiedTests=false` (~45 s; no install).

**Headline: no rules-engine bug found in the high-risk cards of these decks.** Kaalia engine (incl. Isshin), Henzie blitz (cost reduction, end-step sac, draw, blitz from graveyard via Chainer), Teysa Karlov / Delney / Mondrak multipliers, life-loss and damage doubling (Bloodletter, Archfiend of Despair, Gray Merchant, Twinflame + Gisela), "each opponent" wording in 4p all correct.

## Confirmed defects (not engine-rules bugs)

### 1. Hapatra, the Desert Fang: AI picks no target for its ETB (card script AI hint missing)
- Oracle: "When Hapatra enters, for each opponent, put X -1/-1 counters on up to one target creature that player controls, where X is the greatest mana value among cards in your graveyard."
- Actual: log `p0 triggered Hapatra, the Desert Fang targeting []`; all three opposing Serra Angels survive. With targets set by hand, the engine kills one 4/4 per opponent (X=6) — engine correct.
- Tests: `hapatraPutsCountersOnOneCreaturePerOpponent` fails (AI behaviour); `hapatraTriggerWithChosenTargetsKillsOneCreaturePerOpponent` passes.
- Root cause (script line verified by orchestrator): `forge-gui/res/cardsfolder/h/hapatra_the_desert_fang.txt:6` (`DB$ PutCounter … CounterType$ M1M1`) lacks `IsCurse$ True`; `SpellAbility.isCurse()` checks only that param (`SpellAbility.java:810-811`) → `CountersPutAi.doTriggerNoCost` (`CountersPutAi.java:743`) treats counters as a bonus, looks only at AI's own creatures (~823), finds none, stops (~851). Comparable: `i/ifnir_deadlands.txt:6` has the flag. Fix: add `IsCurse$ True`.
- Upstream: no issue. Severity: minor, AI-piloted decks only.

### 2. Boggart Trawler: rules text says "Goblin Trawler" (cosmetic)
- `b/boggart_trawler_boggart_bog.txt:8` Oracle line reads "When Goblin Trawler enters, exile target player's graveyard." (verified). Upstream issue 6106 (closed) is a different AI problem.

## Suspected, not confirmed
- Sneak Attack: AI declined the "you may" on resolution, Serra Angel stayed in hand; haste and end-step sacrifice never reached. `ComputerUtil.playStack` refused to activate it with one Mountain. Possibly AI weakness; not established (Kaalia's similar effect works). Test `sneakAttackPutsCreatureWithHasteAndSacrificesIt` fails.
- Henzie: blitz option offered for small creatures; the "MV 4 or greater" check happens only once on the stack (`CardFactoryUtil.java:2697-2698`, `PlaySpellAbility.java:680`), cast correctly rejected. A human may see a "Blitz" option on a 2-drop that then fails. Desktop UI not checked.

## Tested and correct (~75 cards)
- Kaalia deck: Kaalia (4p, Angel tapped+attacking same opponent); Kaalia + Isshin (twice); Bloodletter of Aclazotz (6 on your turn, 3 on theirs); Bloodletter + Archfiend of Despair (12, opp at 2); Bloodletter + Gray Merchant (each opp −10, you +30); Archfiend of Despair (no lifegain); Twinflame Tyrant + Gisela, Blade of Goldnight (Bolt = 12; own damage not doubled); Gisela prevention; Liesa, Forgotten Archangel; Archfiend of Depravity; Avacyn, Angel of Hope; Serra's Emissary; Grand Abolisher; Teferi's Protection; Blast-Furnace Hellkite; Aurelia, the Warleader; Dragon Tempest + Twinflame; Terror of the Peaks; Hellkite Tyrant; Balefire Dragon; Archon of Cruelty (4p); Valgavoth, Terror Eater; Vilis, Broker of Blood; Kokusho (4p).
- Henzie decks: Henzie in Commander game after 2 casts (Kokusho blitz w/ 4 Swamps, haste, end-step sac, drains 5 per opp, blitz draw); Henzie + Chainer blitz from graveyard (upstream issue 4725 fixed here); Chainer haste; Mikaeus, the Unhallowed; Massacre Wurm (4p); Vaultborn Tyrant; Myojin of Night's Reach; Enduring Courage; The Notary Hobbits; Rampant Rejuvenator; Lizard, Connors's Curse; Avacyn, Angel of Horror; Rottenmouth Viper (4p); Kardur, Doomscourge; Ilharg, the Raze-Boar; Shadowgrange Archfiend (4p); Old One Eye; Metamorphosis Fanatic; Living Death; Bringer of the Last Gift; Daemogoth Woe-Eater; Dusk Mangler (4p); Wasteland Raider; Sheoldred ETB; Etali, Primal Conqueror (4p, all 4 cast free); Ojer Kaslem; Vaevictis Asmadi (4p); Junji, the Midnight Sky; Necron Deathmark; Aerid Konstrari; Kogla, the Titan Ape.
- Teysa deck: Teysa Karlov + Zulaport Cutthroat / afterlife / Skullclamp / Pitiless Plunderer; Delney + Wriggling Grub (4 Worms); Delney + Teysa Karlov + Mondrak (12 Worms); Delney + Elas il-Kor; Teysa, Orzhov Scion; Kambal, Profiteering Mayor (4p, + Mondrak); Endless Foot Assault (4p, + Mondrak); Welcoming Vampire; Elas il-Kor; Marionette Apprentice; Lotho, Corrupt Shirriff; Jadar, Ghoulcaller of Nephalia; Not Dead After All; Bloodghast; Nine-Lives Familiar; Tombstone Stairwell; Orcish Bowmasters; Ophiomancer; Grave Venerations; The Meathook Massacre; Woe Strider.

## Not tested (~200 of 278)
- ~160 low risk (≈95 lands, mana rocks/creatures, simple removal, tutors).
- Higher risk, out of time: Deadpool (text box exchange), Gwenom, Incinerator of the Guilty (collect evidence), Incarnation Technique (demonstrate), Sowing Mycospawn (kicker), Plumb the Forbidden, squad copies, Indebted Spirit with bestow, Gisela + Bruna meld, Sephara alt cost; opponent-choice cards (Rakdos, Patron of Chaos; Braids, Arisen Nightmare; Black Market Connections; Esper Sentinel; Smothering Tithe); AI-chosen costs (Birthing Pod, Birthing Ritual, Survival of the Fittest, Greater Good, Yawgmoth, Razaketh); Kona, Rescue Beastie; Bloodthirster attack restriction; Funeral Room unlock; "choose both" of Szat's Will / Will of the Abzan; Teysa Karlov with "only once each turn" triggers (e.g. Morbid Opportunist) — ruling uncertain.

## Harness limits
- Agent confined to its own worktree (writes to cards-g1 refused).
- Shared `~/.m2` POMs reference unresolved `${revision}` parent → use `-am`.
- AI makes every "may" choice and target; checked the AI actually attacked before asserting combat; hand-set targets where AI declined.
- Most spells stacked without paying costs (still real casts for cast triggers); Myojin, Nine-Lives Familiar and blitz casts paid real mana; additional costs not paid where an ability was stacked directly (Chainer's discard, Sneak Attack's {R}).
- Own wrong expectations, fixed (not bugs): Zulaport and Kambal gain 1 per trigger; Archfiend of Despair blocks `setLife` raises (CR 119.5).
