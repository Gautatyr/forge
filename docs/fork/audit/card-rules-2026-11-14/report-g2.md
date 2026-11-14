# Card-rules report, group g2 (Norn, Veyran, Jodah, Zhulodok)

Saved by the orchestrator from the agent's final message (the agent could not write files here).
Test class: `scratchpad/cards/g2-G2CardRulesTest.java` (originally `forge-gui-desktop/src/test/java/forge/ai/g2/G2CardRulesTest.java` in worktree `.claude/worktrees/agent-af9a15caef63a1740`, detached at 29bf33f7a5b). 26 tests: 24 pass, 2 fail = the bugs below.
Command: `mvn -o -B -pl forge-gui-desktop -am test -Dtest=G2CardRulesTest -Dsurefire.failIfNoSpecifiedTests=false` (`-am` needed: installed poms keep an unresolved `${revision}`).
Setup: 4-player game, all AI, each on its own team; spells cast via `ComputerUtil.playStack` (costs really paid); helper resolves the stack including pending triggers.

## Confirmed bugs

### 1. Fiend Hunter + Elesh Norn, Mother of Machines (or Panharmonicon): only the last exiled creature returns
- Oracle: "When Fiend Hunter enters, you may exile another target creature. When Fiend Hunter leaves the battlefield, return the exiled card to the battlefield under its owner's control."
- Expected (CR 607.2a, linked abilities): every creature exiled by the doubled ETB returns.
- Actual: both exiled; when Fiend Hunter dies only Hill Giant (second exiled) returns; Grizzly Bears stays in exile forever.
- Test: `fiendHunterDoubledByNornReturnsBothCreatures` fails (`expected:<1> but was:<0>`); control `fiendHunterControlWithoutNornReturnsCreature` passes.
- Repro: Hugo controls Norn; opponent has Grizzly Bears + Hill Giant; cast Fiend Hunter (both exiled); Lightning Bolt the Hunter → only Hill Giant returns.
- Root cause (verified by orchestrator): `forge-gui/res/cardsfolder/f/fiend_hunter.txt:6` has `ForgetOtherRemembered$ True` → `ChangeZoneEffect.java:517-518` `hostCard.clearRemembered()` wipes the first exile; return uses `Defined$ DirectRemembered` (line 8).
- Upstream: no issue found.
- Severity: changes game outcome (temporary removal becomes permanent).
- Note: 65 card scripts use `ForgetOtherRemembered`; not reviewed for the same pattern.

### 2. Skyclave Apparition + Norn: each owner gets a token sized to the total of all exiled cards
- Oracle: "...the exiled card's owner creates an X/X blue Illusion creature token, where X is the mana value of the exiled card."
- Expected (CR 607.2a reading): opp1 (lost Grizzly Bears, MV 2) gets a 2/2; opp2 (lost Hill Giant, MV 4) gets a 4/4.
- Actual: each gets one 6/6.
- Test: `skyclaveApparitionDoubledByNorn` fails (`expected:<2> but was:<6>`).
- Root cause (verified): `skyclave_apparition.txt:8` `TokenOwner$ RememberedOwner` (one token per owner) with `:10` `X:Remembered$CardManaCost` summing all remembered cards (`AbilityUtils.java:509`, per agent).
- Upstream: no issue. Severity: changes game outcome. Caveat: no official ruling for the doubled case; a 6/6 for losing a 2-drop is wrong under any reading.

## Suspected bugs
None.

## Tested and correct
- Elesh Norn, Mother of Machines: own Soul Warden triggers twice (life 22), opponent's doesn't; opponent's Wall of Omens: Hugo's Soul Warden twice, Wall's draw suppressed; Panharmonicon + Wall of Omens draws 3; Cathars' Crusade 2 counters each.
- Veyran: Guttersnipe + one Opt = 4 to each of 3 opponents, Veyran 4/4; Firebrand Archer + artifact spell not doubled; Niv-Mizzet, Parun: opp spell 1 draw, own spell 2; Storm-Kiln Artist + Narset's Reversal copying Opt counts the copy (Veyran 8/8, 6 Treasures, Opt to hand).
- Zhulodok: MV7 colorless from hand cascades twice; with Echoes of Eternity 4 times, token copy correctly doesn't cascade.
- Jodah: pump counts legendaries; trigger skips nonlegendary and equal-MV legendary, casts cheaper legendary free, rest to bottom; Annie Joins Up doubles it; Kellan, the Kid triggers off Jodah's free cast from exile.
- Urza's Tower + Planar Nexus taps for 3. Vorinclex, Monstrous Raider: own Wrenn and Seven 10 loyalty, opp's Ral, Crackling Wit 2. Grasp of Fate + Norn exiles 6 across 3 opponents, all return. It That Betrays + Portal to Phyrexia steals all 9. Void Winnower stops MV 0 and 2, allows 1. Emrakul, the Promised End costs 8 with 5 types. Elesh Norn (front) opp who can't pay {1} loses 2. Jin-Gitaxias, Progress Tyrant counters only first opp spell each turn. Kozilek, the Great Distortion draws to 7.

## Not tested, harness limits
- ~35 of 265 cards tested; ~120 low-risk skipped on purpose.
- High-risk not reached: Arcane Bombardment, Mizzix's Mastery + Veyran; Atraxa, Grand Unifier (script allows picking a two-type card twice: wastes a pick, not a rules break); Ulamog, the Ceaseless Hunger; Sire of Seven Deaths ward; Mirrorpool, Mirage Mirror, Vesuva copying Tron lands; Ugin, Eye of the Storms + Echoes of Eternity; Forsaken Monument; Jeska's Will (needs Commander game); Esika, Nicol Bolas, Dragon-God, The One Ring, Sauron, Urza's Saga, Desecrate Reality, Titan's Presence, Not of This World.
- Harness limits: `playUntilStackClear` stops before pending triggers; `moveToPlay` without cause fires no ETB; `SpellAbility.canPlay()` ignores "can't be cast" effects (real check `Spell.checkRestrictions`, Spell.java:122-125); AI may activate abilities while the stack resolves; token names end in "Token".
- Human UI path not verified (bugs are in card scripts, expected identical).
