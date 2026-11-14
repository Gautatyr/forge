# Card-rules report, group g3 (Pod Acererak, Pod Fynn, Pod Kodama Toggo, Prosper)

Saved by the orchestrator from the agent's final message. Test class: `tests/G3CardsTest.java` (originally in worktree `agent-a63049210978e6a01`, detached at 29bf33f7a5b). Final run: 72 tests, 0 failures, 0 errors, 0 skipped.
Command: `mvn -o -B -pl forge-gui-desktop -am test -Dtest=G3CardsTest -Dsurefire.failIfNoSpecifiedTests=false`

## Confirmed bugs
None.

## Ruled out (test expectations were wrong, engine right)
- Cabal Stronghold + Urborg, Tomb of Yawgmoth: counts 5 basic Swamps (2 Swamps + 3 basic Forests made Swamps by Urborg). Correct: a basic land with the Swamp subtype is a basic Swamp. Urborg itself (non-basic) excluded.
- Ragavan, Nimble Pilferer + Prosper: a "missing" Treasure was spent by the AI on {G}. Ragavan's Oracle gives no any-color permission; behaviour correct. With a Forest available, Pact Boon fires.

## Tested and correct (77 cards)
- Prosper deck: Prosper, Tome-Bound (Mystic Arcanum exile castable; Pact Boon on cast and on land play from exile; playable through next turn, not after); Xorn (+ Prosper = 2 Treasures; + Academy Manufactor both legal orders, CR 616.1); Academy Manufactor; Grim Hireling; Wild-Magic Sorcerer (cascade from exile, both spells trigger Pact Boon); Revel in Riches (3p, win at 10 Treasures); Laelia, the Blade Reforged; Uba Mask; Theater of Horrors; Hurl Through Hell; Dauthi Voidwalker; Marionette Master + Mayhem Devil; Vance's Blasting Cannons; Light Up the Stage; Goldspan Dragon; Ragavan; Stolen Strategy (3p); Opposition Agent; Praetor's Grasp (weak check); Treasure Vault; Share the Spoils (3p); Chandra, Fire Artisan (damage = counters actually removed).
- Fynn deck: Fynn, the Fangbearer (alone 2 poison; + Tyrranax Rex + Ohran Frostfang 6 poison/8 damage; + Triumph of the Hordes 4 poison, no life loss; + animated Inkmoth Nexus 3 poison); Ohran Frostfang; Venerated Rotpriest + Infectious Bite (3p); Glistening Sphere; Ram Through + Saryth + Bloated Contaminator (excess trample to controller); Evolution Sage; Tribute to the World Tree; Guardian Project; Oakhame Adversary (3p).
- Kodama/Toggo deck: Kodama of the East Tree (equal-or-lower MV, no re-trigger; + Toggo one land = 3 Forests + 3 Rocks); Toggo (landfall Rock; Rock ability 2 damage + sac); partner Commander game (2 commanders in command zone, Toggo cast from there, tax tracked separately); Tannuk, Memorial Ensign + Ancient Greenwarden (2 triggers, 2 damage each opp, exactly 1 draw); Ancient Greenwarden + Tireless Tracker / Valakut Exploration; Scute Swarm; Avenger of Zendikar; Azusa + Mina and Denn (4 land plays); Valakut Exploration; Omnath, Locus of Rage; Rampage of the Clans (3p).
- Acererak deck: Acererak the Archlich (ETB bounce + venture; attack in 4p = 3 Zombies); The Sibsig Ceremony (+ Acererak either order); Diregraf Colossus; Endless Ranks of the Dead; The Darkness Crystal; Aetherflux Reservoir (1+2+3); K'rrik; Crypt Ghast; Feed the Swarm; Bolas's Citadel; Urborg + Defile; Tendrils of Agony (storm 2 = 3 copies, 6 drained); Bontu's Monument (3p); Noxious Ghoul; Gravecrawler; Accursed Marauder (4p); Death Baron + Undead Warchief; Blasphemous Edict; Witch's Cottage; Heartless Summoning; Jhoira's Familiar + Cabal Paladin; Zul Ashur, Lich Lord; Go for the Throat.

## Not tested (156)
- ~70 simple (lands, fetches, rocks, Medallions, Talismans, tutors, plain removal, draw, ramp, Fog, Snakeskin Veil, Tamiyo's Safekeeping, keyword-only creatures).
- AI-choice driven: Liliana of the Dark Realms, Tinybones Joins Up, Insatiable Avarice, Planewide Celebration, Diamond Mare, Prism Ring, Cloud Key, Semblance Anvil, Outpost Siege, Etali, Chandra, Torch of Defiance. Harness can't drive: Mindleecher (mutate), Noxious Assault (block), Dream Devourer (foretell).
- Out of time: Kodama — Spelunking (needs firm ruling on enters-tapped ordering), Conduit of Worlds, Ramunap Excavator, Crucible of Worlds, Ghirapur Aether Grid, Inspiring Statuary, artifact-ETB payoffs (Ingenious Artillerist, Hedron Detonator, Reckless Fireweaver, Weftstalker Ardent, Sarinth Steelseeker, Quicksmith Genius), Lotus Cobra, Spitfire Lagac, Tunneling Geopede, Rampaging Baloths, Zendikar's Roil, Khalni Heart Expedition, Tireless Provisioner. Fynn — Contagion Clasp, Karn's Bastion, Smell Fear, Thirsting Roots, Unnatural Restoration, Bow of Nylea. Acererak — Toxic Deluge, Mutilate, Damnation. Prosper — Throes of Chaos, Bituminous Blast, Commune with Lava, Ignite the Future, You Find Some Prisoners, Valki. ~20 more one-offs.
- Not reachable: Acererak's "completed Tomb of Annihilation" branch.

## Harness limits
1. `AITest.addCard` doesn't register triggers or the last-known battlefield → pre-placed permanents' ETB/landfall never fire. Fix: `sync()` = `checkStateEffects`, `resetActiveTriggers(false, null)`, `copyLastState()`.
2. `playUntilStackClear` stops before SBAs and the last resolution's triggers. Fix: loop SBAs, `addAllTriggeredAbilitiesToStack`, `mainLoopStep`.
3. AI makes its own legal choices (spent a Treasure as mana, attacked during a phase walk, sacrificed Accursed Marauder itself, refused Unexpected Windfall's discard).
4. "May play" permissions appear only after a static-ability check; `addPoisonCounters` needs a counter table; `sacrifice` needs a params map.
5. AI picks its own attacks in combat tests (opponents given empty boards; poison summed over all opponents).
